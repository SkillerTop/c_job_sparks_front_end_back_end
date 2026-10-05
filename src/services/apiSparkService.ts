import type {
  AppSnapshot,
  AwardInput,
  AwardRequest,
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

const workspace = async () => {
  currentWorkspace = await apiRequest<AppSnapshot>('/api/v1/workspace');
  return currentWorkspace;
};

const categoryId = (name: string, sparkType?: SparkType) => {
  const category = currentWorkspace?.categories.find(
    (item) => item.active && item.name === name && (!sparkType || item.sparkType === sparkType),
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

  async syncShopTransactions(_employeeId: string, _shopTransactions: ShopSparkTransaction[]) {
    return workspace();
  },

  async createRecognition(_senderId: string, _role: Role, input: RecognitionInput) {
    const recognition = await mutation<PeerRecognition>('/api/v1/recognitions', {
      recipientId: input.recipientId,
      categoryId: categoryId(input.category, 'White'),
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
      categoryId: input.sparkType === 'Radiant' ? undefined : categoryId(input.category, input.sparkType),
      description: input.description,
      radiantReason: input.sparkType === 'Radiant' ? input.category : undefined,
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

  reset() {
    if (!currentWorkspace) throw new Error('The workspace has not loaded yet.');
    return structuredClone(currentWorkspace);
  },
};
