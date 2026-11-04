import type {
  AdminBalance,
  CursorPage,
  ProductDraft,
  PurchaseFulfillmentChoice,
  PurchaseResult,
  RewardFulfillment,
  ShopAdminCollection,
  ShopAdminState,
  ShopLocation,
  ShopProduct,
  ShopPurchase,
  ShopSnapshot,
  SpendableSparkType,
} from '@/models/shop';
import type { FulfillmentContact } from '@/models';
import { ApiClientError, apiRequest, createIdempotencyKey } from './apiClient';
import { ShopServiceError } from './shopErrors';

export interface ShopClientIdentity {
  id: string;
  email: string;
  role: string;
}

const request = async <T>(
  path: string,
  init?: RequestInit & { idempotencyKey?: string; retries?: number },
): Promise<T> => {
  try {
    return await apiRequest<T>(path, init);
  } catch (error) {
    if (error instanceof ApiClientError)
      throw new ShopServiceError(error.message, error.code, error.status, error.details);
    throw error;
  }
};

type AdminCollectionItem = ShopProduct | ShopPurchase | AdminBalance | RewardFulfillment;
const loadAdminCollection = (collection: ShopAdminCollection, cursor?: string | null) =>
  request<CursorPage<AdminCollectionItem>>(`/api/v1/admin/shop/${collection}?limit=50${
    cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);

const getAdminState = async (): Promise<ShopAdminState> => {
  const [products, purchases, balances, fulfillments, fulfillmentContacts] = await Promise.all([
    loadAdminCollection('products'),
    loadAdminCollection('purchases'),
    loadAdminCollection('balances'),
    loadAdminCollection('fulfillments'),
    request<FulfillmentContact[]>('/api/v1/reward-fulfillment-contacts'),
  ]);
  return {
    products: products.items as ShopProduct[],
    purchases: purchases.items as ShopPurchase[],
    balances: balances.items as AdminBalance[],
    fulfillments: fulfillments.items as RewardFulfillment[],
    fulfillmentContacts,
    pageInfo: {
      products: { nextCursor: products.nextCursor, hasNext: products.hasNext },
      purchases: { nextCursor: purchases.nextCursor, hasNext: purchases.hasNext },
      balances: { nextCursor: balances.nextCursor, hasNext: balances.hasNext },
      fulfillments: { nextCursor: fulfillments.nextCursor, hasNext: fulfillments.hasNext },
    },
  };
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
  getAdminState: (_identity?: ShopClientIdentity) => getAdminState(),
  loadAdminCollection: (collection: ShopAdminCollection, cursor: string, _identity?: ShopClientIdentity) =>
    loadAdminCollection(collection, cursor),
  saveProduct: async (product: ProductDraft, _identity?: ShopClientIdentity) => {
    await request<unknown>('/api/shop/admin/products', {
      method: 'POST',
      idempotencyKey: createIdempotencyKey(),
      body: JSON.stringify(product),
    });
    return getAdminState();
  },
  deleteProduct: async (productId: string, _identity?: ShopClientIdentity) => {
    await request<unknown>(`/api/shop/admin/products/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
      idempotencyKey: createIdempotencyKey(),
    });
    return getAdminState();
  },
  adjustBalance: async (
    userId: string,
    sparkType: SpendableSparkType,
    amount: number,
    reason: string,
    _identity?: ShopClientIdentity,
  ) => {
    await request<unknown>('/api/shop/admin/balances/adjust', {
      method: 'POST',
      idempotencyKey: createIdempotencyKey(),
      body: JSON.stringify({ userId, sparkType, amount, reason }),
    });
    return getAdminState();
  },
  updateFulfillmentStatus: async (id: string, status: string, notes: string, _identity?: ShopClientIdentity) => {
    await request(`/api/v1/admin/reward-fulfillments/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      idempotencyKey: createIdempotencyKey(),
      body: JSON.stringify({ status, notes: notes || undefined }),
    });
    return getAdminState();
  },
  uploadProductImage: async (file: File, _identity?: ShopClientIdentity) => {
    const form = new FormData();
    form.append('image', file);
    return request<{ imageUrl: string }>('/api/shop/admin/images', {
      method: 'POST',
      idempotencyKey: createIdempotencyKey(),
      retries: 0,
      body: form,
    });
  },
};
