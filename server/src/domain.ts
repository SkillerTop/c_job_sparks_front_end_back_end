export const ROLES = [
  'Employee',
  'Coordinator',
  'GPM',
  'Head',
  'Top Management',
  'Administrator',
] as const;

export type Role = (typeof ROLES)[number];

export const SPARK_TYPES = ['White', 'Yellow', 'Blue', 'Radiant'] as const;
export type SparkType = (typeof SPARK_TYPES)[number];
export type SpendableSparkType = Exclude<SparkType, 'Radiant'>;

export const ACCOUNT_STATUSES = ['Pending', 'Approved', 'Rejected', 'Disabled'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export interface AuthenticatedPrincipal {
  userId: string;
  accountId: string;
  employeeId: string;
  email: string;
  role: Role;
  departmentId: string;
  sessionId: string;
}

export interface EffectiveRuleSet {
  currentQuarter: string;
  whiteToYellow: number;
  yellowToBlue: number;
  conversionFee: number;
  yellowQuarterlyLimit: number;
  peerBaseLimit: number;
  coordinatorTeamMultiplier: number;
  disenchantRate: number;
  currency: 'EUR' | 'USD' | 'GBP';
  sparkMoneyValues: Record<SpendableSparkType, number>;
}

export const quarterForDate = (input: Date | string = new Date()) => {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date.');
  return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
};

export const quarterBounds = (quarter: string) => {
  const match = /^Q([1-4]) (\d{4})$/.exec(quarter);
  if (!match) throw new Error('Invalid quarter.');
  const quarterNumber = Number(match[1]);
  const year = Number(match[2]);
  const start = new Date(Date.UTC(year, (quarterNumber - 1) * 3, 1));
  const end = new Date(Date.UTC(year, quarterNumber * 3, 1));
  return { start, end };
};

export const conversionFor = (
  from: SparkType,
  amount: number,
  rules: Pick<EffectiveRuleSet, 'whiteToYellow' | 'yellowToBlue' | 'conversionFee'>,
) => {
  const target = from === 'White' ? 'Yellow' : from === 'Yellow' ? 'Blue' : null;
  const ratio = from === 'White' ? rules.whiteToYellow : from === 'Yellow' ? rules.yellowToBlue : null;
  if (!target || !ratio) throw new Error('Only White to Yellow and Yellow to Blue conversions are allowed.');
  if (!Number.isInteger(amount) || amount <= 0 || amount % ratio !== 0)
    throw new Error(`Amount must be a positive multiple of ${ratio}.`);
  const output = amount / ratio;
  const fee = output * rules.conversionFee;
  return { from, to: target as SpendableSparkType, amount, output, fee, totalDebit: amount + fee };
};

export const peerRecognitionQuota = (
  role: Role,
  peerBaseLimit: number,
  sharedWorkedColleagueCount: number,
  coordinatorTeamMultiplier: number,
) =>
  peerBaseLimit +
  (role === 'Coordinator'
    ? Math.floor(sharedWorkedColleagueCount / Math.max(1, coordinatorTeamMultiplier))
    : 0);

export const gpmWhiteQuota = (controlledCoordinatorCount: number, coordinatorTeamMultiplier: number) =>
  controlledCoordinatorCount > 0
    ? Math.ceil(controlledCoordinatorCount / Math.max(1, coordinatorTeamMultiplier))
    : 0;

export const validateRuleSet = (rules: EffectiveRuleSet) => {
  const positiveIntegers = [
    rules.whiteToYellow,
    rules.yellowToBlue,
    rules.yellowQuarterlyLimit,
    rules.peerBaseLimit,
    rules.coordinatorTeamMultiplier,
  ];
  if (!positiveIntegers.every((value) => Number.isInteger(value) && value > 0))
    throw new Error('Conversion ratios and limits must be positive integers.');
  if (!Number.isInteger(rules.conversionFee) || rules.conversionFee < 0)
    throw new Error('Conversion fee must be a non-negative integer.');
  if (!(rules.disenchantRate > 0 && rules.disenchantRate <= 1))
    throw new Error('Disenchant rate must be greater than zero and at most one.');
  if (!/^Q[1-4] \d{4}$/.test(rules.currentQuarter)) throw new Error('Current quarter is invalid.');
  if (!['EUR', 'USD', 'GBP'].includes(rules.currency)) throw new Error('Currency is not supported.');
  for (const value of Object.values(rules.sparkMoneyValues)) {
    if (!Number.isFinite(value) || value <= 0) throw new Error('Spark money values must be positive.');
  }
  return rules;
};

export const canUseMemberEconomy = (role: Role) =>
  role === 'Employee' || role === 'Coordinator' || role === 'GPM' || role === 'Head';

export const canPurchase = canUseMemberEconomy;

export const allowedAwardTypes = (role: Role): readonly SparkType[] => {
  if (role === 'Coordinator') return ['Yellow'];
  if (role === 'GPM') return ['White', 'Yellow'];
  if (role === 'Head') return ['White', 'Yellow', 'Blue'];
  if (role === 'Top Management') return ['Radiant'];
  return [];
};

export const assertIsoDateRange = (startDate: string, endDate: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate))
    throw new Error('Dates must use YYYY-MM-DD.');
  if (endDate < startDate) throw new Error('End date must not precede start date.');
};
