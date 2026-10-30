import type {
  ProductDraft,
  PurchaseFulfillmentChoice,
  PurchaseResult,
  ShopAdminState,
  ShopLocation,
  ShopSnapshot,
  SpendableSparkType,
} from '@/models/shop';
import { ApiClientError, apiRequest, createIdempotencyKey } from './apiClient';
import { ShopServiceError } from './shopErrors';

export interface ShopClientIdentity {
  id: string;
  email: string;
  role: string;
}

const request = async <T>(
  path: string,
  init?: RequestInit & { idempotencyKey?: string },
): Promise<T> => {
  try {
    return await apiRequest<T>(path, init);
  } catch (error) {
    if (error instanceof ApiClientError)
      throw new ShopServiceError(error.message, error.code, error.status, error.details);
    throw error;
  }
};

export const apiShopService = {
  getSnapshot: (_identity?: ShopClientIdentity, location?: ShopLocation) =>
    request<ShopSnapshot>(`/api/shop${location ? `?location=${encodeURIComponent(location)}` : ''}`),
  purchase: (productId: string, _identity?: ShopClientIdentity, requestId = createIdempotencyKey(), fulfillment?: PurchaseFulfillmentChoice, location?: ShopLocation) =>
    request<PurchaseResult>('/api/shop/purchase', {
      method: 'POST',
      idempotencyKey: requestId,
      body: JSON.stringify({ productId, requestId, fulfillment, location }),
    }),
  activate: (inventoryId: string, _identity?: ShopClientIdentity) =>
    request<ShopSnapshot>(`/api/shop/inventory/${encodeURIComponent(inventoryId)}/activate`, {
      method: 'POST',
      idempotencyKey: createIdempotencyKey(),
      body: JSON.stringify({}),
    }),
  getAdminState: (_identity?: ShopClientIdentity) => request<ShopAdminState>('/api/shop/admin'),
  saveProduct: (product: ProductDraft, _identity?: ShopClientIdentity) =>
    request<ShopAdminState>('/api/shop/admin/products', {
      method: 'POST',
      idempotencyKey: createIdempotencyKey(),
      body: JSON.stringify(product),
    }),
  deleteProduct: (productId: string, _identity?: ShopClientIdentity) =>
    request<ShopAdminState>(`/api/shop/admin/products/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
      idempotencyKey: createIdempotencyKey(),
    }),
  adjustBalance: (
    userId: string,
    sparkType: SpendableSparkType,
    amount: number,
    reason: string,
    _identity?: ShopClientIdentity,
  ) => request<ShopAdminState>('/api/shop/admin/balances/adjust', {
    method: 'POST',
    idempotencyKey: createIdempotencyKey(),
    body: JSON.stringify({ userId, sparkType, amount, reason }),
  }),
  updateFulfillmentStatus: async (id: string, status: string, notes: string, identity?: ShopClientIdentity) => {
    await request(`/api/v1/admin/reward-fulfillments/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      idempotencyKey: createIdempotencyKey(),
      body: JSON.stringify({ status, notes: notes || undefined }),
    });
    return apiShopService.getAdminState(identity);
  },
  uploadProductImage: async (file: File, _identity?: ShopClientIdentity) => {
    const form = new FormData();
    form.append('image', file);
    return request<{ imageUrl: string }>('/api/shop/admin/images', {
      method: 'POST',
      idempotencyKey: createIdempotencyKey(),
      body: form,
    });
  },
};
