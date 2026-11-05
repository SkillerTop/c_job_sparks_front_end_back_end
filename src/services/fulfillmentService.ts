import type { CursorPage, RewardFulfillment } from '@/models/shop';
import { apiRequest, createIdempotencyKey } from './apiClient';

export const fulfillmentService = {
  list(cursor?: string | null) {
    return apiRequest<CursorPage<RewardFulfillment>>(
      `/api/v1/reward-fulfillments?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
  },
  update(id: string, status: RewardFulfillment['status'], notes: string) {
    return apiRequest<{ id: string; status: RewardFulfillment['status'] }>(
      `/api/v1/reward-fulfillments/${encodeURIComponent(id)}/status`,
      {
        method: 'POST',
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify({ status, notes: notes.trim() || undefined }),
      },
    );
  },
};
