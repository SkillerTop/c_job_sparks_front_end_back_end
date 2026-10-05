import type {
  ProductDraft,
  PurchaseResult,
  ShopAdminState,
  ShopSnapshot,
  SpendableSparkType,
} from '@/models/shop';
import { demoShopService } from './demoShopService';
import { ShopServiceError } from './shopErrors';

export { ShopServiceError } from './shopErrors';

interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export interface ShopClientIdentity {
  id: string;
  email: string;
  role: string;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers,
  });
  const body = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    throw new ShopServiceError(
      body.message || 'The shop operation could not be completed.',
      body.code,
      response.status,
      body.details,
    );
  }
  return body;
};

const makeRequestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const apiShopService = {
  getSnapshot: (_identity?: ShopClientIdentity) => request<ShopSnapshot>('/api/shop'),
  purchase: (productId: string, identity?: ShopClientIdentity, requestId = makeRequestId()) =>
    request<PurchaseResult>('/api/shop/purchase', {
      method: 'POST',
      body: JSON.stringify({ productId, requestId }),
    }),
  activate: (inventoryId: string, _identity?: ShopClientIdentity) =>
    request<ShopSnapshot>(`/api/shop/inventory/${encodeURIComponent(inventoryId)}/activate`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  getAdminState: (_identity?: ShopClientIdentity) => request<ShopAdminState>('/api/shop/admin'),
  saveProduct: (product: ProductDraft, _identity?: ShopClientIdentity) =>
    request<ShopAdminState>('/api/shop/admin/products', {
      method: 'POST',
      body: JSON.stringify(product),
    }),
  adjustBalance: (
    userId: string,
    sparkType: SpendableSparkType,
    amount: number,
    reason: string,
    _identity?: ShopClientIdentity,
  ) =>
    request<ShopAdminState>('/api/shop/admin/balances/adjust', {
      method: 'POST',
      body: JSON.stringify({ userId, sparkType, amount, reason }),
    }),
  uploadProductImage: async (file: File, _identity?: ShopClientIdentity) => {
    const form = new FormData();
    form.append('image', file);
    return request<{ imageUrl: string }>('/api/shop/admin/images', { method: 'POST', body: form });
  },
};

export const shopService = import.meta.env.VITE_SHOP_MODE === 'api' ? apiShopService : demoShopService;
