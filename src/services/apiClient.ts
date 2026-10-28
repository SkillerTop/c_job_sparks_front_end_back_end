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

export const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

const errorMessage = (error: ApiErrorBody) => {
  const issues = error.details?.issues;
  if (error.code === 'VALIDATION_ERROR' && Array.isArray(issues)) {
    const first = issues.find((issue): issue is { path?: unknown; message: string } =>
      Boolean(issue) && typeof issue === 'object' && typeof (issue as { message?: unknown }).message === 'string');
    if (first) return first.message;
  }
  return error.message || 'The server operation could not be completed.';
};

export const createIdempotencyKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type ApiRequestInit = RequestInit & {
  idempotencyKey?: string;
  timeoutMs?: number;
  retries?: number;
};

const retryableStatus = new Set([429, 502, 503, 504]);

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds));

const requestSignal = (signal: AbortSignal | null | undefined, timeoutMs: number) => {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
};

const retryDelay = (attempt: number, response?: Response) => {
  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1_000, 5_000);
  }
  return Math.min(250 * 2 ** attempt + Math.random() * 150, 2_000);
};

export const apiRequest = async <T>(
  path: string,
  init: ApiRequestInit = {},
): Promise<T> => {
  const { idempotencyKey, timeoutMs = 15_000, retries, ...requestInit } = init;
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
  const method = (requestInit.method ?? 'GET').toUpperCase();
  const safeToRetry = method === 'GET' || method === 'HEAD' || Boolean(idempotencyKey);
  const retryCount = safeToRetry ? (retries ?? (method === 'GET' || method === 'HEAD' ? 2 : 1)) : 0;

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(apiUrl(path), {
        credentials: 'include',
        ...requestInit,
        headers,
        signal: requestSignal(requestInit.signal, timeoutMs),
      });
      const text = await response.text();
      let body: (T & ApiErrorBody) | undefined;
      try {
        body = text ? (JSON.parse(text) as T & ApiErrorBody) : undefined;
      } catch {
        throw new ApiClientError('The server returned an invalid response.', response.status, 'INVALID_RESPONSE');
      }
      if (response.ok) return body as T;
      if (attempt < retryCount && retryableStatus.has(response.status)) {
        await delay(retryDelay(attempt, response));
        continue;
      }
      const error = (body ?? {}) as ApiErrorBody;
      throw new ApiClientError(
        errorMessage(error),
        response.status,
        error.code,
        error.details,
        error.requestId,
      );
    } catch (error) {
      if (
        attempt < retryCount &&
        error instanceof TypeError &&
        !requestInit.signal?.aborted
      ) {
        await delay(retryDelay(attempt));
        continue;
      }
      throw error;
    }
  }
};

export const isApiMode = viteEnvironment?.VITE_APP_MODE === 'api';
