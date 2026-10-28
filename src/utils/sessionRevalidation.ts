const EXPIRED_SESSION_RETRY_MS = 60_000;

export function sessionRevalidationDelay(expiresAt: number | null, now = Date.now()) {
  if (expiresAt === null || !Number.isFinite(expiresAt)) return null;
  if (expiresAt <= now) return EXPIRED_SESSION_RETRY_MS;
  return expiresAt - now + 50;
}
