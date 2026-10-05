export interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

const viteEnvironment = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;
const API_BASE_URL = (viteEnvironment?.VITE_API_BASE_URL || '').replace(/\/$/, '');

export const createIdempotencyKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const apiRequest = async <T>(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> => {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (init.idempotencyKey) headers.set('Idempotency-Key', init.idempotencyKey);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers,
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T & ApiErrorBody) : (undefined as T);
  if (!response.ok) {
    const error = (body ?? {}) as ApiErrorBody;
    throw new ApiClientError(
      error.message || 'The server operation could not be completed.',
      response.status,
      error.code,
      error.details,
      error.requestId,
    );
  }
  return body;
};

export const isApiMode = viteEnvironment?.VITE_APP_MODE === 'api';
