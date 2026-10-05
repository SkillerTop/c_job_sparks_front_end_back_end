import { ALL_ROLES, PEER_RECOGNITION_ROLES } from '@/constants/app';
import { DEMO_ROLE_ACTORS, initialSnapshot } from '@/data/mockData';
import type {
  AppSnapshot,
  AwardInput,
  ImportPreview,
  QualityGateInput,
  RecognitionInput,
  ReferenceDraft,
  Role,
  SparkType,
} from '@/models';
import type { ShopSparkTransaction } from '@/models/shop';
import { selectAwardTargets, selectGpmControlledCoordinators } from '@/models/selectors';
import {
  calculateBalances,
  conversionRule,
  isQualityGateActive,
  kpiReward,
  evaluationReward,
  gpmWhiteAwardQuota,
  recognitionQuota,
} from '@/utils/sparkRules';
import { makeId } from '@/utils/formatters';
import { isValidIsoDate, quarterForDate, todayIso } from '@/utils/quarter';
import { parseCsv } from '@/utils/parseCsv';

const createDatabase = () => {
  const snapshot = structuredClone(initialSnapshot);
  snapshot.settings.currentQuarter = quarterForDate(new Date());
  snapshot.transactions.forEach((item) => {
    item.departmentId = snapshot.employees.find((employee) => employee.id === item.employeeId)?.departmentId;
    item.categoryId = snapshot.categories.find(
      (category) => category.name === item.category && category.sparkType === item.sparkType,
    )?.id;
  });
  snapshot.awardRequests.forEach((item) => {
    item.categoryId = snapshot.categories.find(
      (category) => category.name === item.category && category.sparkType === item.sparkType,
    )?.id;
  });
  snapshot.recognitions.forEach((item) => {
    item.categoryId = snapshot.categories.find(
      (category) => category.name === item.category && category.sparkType === 'White',
    )?.id;
  });
  return snapshot;
};
let database: AppSnapshot = createDatabase();
const wait = (milliseconds = 420) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const clone = () => {
  database.settings.currentQuarter = quarterForDate(new Date());
  return structuredClone(database);
};
const importPreviews = new Map<string, ImportPreview>();
const importKindLabel = (kind: ImportPreview['kind']) =>
  kind === 'KPI' ? 'KPI' : 'Personal cards reward';

const employeeName = (id: string) =>
  database.employees.find((employee) => employee.id === id)?.name ?? 'Unknown user';
const categoryMatches = (
  item: { categoryId?: string; category: string },
  categoryId: string | undefined,
  name: string,
) => (item.categoryId && categoryId ? item.categoryId === categoryId : item.category === name);
const requireActor = (actorId: string, roles: Role[]) => {
  database.settings.currentQuarter = quarterForDate(new Date());
  const actor = database.employees.find((employee) => employee.id === actorId && employee.active);
  if (!actor || !roles.includes(actor.role)) throw new Error('Your active role cannot perform this action.');
  return actor;
};

const requireHeadScope = (actorId: string, employeeId: string, allowInactive = false) => {
  const actor = requireActor(actorId, ['Head']);
  const employee = database.employees.find(
    (item) => item.id === employeeId && (item.active || allowInactive),
  );
  if (!employee || employee.departmentId !== actor.departmentId)
    throw new Error('This employee is outside your department scope.');
};

function atomic<T>(action: () => T): T {
  const before = clone();
  try {
    return action();
  } catch (error) {
    database = before;
    throw error;
  }
}

const hasImported = (employeeId: string, kind: ImportPreview['kind'], quarter: string) => {
  const record = database.performance.find(
    (item) => item.employeeId === employeeId && item.quarter === quarter,
  );
  const recorded =
    kind === 'KPI'
      ? record?.kpiImported || (record?.kpi ?? 0) > 0
      : record?.evaluationImported || (record?.evaluation ?? 0) > 0;
  const source = kind === 'KPI' ? 'KPI' : 'Personal Cards Reward';
  return Boolean(
    recorded ||
    database.transactions.some(
      (item) => item.employeeId === employeeId && item.source === source && item.quarter === quarter,
    ),
  );
};

const addAudit = (action: string, actorId: string, subjectId: string, details: string) => {
  database.auditEvents.unshift({
    id: makeId('audit'),
    action,
    actorId,
    subjectId,
    dateTime: new Date().toISOString(),
    details,
  });
};

const addTransaction = (input: Omit<AppSnapshot['transactions'][number], 'id' | 'dateTime' | 'status'>) => {
  if (
    input.sparkType === 'White' &&
    input.amount > 0 &&
    isQualityGateActive(input.employeeId, database.qualityGates)
  )
    throw new Error('White credit is blocked by an active Quality Gate.');
  if (input.sparkType === 'Radiant' && input.amount < 0)
    throw new Error('Radiant Sparks are permanent and cannot be spent.');
  const transaction = {
    ...input,
    departmentId:
      input.departmentId ??
      database.employees.find((employee) => employee.id === input.employeeId)?.departmentId,
    categoryId:
      input.categoryId ??
      database.categories.find(
        (category) => category.name === input.category && category.sparkType === input.sparkType,
      )?.id,
    id: makeId('txn'),
    dateTime: new Date().toISOString(),
    status: 'Completed' as const,
  };
  database.transactions.unshift(transaction);
  addAudit(
    'LEDGER_TRANSACTION_CREATED',
    input.approvedBy ?? input.awardedBy ?? input.employeeId,
    transaction.id,
    `${input.amount > 0 ? '+' : ''}${input.amount} ${input.sparkType} · ${input.source}`,
  );
  return transaction;
};

const addAchievement = (input: {
  employeeId: string;
  sparkType: SparkType;
  category: string;
  description: string;
  awardedBy: string;
}) => {
  database.achievements.unshift({
    id: makeId('ach'),
    employeeId: input.employeeId,
    title: input.category,
    description: input.description,
    sparkType: input.sparkType,
    category: input.category,
    date: new Date().toISOString(),
    awardedBy: input.awardedBy,
  });
};

const validateDirectYellow = (
  employeeId: string,
  amount: number,
  category: string,
  excludeRequestId?: string,
  stableCategoryId?: string,
) => {
  const { currentQuarter, yellowQuarterlyLimit } = database.settings;
  const categoryId =
    stableCategoryId ??
    database.categories.find((item) => item.sparkType === 'Yellow' && item.name === category)?.id;
  const directSources = ['Coordinator Award', 'GPM Award', 'Head of Department Award'];
  const directTotal = database.transactions
    .filter(
      (item) =>
        item.employeeId === employeeId &&
        item.sparkType === 'Yellow' &&
        item.quarter === currentQuarter &&
        directSources.includes(item.source) &&
        item.amount > 0,
    )
    .reduce((total, item) => total + item.amount, 0);
  const pending = database.awardRequests.filter(
    (item) =>
      item.id !== excludeRequestId &&
      item.employeeId === employeeId &&
      item.sparkType === 'Yellow' &&
      item.status === 'Pending' &&
      quarterForDate(item.createdAt) === currentQuarter &&
      directSources.includes(item.source),
  );
  const reserved = pending.reduce((total, item) => total + item.amount, 0);
  if (directTotal + reserved + amount > yellowQuarterlyLimit)
    throw new Error(
      `This award would exceed the ${yellowQuarterlyLimit} Yellow quarterly limit, including pending requests.`,
    );
  const duplicate = database.transactions.some(
    (item) =>
      item.employeeId === employeeId &&
      item.sparkType === 'Yellow' &&
      item.quarter === currentQuarter &&
      categoryMatches(item, categoryId, category) &&
      item.amount > 0,
  );
  const pendingDuplicate = pending.some((item) => categoryMatches(item, categoryId, category));
  if (duplicate || pendingDuplicate)
    throw new Error('This Yellow category is already awarded or pending for the current quarter.');
};

const validateBlue = (employeeId: string, category: string) => {
  const year = database.settings.currentQuarter.slice(-4);
  const definition = database.categories.find((item) => item.sparkType === 'Blue' && item.name === category)!;
  const duplicate = database.transactions.some(
    (item) =>
      item.employeeId === employeeId &&
      item.sparkType === 'Blue' &&
      categoryMatches(item, definition.id, category) &&
      (definition.period === 'One-time' ||
        (definition.period === 'Yearly' && item.quarter.endsWith(year)) ||
        (definition.period === 'Quarterly' && item.quarter === database.settings.currentQuarter)) &&
      item.amount > 0,
  );
  if (duplicate)
    throw new Error(
      `This Blue category is already awarded for its ${definition.period.toLowerCase()} period.`,
    );
  if (definition.id === 'blue-0') {
    const departmentId = database.employees.find((employee) => employee.id === employeeId)!.departmentId;
    const employeeIds = new Set(
      database.employees
        .filter(
          (employee) =>
            employee.departmentId === departmentId && employee.active && employee.role !== 'Administrator',
        )
        .map((employee) => employee.id),
    );
    const quota = Math.floor(employeeIds.size / 10);
    const used = database.transactions.filter(
      (item) =>
        item.sparkType === 'Blue' &&
        categoryMatches(item, definition.id, category) &&
        item.quarter.endsWith(year) &&
        item.departmentId === departmentId &&
        item.amount > 0,
    ).length;
    if (used >= quota)
      throw new Error(
        `Employee of the Year quota is ${quota} for ${employeeIds.size} active department employees (one per ten).`,
      );
  }
};

export const sparkService = {
  async getSnapshot() {
    await wait(560);
    return clone();
  },

  async syncShopTransactions(employeeId: string, shopTransactions: ShopSparkTransaction[]) {
    requireActor(employeeId, ['Employee', 'Coordinator', 'GPM', 'Head', 'Top Management', 'Administrator']);
    return atomic(() => {
      for (const item of [...shopTransactions].reverse()) {
        const id = `shop-${item.id}`;
        if (database.transactions.some((transaction) => transaction.id === id)) continue;
        if (
          !['White', 'Yellow', 'Blue'].includes(item.sparkType) ||
          !['purchase', 'refund', 'adjustment'].includes(item.transactionType) ||
          !Number.isInteger(item.amount) ||
          item.amount === 0 ||
          !Number.isFinite(Date.parse(item.createdAt))
        )
          throw new Error('The Reward Shop returned an invalid Spark transaction.');
        if (item.transactionType === 'purchase' && item.amount >= 0)
          throw new Error('A Reward Shop purchase must be a Spark debit.');
        if (item.transactionType === 'refund' && item.amount <= 0)
          throw new Error('A Reward Shop refund must be a Spark credit.');
        database.transactions.unshift({
          id,
          employeeId,
          departmentId: database.employees.find((employee) => employee.id === employeeId)?.departmentId,
          dateTime: item.createdAt,
          sparkType: item.sparkType,
          amount: item.amount,
          transactionType: item.amount > 0 ? 'Credit' : 'Debit',
          source: 'Reward Shop',
          category: item.transactionType === 'purchase'
            ? 'Reward purchase'
            : item.transactionType === 'refund'
              ? 'Reward refund'
              : 'Shop adjustment',
          description: item.description,
          quarter: quarterForDate(item.createdAt),
          relatedRequestId: item.id,
          status: 'Completed',
        });
        addAudit(
          'SHOP_SPARK_TRANSACTION_SYNCED',
          employeeId,
          id,
          `${item.amount > 0 ? '+' : ''}${item.amount} ${item.sparkType} · ${item.description}`,
        );
      }
      return clone();
    });
  },

  async createRecognition(senderId: string, role: Role, input: RecognitionInput) {
    await wait();
    const sender = requireActor(senderId, PEER_RECOGNITION_ROLES);
    if (sender.role !== role) throw new Error('The selected demo role no longer matches this employee.');
    const recognitionCategory = database.categories.find(
      (category) => category.active && category.sparkType === 'White' && category.name === input.category,
    );
    if (!recognitionCategory || !input.description.trim())
      throw new Error('Choose a category and describe the contribution.');
    const recipient = database.employees.find(
      (employee) => employee.id === input.recipientId && employee.active,
    );
    if (!recipient || !['Employee', 'Coordinator', 'GPM'].includes(recipient.role))
      throw new Error('Choose an eligible active colleague.');
    if (senderId === input.recipientId) throw new Error('Self-recognition is not allowed.');
    const reservedThisQuarter = database.recognitions.filter(
      (item) =>
        item.senderId === senderId &&
        item.status !== 'Rejected' &&
        quarterForDate(item.createdAt) === database.settings.currentQuarter,
    ).length;
    const limit = recognitionQuota(
      senderId,
      role,
      database.settings,
      database.employees,
      database.projectTeams,
    );
    if (reservedThisQuarter >= limit)
      throw new Error('Your Peer Recognition allocation is already used or reserved for this quarter.');
    const recognition = {
      id: makeId('rec'),
      senderId,
      recipientId: input.recipientId,
      category: input.category,
      categoryId: recognitionCategory.id,
      description: input.description.trim(),
      createdAt: new Date().toISOString(),
      status: 'Pending' as const,
    };
    database.recognitions.unshift(recognition);
    addAudit(
      'RECOGNITION_CREATED',
      senderId,
      recognition.id,
      `Recognition for ${employeeName(input.recipientId)} created.`,
    );
    return { recognition, snapshot: clone() };
  },

  async reviewRecognition(id: string, decision: 'Approved' | 'Rejected', reason: string, approverId: string) {
    await wait();
    const recognition = database.recognitions.find((item) => item.id === id);
    if (!recognition || recognition.status !== 'Pending')
      throw new Error('This recognition is no longer pending.');
    requireHeadScope(approverId, recognition.recipientId, decision === 'Rejected');
    if (decision === 'Rejected' && !reason.trim()) throw new Error('A rejection reason is required.');
    if (decision === 'Approved' && isQualityGateActive(recognition.recipientId, database.qualityGates)) {
      throw new Error('Approval blocked: the recipient has an active Quality Gate.');
    }
    recognition.status = decision;
    recognition.rejectionReason = decision === 'Rejected' ? reason.trim() : undefined;
    if (decision === 'Approved') {
      addTransaction({
        employeeId: recognition.recipientId,
        sparkType: 'White',
        amount: 1,
        transactionType: 'Credit',
        source: 'Peer Recognition',
        category: recognition.category,
        categoryId: recognition.categoryId,
        description: recognition.description,
        awardedBy: recognition.senderId,
        approvedBy: approverId,
        quarter: database.settings.currentQuarter,
        relatedRequestId: recognition.id,
      });
      addAchievement({
        employeeId: recognition.recipientId,
        sparkType: 'White',
        category: recognition.category,
        description: recognition.description,
        awardedBy: recognition.senderId,
      });
    }
    addAudit(
      `RECOGNITION_${decision.toUpperCase()}`,
      approverId,
      recognition.id,
      reason || `Recognition ${decision.toLowerCase()}.`,
    );
    return clone();
  },

  async reviewAward(id: string, decision: 'Approved' | 'Rejected', reason: string, approverId: string) {
    await wait();
    const request = database.awardRequests.find((item) => item.id === id);
    if (!request || request.status !== 'Pending') throw new Error('This award request is no longer pending.');
    requireHeadScope(approverId, request.employeeId, decision === 'Rejected');
    if (
      decision === 'Approved' &&
      request.categoryId === 'yellow-acting-lead' &&
      database.employees.find((item) => item.id === request.employeeId)?.hasCoordinationExperience
    )
      throw new Error('This employee already has coordination experience.');
    if (decision === 'Rejected' && !reason.trim()) throw new Error('A rejection reason is required.');
    if (
      decision === 'Approved' &&
      request.sparkType === 'White' &&
      isQualityGateActive(request.employeeId, database.qualityGates)
    )
      throw new Error('Approval blocked: the recipient has an active Quality Gate.');
    if (decision === 'Approved' && request.sparkType === 'Yellow')
      validateDirectYellow(
        request.employeeId,
        request.amount,
        request.category,
        request.id,
        request.categoryId,
      );
    request.status = decision;
    request.rejectionReason = decision === 'Rejected' ? reason.trim() : undefined;
    if (decision === 'Approved') {
      addTransaction({
        employeeId: request.employeeId,
        sparkType: request.sparkType,
        amount: request.amount,
        transactionType: 'Credit',
        source: request.source,
        category: request.category,
        categoryId: request.categoryId,
        description: request.description,
        awardedBy: request.awardedBy,
        approvedBy: approverId,
        quarter: database.settings.currentQuarter,
        relatedRequestId: request.id,
      });
      addAchievement({
        employeeId: request.employeeId,
        sparkType: request.sparkType,
        category: request.category,
        description: request.description,
        awardedBy: request.awardedBy,
      });
    }
    addAudit(
      `AWARD_${decision.toUpperCase()}`,
      approverId,
      request.id,
      reason || `Award ${decision.toLowerCase()}.`,
    );
    return clone();
  },

  async createAward(actorId: string, role: Role, input: AwardInput) {
    await wait();
    const authorizedActor = requireActor(actorId, ['Coordinator', 'GPM', 'Head', 'Top Management']);
    if (authorizedActor.role !== role)
      throw new Error('The selected demo role no longer matches this employee.');
    if (role === 'Coordinator' && input.sparkType !== 'Yellow')
      throw new Error('Coordinators can only request Yellow awards.');
    if (role === 'GPM' && !['White', 'Yellow'].includes(input.sparkType))
      throw new Error('GPMs can only request White or Yellow awards.');
    if (role === 'Head' && input.sparkType === 'Radiant')
      throw new Error('Radiant awards are reserved for Top Management.');
    if (role === 'Top Management' && input.sparkType !== 'Radiant')
      throw new Error('Top Management uses this workspace for Radiant awards.');
    const freeRadiantReason = role === 'Top Management' && input.sparkType === 'Radiant';
    const category = input.category.trim();
    const definition = freeRadiantReason
      ? undefined
      : database.categories.find(
          (item) => item.active && item.name === category && item.sparkType === input.sparkType,
        );
    const recipient = database.employees.find(
      (employee) => employee.id === input.employeeId && employee.active,
    );
    const actor = database.employees.find((employee) => employee.id === actorId && employee.active);
    if (!recipient || !actor || recipient.role === 'Administrator')
      throw new Error('Choose an active employee with a business role.');
    if (freeRadiantReason && !category) throw new Error('Describe the reason for this Radiant award.');
    if (!freeRadiantReason && !definition)
      throw new Error(`Choose a configured ${input.sparkType} category.`);
    if (!input.description.trim()) throw new Error('Describe the specific achievement.');
    const amount = freeRadiantReason ? 1 : definition!.amount;
    if (!['Coordinator', 'GPM', 'Head', 'Top Management'].includes(role))
      throw new Error('Your active role cannot issue awards.');
    if (
      role === 'Coordinator' &&
      !selectAwardTargets(database, actorId, role).some((employee) => employee.id === recipient.id)
    )
      throw new Error(
        'Coordinators can award only colleagues in a shared active project who have recorded project hours.',
      );
    if (role === 'Head' && actor.departmentId !== recipient.departmentId)
      throw new Error('Heads can award only within their department.');
    if (definition?.id === 'yellow-acting-lead') {
      const employee = database.employees.find((item) => item.id === input.employeeId);
      if (employee?.hasCoordinationExperience)
        throw new Error('This employee already has coordination experience.');
    }
    if (role === 'GPM' && input.sparkType === 'White') {
      const controlledCount = selectGpmControlledCoordinators(database, actorId).length;
      const quota = gpmWhiteAwardQuota(
        controlledCount,
        database.settings.coordinatorTeamMultiplier,
      );
      const used = database.awardRequests.filter(
        (request) =>
          request.awardedBy === actorId &&
          request.sparkType === 'White' &&
          request.status !== 'Rejected' &&
          quarterForDate(request.createdAt) === database.settings.currentQuarter,
      ).length;
      if (used >= quota)
        throw new Error(
          `Your GPM White award allocation is used or reserved (${used}/${quota}) for this quarter.`,
        );
    }
    const pending = role === 'Coordinator' || role === 'GPM';
    if (input.sparkType === 'Yellow') validateDirectYellow(input.employeeId, amount, category);
    if (!pending && input.sparkType === 'Blue') validateBlue(input.employeeId, category);
    if (
      !pending &&
      input.sparkType === 'White' &&
      isQualityGateActive(input.employeeId, database.qualityGates)
    ) {
      throw new Error('White credit is blocked by the employee’s active Quality Gate.');
    }
    const source =
      role === 'Coordinator'
        ? 'Coordinator Award'
        : role === 'GPM'
          ? 'GPM Award'
          : role === 'Head'
            ? 'Head of Department Award'
            : 'Top Management Award';
    const request = {
      id: makeId('award'),
      employeeId: input.employeeId,
      awardedBy: actorId,
      sparkType: input.sparkType,
      amount,
      category,
      categoryId: definition?.id,
      description: input.description.trim(),
      createdAt: new Date().toISOString(),
      status: pending ? ('Pending' as const) : ('Approved' as const),
      source,
    };
    database.awardRequests.unshift(request);
    if (!pending) {
      addTransaction({
        employeeId: input.employeeId,
        sparkType: input.sparkType,
        amount,
        transactionType: 'Credit',
        source,
        category,
        description: input.description.trim(),
        awardedBy: actorId,
        approvedBy: actorId,
        quarter: database.settings.currentQuarter,
        relatedRequestId: request.id,
      });
      addAchievement({
        employeeId: input.employeeId,
        sparkType: input.sparkType,
        category,
        description: input.description.trim(),
        awardedBy: actorId,
      });
    }
    addAudit(
      'AWARD_CREATED',
      actorId,
      request.id,
      `${input.sparkType} award for ${employeeName(input.employeeId)} created.`,
    );
    return { request, snapshot: clone() };
  },

  async convert(employeeId: string, from: SparkType, amount: number) {
    await wait(650);
    requireActor(employeeId, ['Employee', 'Coordinator', 'GPM', 'Head', 'Top Management']);
    const rule = conversionRule(from, database.settings);
    if (!rule) throw new Error('Only White and Yellow Sparks can be converted.');
    if (!Number.isInteger(amount) || amount <= 0 || amount % rule.ratio !== 0)
      throw new Error(`Enter a positive multiple of ${rule.ratio}.`);
    const output = amount / rule.ratio;
    const feeAmount = output * rule.fee;
    const totalDebit = amount + feeAmount;
    const balances = calculateBalances(database.transactions, employeeId);
    if (balances[from] < totalDebit)
      throw new Error(`You only have ${balances[from]} ${from} Sparks available.`);
    const relatedId = makeId('conversion');
    addTransaction({
      employeeId,
      sparkType: from,
      amount: -totalDebit,
      transactionType: 'Debit',
      source: 'Conversion',
      category: `${from} to ${rule.to}`,
      description: `Converted ${amount} ${from} plus a ${feeAmount} ${from} fee to ${output} ${rule.to}. Total debited: ${totalDebit} ${from}.`,
      quarter: database.settings.currentQuarter,
      relatedRequestId: relatedId,
    });
    addTransaction({
      employeeId,
      sparkType: rule.to,
      amount: output,
      transactionType: 'Credit',
      source: 'Conversion',
      category: `${from} to ${rule.to}`,
      description: `Received from ${from} Spark conversion.`,
      quarter: database.settings.currentQuarter,
      relatedRequestId: relatedId,
    });
    addAudit(
      'SPARK_CONVERSION',
      employeeId,
      relatedId,
      `${totalDebit} ${from} debited to receive ${output} ${rule.to}, including a ${feeAmount} ${from} fee.`,
    );
    return { output, to: rule.to, fee: feeAmount, totalDebited: totalDebit, snapshot: clone() };
  },

  async disenchant(employeeId: string, sparkType: Exclude<SparkType, 'Radiant'>, amount: number) {
    await wait(720);
    const employee = requireActor(employeeId, ['Employee', 'Coordinator', 'GPM', 'Head', 'Top Management']);
    if (!['White', 'Yellow', 'Blue'].includes(sparkType))
      throw new Error('Radiant Sparks cannot be disenchanted.');
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('Enter a positive whole number of Sparks.');
    const balances = calculateBalances(database.transactions, employeeId);
    if (balances[sparkType] < amount)
      throw new Error(`You only have ${balances[sparkType]} ${sparkType} Sparks available.`);
    const base = database.settings.sparkMoneyValues[sparkType];
    const moneyValue = Math.round(base * amount * database.settings.disenchantRate * 100) / 100;
    const request = {
      id: makeId('dis'),
      employeeId,
      departmentId: employee.departmentId,
      sparkType,
      amount,
      rate: database.settings.disenchantRate,
      moneyValue,
      currency: database.settings.currency,
      createdAt: new Date().toISOString(),
      accountingPeriod: new Date().toISOString().slice(0, 7),
      status: 'Created' as const,
    };
    database.disenchantRequests.unshift(request);
    addTransaction({
      employeeId,
      sparkType,
      amount: -amount,
      transactionType: 'Debit',
      source: 'Disenchant',
      category: 'Disenchant request',
      description: `Created payout request at ${Math.round(request.rate * 100)}% of the configured value.`,
      quarter: database.settings.currentQuarter,
      relatedRequestId: request.id,
    });
    addAudit('DISENCHANT_CREATED', employeeId, request.id, `${amount} ${sparkType} disenchanted.`);
    return { request, snapshot: clone() };
  },

  async toggleQualityGate(employeeId: string, actorId: string, input?: QualityGateInput) {
    await wait();
    requireHeadScope(actorId, employeeId);
    const active = database.qualityGates.find(
      (gate) => gate.employeeId === employeeId && gate.status === 'Active' && gate.endDate >= todayIso(),
    );
    if (active) {
      active.status = 'Cancelled';
      addAudit('QUALITY_GATE_CANCELLED', actorId, employeeId, 'Quality Gate cancelled.');
    } else {
      if (
        !input ||
        !input.reason.trim() ||
        !isValidIsoDate(input.startDate) ||
        !isValidIsoDate(input.endDate) ||
        input.endDate < input.startDate ||
        input.startDate < todayIso() ||
        input.endDate < todayIso()
      )
        throw new Error('Provide valid dates that are not in the past, and a reason.');
      database.qualityGates.unshift({
        id: makeId('gate'),
        employeeId,
        startDate: input.startDate,
        endDate: input.endDate,
        reason: input.reason.trim(),
        createdBy: actorId,
        status: 'Active',
      });
      addAudit(
        input.startDate > todayIso() ? 'QUALITY_GATE_SCHEDULED' : 'QUALITY_GATE_ACTIVATED',
        actorId,
        employeeId,
        `${input.reason.trim()} · ${input.startDate} to ${input.endDate}`,
      );
    }
    return clone();
  },

  async previewImport(
    kind: 'KPI' | 'Evaluation',
    quarter: string,
    file: Pick<File, 'name' | 'text'>,
    actorId: string,
  ): Promise<ImportPreview> {
    requireActor(actorId, ['Administrator']);
    if (!/^Q[1-4] \d{4}$/.test(quarter)) throw new Error('Choose a valid quarter before uploading.');
    if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Choose a CSV file.');
    const table = parseCsv(await file.text());
    await wait(400);
    const headers = table[0].map((header) => header.toLowerCase().replace(/[^a-z]/g, ''));
    const employeeColumn = headers.findIndex((header) =>
      ['name', 'employee', 'employeeid', 'email'].includes(header),
    );
    const valueColumn = headers.findIndex((header) =>
      kind === 'KPI' ? header === 'kpi' : ['averagequartermark', 'evaluation'].includes(header),
    );
    if (employeeColumn < 0 || valueColumn < 0)
      throw new Error(
        `Expected Name (or Email) and ${kind === 'KPI' ? 'KPI' : 'Average Quarter Mark'} columns.`,
      );
    const seen = new Set<string>();
    const rows: ImportPreview['rows'] = table.slice(1).map((cells, index) => {
      const identity = (cells[employeeColumn] ?? '').trim();
      const rawValue = (cells[valueColumn] ?? '').trim();
      const employee = database.employees.find(
        (item) =>
          item.active &&
          [item.name, item.email, item.id].some((value) => value.toLowerCase() === identity.toLowerCase()),
      );
      const value = /^\d+(?:[.,]\d+)?$/.test(rawValue) ? Number(rawValue.replace(',', '.')) : Number.NaN;
      const row = {
        lineNumber: index + 2,
        employeeId: employee?.id,
        employee: (employee?.name ?? identity) || 'Missing employee',
        value: Number.isFinite(value) ? value : rawValue,
        reward: 0,
      };
      if (cells.length !== headers.length)
        return {
          ...row,
          status: 'Invalid',
          error: `Expected ${headers.length} columns but found ${cells.length}. Quote values containing the CSV delimiter.`,
        };
      if (!employee)
        return { ...row, status: 'Unknown', error: 'No active employee matches this name, email or ID.' };
      if (seen.has(employee.id))
        return { ...row, status: 'Invalid', error: 'This employee occurs more than once in the file.' };
      seen.add(employee.id);
      if (!Number.isFinite(value) || value < 0 || (kind === 'Evaluation' && value > 5))
        return {
          ...row,
          status: 'Invalid',
          error:
            kind === 'KPI'
              ? 'KPI must be a non-negative number.'
              : 'Personal cards score must be a number between 0 and 5.',
        };
      const blocked = isQualityGateActive(employee.id, database.qualityGates);
      return {
        ...row,
        reward: blocked
          ? 0
          : kind === 'KPI'
            ? kpiReward(Number(row.value))
            : evaluationReward(Number(row.value)),
        status: blocked ? 'Blocked' : 'Ready',
        error: blocked
          ? 'Active Quality Gate: raw performance is stored, White credit is blocked.'
          : undefined,
      };
    });
    const preview: ImportPreview = {
      id: makeId('preview'),
      kind,
      quarter,
      fileName: file.name,
      employeesFound: rows.filter((row) => row.employeeId).length,
      employeesNotFound: rows.filter((row) => row.status === 'Unknown').length,
      invalidValues: rows.filter((row) => row.status === 'Invalid').length,
      qualityGateActive: rows.filter((row) => row.status === 'Blocked').length,
      expectedWhiteSparks: rows.reduce((total, row) => total + row.reward, 0),
      duplicate: rows.some((row) => row.employeeId && hasImported(row.employeeId, kind, quarter)),
      rows,
    };
    importPreviews.clear();
    importPreviews.set(preview.id, structuredClone(preview));
    return preview;
  },

  async confirmImport(preview: ImportPreview, actorId: string, replace: boolean) {
    await wait(820);
    requireActor(actorId, ['Administrator']);
    const validated = importPreviews.get(preview.id);
    if (!validated)
      throw new Error('This preview has expired or was already imported. Upload the file again.');
    if (validated.employeesNotFound > 0 || validated.invalidValues > 0)
      throw new Error('Resolve all blocking import errors before confirmation.');
    const source = validated.kind === 'KPI' ? 'KPI' : 'Personal Cards Reward';
    const category = validated.kind === 'KPI' ? 'Quarterly KPI' : 'Personal Cards Reward';
    const batchId = makeId(`import-${validated.kind.toLowerCase()}`);
    const prepared = validated.rows.map((row) => {
      const employee = database.employees.find((item) => item.id === row.employeeId && item.active);
      if (!employee || typeof row.value !== 'number')
        throw new Error(`Employee data changed for ${row.employee}. Upload a fresh preview.`);
      const existing = hasImported(employee.id, validated.kind, validated.quarter);
      if (existing && !replace)
        throw new Error(
          `${row.employee} already has ${importKindLabel(validated.kind)} data for ${validated.quarter}. Review a replacement import.`,
        );
      const previousReward = database.transactions
        .filter(
          (transaction) =>
            transaction.employeeId === employee.id &&
            [source, `${source} Correction`].includes(transaction.source) &&
            transaction.quarter === validated.quarter &&
            transaction.status === 'Completed',
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      const reward = isQualityGateActive(employee.id, database.qualityGates)
        ? 0
        : validated.kind === 'KPI'
          ? kpiReward(row.value)
          : evaluationReward(row.value);
      if (calculateBalances(database.transactions, employee.id).White + reward - previousReward < 0)
        throw new Error(
          `${employee.name} has already spent the affected White Sparks. Replacement needs a reviewed adjustment policy.`,
        );
      return { employee, value: row.value, reward, previousReward, existing };
    });
    const result = atomic(() => {
      for (const row of prepared) {
        if (replace && row.previousReward > 0)
          addTransaction({
            employeeId: row.employee.id,
            sparkType: 'White',
            amount: -row.previousReward,
            transactionType: 'Debit',
            source: `${source} Correction`,
            category: 'Import replacement reversal',
            description: `Reversed the active ${importKindLabel(validated.kind)} credit for ${validated.quarter}. Historical rows remain unchanged.`,
            approvedBy: actorId,
            quarter: validated.quarter,
            relatedRequestId: batchId,
          });
        let performance = database.performance.find(
          (record) => record.employeeId === row.employee.id && record.quarter === validated.quarter,
        );
        if (!performance) {
          performance = {
            id: makeId('perf'),
            employeeId: row.employee.id,
            quarter: validated.quarter,
            kpi: 0,
            evaluation: 0,
            kpiReward: 0,
            evaluationReward: 0,
          };
          database.performance.push(performance);
        }
        if (validated.kind === 'KPI') {
          performance.kpi = row.value;
          performance.kpiReward = row.reward;
          performance.kpiImported = true;
        } else {
          performance.evaluation = row.value;
          performance.evaluationReward = row.reward;
          performance.evaluationImported = true;
        }
        if (row.reward > 0)
          addTransaction({
            employeeId: row.employee.id,
            sparkType: 'White',
            amount: row.reward,
            transactionType: 'Credit',
            source,
            category,
            description: `${validated.kind === 'KPI' ? 'KPI' : 'Personal cards'} value ${row.value} for ${validated.quarter}.`,
            approvedBy: actorId,
            quarter: validated.quarter,
            relatedRequestId: batchId,
          });
      }
      addAudit(
        prepared.some((row) => row.existing) ? 'IMPORT_REPLACED' : 'IMPORT_CONFIRMED',
        actorId,
        batchId,
        `${importKindLabel(validated.kind)} · ${validated.fileName} · ${validated.quarter} · ${prepared.length} employees`,
      );
      return clone();
    });
    importPreviews.delete(validated.id);
    return result;
  },

  async updateSettings(actorId: string, input: Partial<AppSnapshot['settings']>) {
    await wait();
    requireActor(actorId, ['Administrator']);
    const next = { ...database.settings, ...input };
    if (
      ![
        next.whiteToYellow,
        next.yellowToBlue,
        next.yellowQuarterlyLimit,
        next.peerBaseLimit,
        next.coordinatorTeamMultiplier,
      ].every((value) => Number.isInteger(value) && value > 0) ||
      !Number.isFinite(next.disenchantRate) ||
      next.disenchantRate <= 0 ||
      next.disenchantRate > 1
    )
      throw new Error(
        'Ratios and limits must be positive whole numbers; the rate must be between 0 and 100%.',
      );
    if (!Number.isInteger(next.conversionFee) || next.conversionFee < 0)
      throw new Error('The conversion fee must be a non-negative whole number.');
    if (
      !['White', 'Yellow', 'Blue'].every(
        (type) =>
          Number.isFinite(next.sparkMoneyValues[type as 'White' | 'Yellow' | 'Blue']) &&
          next.sparkMoneyValues[type as 'White' | 'Yellow' | 'Blue'] > 0,
      )
    )
      throw new Error('Each Spark base value must be a positive number.');
    if (!['EUR', 'USD', 'GBP'].includes(next.currency))
      throw new Error('Choose a supported demo currency: EUR, USD or GBP.');
    if (next.currentQuarter !== database.settings.currentQuarter)
      throw new Error('The current quarter follows the calendar and cannot be edited.');
    database.settings = next;
    addAudit('SETTINGS_UPDATED', actorId, 'spark-settings', `Updated: ${Object.keys(input).join(', ')}.`);
    return clone();
  },

  async saveReference(actorId: string, draft: ReferenceDraft) {
    await wait();
    requireActor(actorId, ['Administrator']);
    const item = structuredClone(draft.data);
    const isNew = !item.id;
    if (!item.name.trim()) throw new Error('A name is required.');
    item.name = item.name.trim();
    const collection = database[draft.kind];
    if (item.id && !collection.some((entry) => entry.id === item.id))
      throw new Error('This record no longer exists. Refresh the directory.');
    if (
      collection.some(
        (entry) =>
          entry.id !== item.id &&
          entry.name.toLowerCase() === item.name.toLowerCase() &&
          (draft.kind !== 'categories' ||
            ('sparkType' in entry && 'sparkType' in item && entry.sparkType === item.sparkType)),
      )
    )
      throw new Error('A record with this name already exists.');
    return atomic(() => {
      if (draft.kind === 'employees') {
        const employee = item as AppSnapshot['employees'][number];
        const department = database.departments.find((entry) => entry.id === employee.departmentId);
        if (!department || (employee.active && !department.active))
          throw new Error('Choose an active department.');
        if (!ALL_ROLES.includes(employee.role)) throw new Error('Choose a valid business role.');
        if (!employee.title.trim()) throw new Error('A job title is required.');
        employee.title = employee.title.trim();
        employee.email = employee.email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employee.email))
          throw new Error('Enter a valid email address.');
        if (
          database.employees.some(
            (entry) => entry.id !== employee.id && entry.email.toLowerCase() === employee.email,
          )
        )
          throw new Error('This email address is already in use.');
        const fixedRole = Object.entries(DEMO_ROLE_ACTORS).find(([, id]) => id === employee.id)?.[0];
        if (fixedRole && (!employee.active || employee.role !== fixedRole))
          throw new Error(
            'The six demo identities must keep their assigned role and active status. Other records are fully editable.',
          );
        if (
          employee.id &&
          database.departments.some(
            (entry) =>
              entry.headId === employee.id &&
              (!employee.active || employee.role !== 'Head' || entry.id !== employee.departmentId),
          )
        )
          throw new Error(
            'Assign a replacement department head before changing this employee’s role, department or active status.',
          );
        if (employee.managerId) {
          const manager = database.employees.find((entry) => entry.id === employee.managerId && entry.active);
          if (!manager || manager.id === employee.id)
            throw new Error('Choose another active employee as manager.');
          const visited = new Set([employee.id]);
          let cursor: typeof manager | undefined = manager;
          while (cursor) {
            if (visited.has(cursor.id))
              throw new Error('The manager relationship would create a reporting cycle.');
            visited.add(cursor.id);
            cursor = database.employees.find((entry) => entry.id === cursor?.managerId);
          }
        }
        employee.initials = employee.name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((word) => word[0])
          .join('')
          .toUpperCase();
        employee.id ||= makeId('emp');
        database.employees = isNew
          ? [...database.employees, employee]
          : database.employees.map((entry) => (entry.id === employee.id ? employee : entry));
      } else if (draft.kind === 'departments') {
        const department = item as AppSnapshot['departments'][number];
        if (
          !department.active &&
          database.employees.some((entry) => entry.active && entry.departmentId === department.id)
        )
          throw new Error('Move or deactivate this department’s active employees first.');
        if (
          department.headId &&
          !database.employees.some(
            (entry) =>
              entry.id === department.headId &&
              entry.active &&
              entry.role === 'Head' &&
              entry.departmentId === department.id,
          )
        )
          throw new Error(
            'A department head must be an active Head assigned to this department. You can leave the head unassigned while setting up a department.',
          );
        department.id ||= makeId('dep');
        database.departments = isNew
          ? [...database.departments, department]
          : database.departments.map((entry) => (entry.id === department.id ? department : entry));
      } else {
        const category = item as AppSnapshot['categories'][number];
        if (!['White', 'Yellow', 'Blue'].includes(category.sparkType))
          throw new Error('Choose a valid Spark type.');
        const existing = database.categories.find((entry) => entry.id === category.id);
        if (existing && existing.sparkType !== category.sparkType)
          throw new Error('A category’s Spark type is immutable. Create a new category instead.');
        if (
          !Number.isInteger(category.amount) ||
          category.amount < 1 ||
          category.amount > 100
        )
          throw new Error('Category amounts must be whole numbers from 1 to 100.');
        if (category.sparkType === 'Blue' && !['Quarterly', 'Yearly', 'One-time'].includes(category.period))
          throw new Error('Choose a Blue category period.');
        if (category.sparkType === 'Yellow') category.period = 'Quarterly';
        if (category.sparkType === 'White') category.period = 'Unrestricted';
        if (category.id === 'blue-0') category.period = 'Yearly';
        category.description = category.description.trim();
        category.id ||= makeId(`category-${category.sparkType.toLowerCase()}`);
        database.categories = isNew
          ? [...database.categories, category]
          : database.categories.map((entry) => (entry.id === category.id ? category : entry));
      }
      addAudit(
        `REFERENCE_${isNew ? 'CREATED' : 'UPDATED'}`,
        actorId,
        item.id,
        `${draft.kind}: ${item.name}. Historical transactions are unchanged.`,
      );
      return clone();
    });
  },

  reset() {
    database = createDatabase();
    importPreviews.clear();
    return clone();
  },
};
