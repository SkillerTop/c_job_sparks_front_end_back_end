import type {
  AppSnapshot,
  AwardInput,
  AwardRequest,
  DisenchantReportResult,
  ImportPreview,
  PeerRecognition,
  QualityGateInput,
  RecognitionInput,
  ReferenceDraft,
  Role,
  SparkType,
} from '@/models';
import type { ShopSparkTransaction } from '@/models/shop';
import { apiRequest, createIdempotencyKey } from './apiClient';

let currentWorkspace: AppSnapshot | null = null;
let currentSection = 'dashboard';

const workspace = async (section = currentSection) => {
  currentSection = section;
  currentWorkspace = await apiRequest<AppSnapshot>(`/api/v1/workspace?section=${encodeURIComponent(section)}`);
  return currentWorkspace;
};

const categoryId = (name: string, sparkType: SparkType, usageType: 'PeerRecognition' | 'Award') => {
  const category = currentWorkspace?.categories.find(
    (item) =>
      item.active && item.name === name && item.sparkType === sparkType && item.usageType === usageType,
  );
  if (!category) throw new Error('This category is no longer available. Refresh the page and choose again.');
  return category.id;
};

const mutation = <T>(path: string, body: unknown, method = 'POST') =>
  apiRequest<T>(path, {
    method,
    body: JSON.stringify(body),
    idempotencyKey: createIdempotencyKey(),
  });

export const apiSparkService = {
  getSnapshot: workspace,
  async getLayoutSnapshot() {
    return apiRequest<AppSnapshot>('/api/v1/workspace/layout');
  },

  async syncShopTransactions(employeeId: string, shopTransactions: ShopSparkTransaction[]) {
    if (!currentWorkspace) return workspace();
    const employee = currentWorkspace.employees.find((item) => item.id === employeeId);
    const replacementIds = new Set(shopTransactions.map((item) => item.id));
    const converted = shopTransactions.map((item) => ({
      id: item.id,
      employeeId,
      departmentId: employee?.departmentId,
      dateTime: item.createdAt,
      sparkType: item.sparkType,
      amount: item.amount,
      transactionType: item.amount >= 0 ? 'Credit' as const : 'Debit' as const,
      source: 'Reward Shop',
      category: item.description,
      description: item.description,
      quarter: `Q${Math.floor(new Date(item.createdAt).getUTCMonth() / 3) + 1} ${new Date(item.createdAt).getUTCFullYear()}`,
      relatedRequestId: item.relatedPurchaseId ?? undefined,
      status: 'Completed' as const,
    }));
    currentWorkspace = {
      ...currentWorkspace,
      transactions: [
        ...converted,
        ...currentWorkspace.transactions.filter((item) => !replacementIds.has(item.id)),
      ].sort((left, right) => right.dateTime.localeCompare(left.dateTime)),
    };
    return structuredClone(currentWorkspace);
  },

  async createRecognition(_senderId: string, _role: Role, input: RecognitionInput) {
    const recognition = await mutation<PeerRecognition>('/api/v1/recognitions', {
      recipientId: input.recipientId,
      categoryId: categoryId(input.category, 'White', 'PeerRecognition'),
      description: input.description,
    });
    return { recognition, snapshot: await workspace() };
  },

  async reviewRecognition(id: string, decision: 'Approved' | 'Rejected', reason: string, _approverId: string) {
    await mutation(`/api/v1/recognitions/${encodeURIComponent(id)}/decision`, { decision, reason });
    return workspace();
  },

  async reviewAward(id: string, decision: 'Approved' | 'Rejected', reason: string, _approverId: string) {
    await mutation(`/api/v1/award-requests/${encodeURIComponent(id)}/decision`, { decision, reason });
    return workspace();
  },

  async createAward(_actorId: string, _role: Role, input: AwardInput) {
    const request = await mutation<AwardRequest>('/api/v1/awards', {
      recipientId: input.employeeId,
      categoryId:
        input.sparkType === 'Radiant' ? undefined : categoryId(input.category, input.sparkType, 'Award'),
      description: input.description,
      radiantReason: input.sparkType === 'Radiant' ? input.category : undefined,
      fulfillmentContactId: input.sparkType === 'Radiant' ? input.fulfillmentContactId : undefined,
      radiantRewardKind: input.sparkType === 'Radiant' ? input.radiantRewardKind : undefined,
      valuablePrizeDescription: input.sparkType === 'Radiant' ? input.valuablePrizeDescription : undefined,
    });
    if (request.status !== 'Pending' && request.status !== 'Approved')
      throw new Error('The server returned an invalid new award status.');
    return { request: { ...request, status: request.status as 'Pending' | 'Approved' }, snapshot: await workspace() };
  },

  async convert(_employeeId: string, from: SparkType, amount: number) {
    const result = await mutation<{
      output: number;
      to: SparkType;
      fee: number;
      totalDebited: number;
    }>('/api/v1/conversions', { from, amount });
    return { ...result, snapshot: await workspace() };
  },

  async disenchant(_employeeId: string, sparkType: Exclude<SparkType, 'Radiant'>, amount: number) {
    const request = await mutation<AppSnapshot['disenchantRequests'][number]>('/api/v1/disenchant-requests', {
      sparkType,
      amount,
    });
    return { request, snapshot: await workspace() };
  },

  async exportDisenchantRequests(_actorId: string, requestIds: string[], exportReference: string) {
    const result = await mutation<{ fileName: string; csv: string }>(
      '/api/v1/admin/disenchant-requests/export',
      { requestIds, exportReference },
    );
    return { ...result, snapshot: await workspace() };
  },

  async markDisenchantPaid(_actorId: string, requestId: string) {
    await mutation(`/api/v1/admin/disenchant-requests/${encodeURIComponent(requestId)}/status`, {
      status: 'Paid',
    });
    return workspace();
  },

  async createMonthlyDisenchantReport(_actorId: string, reportMonth: string) {
    const report = await mutation<DisenchantReportResult>('/api/v1/department/disenchant-reports', { reportMonth });
    return { report, snapshot: await workspace() };
  },

  async toggleQualityGate(employeeId: string, _actorId: string, input?: QualityGateInput) {
    if (input) await mutation('/api/v1/quality-gates', { employeeId, ...input });
    else
      await apiRequest<void>(`/api/v1/quality-gates/${encodeURIComponent(employeeId)}/active`, {
        method: 'DELETE',
        idempotencyKey: createIdempotencyKey(),
      });
    return workspace();
  },

  async previewImport(
    kind: 'KPI' | 'Evaluation',
    quarter: string,
    file: Pick<File, 'name' | 'text'>,
    _actorId: string,
  ) {
    const form = new FormData();
    form.append('kind', kind);
    form.append('quarter', quarter);
    form.append('file', file as File, file.name);
    return apiRequest<ImportPreview>('/api/v1/admin/performance-imports/preview', { method: 'POST', body: form });
  },

  async confirmImport(preview: ImportPreview, _actorId: string, replace: boolean) {
    await mutation(`/api/v1/admin/performance-imports/${encodeURIComponent(preview.id)}/commit`, { replace });
    return workspace();
  },

  async updateSettings(_actorId: string, input: Partial<AppSnapshot['settings']>) {
    await mutation('/api/v1/admin/rule-sets', input);
    return workspace();
  },

  async saveReference(_actorId: string, draft: ReferenceDraft) {
    const route =
      draft.kind === 'employees'
        ? '/api/v1/admin/employees'
        : draft.kind === 'departments'
          ? '/api/v1/admin/departments'
          : '/api/v1/admin/spark-categories';
    const id = draft.data.id;
    await mutation(id ? `${route}/${encodeURIComponent(id)}` : route, draft.data, id ? 'PATCH' : 'POST');
    return workspace();
  },

  async deleteEmployee(_actorId: string, employeeId: string) {
    await apiRequest<void>(`/api/v1/admin/employees/${encodeURIComponent(employeeId)}`, { method: 'DELETE' });
    return workspace();
  },

  reset() {
    if (!currentWorkspace) throw new Error('The workspace has not loaded yet.');
    return structuredClone(currentWorkspace);
  },
};
