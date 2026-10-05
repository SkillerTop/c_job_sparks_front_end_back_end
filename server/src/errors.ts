import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (code: string, message: string, details?: Record<string, unknown>) =>
  new ApiError(400, code, message, details);
export const unauthorized = (message = 'Authentication is required.') =>
  new ApiError(401, 'AUTHENTICATION_REQUIRED', message);
export const forbidden = (message = 'You do not have permission to perform this action.') =>
  new ApiError(403, 'FORBIDDEN', message);
export const notFound = (resource: string) => new ApiError(404, 'NOT_FOUND', `${resource} was not found.`);
export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new ApiError(409, code, message, details);

const normalizePgError = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = String(error.code);
  if (code === '23505') return conflict('CONFLICT', 'A record with these values already exists.');
  if (code === '23P01') return conflict('OVERLAPPING_PERIOD', 'This date range overlaps an existing active record.');
  if (code === '23503') return badRequest('INVALID_REFERENCE', 'A referenced record does not exist.');
  if (code === '23502') return badRequest('REQUIRED_VALUE', 'A required value is missing.');
  if (code === '23514') return badRequest('CONSTRAINT_VIOLATION', 'The requested value violates a business constraint.');
  if (code === '55000') return conflict('IMMUTABLE_HISTORY', 'Historical records cannot be edited; create a new version or reversal.');
  if (code === '40001' || code === '40P01')
    return new ApiError(409, 'RETRY_REQUIRED', 'The operation conflicted with another request. Retry it safely.');
  return null;
};

export const installErrorHandler = (app: FastifyInstance) => {
  app.setErrorHandler((error: FastifyError | ApiError, request: FastifyRequest, reply: FastifyReply) => {
    const normalized =
      error instanceof ApiError
        ? error
        : error instanceof ZodError
          ? badRequest('VALIDATION_ERROR', 'The request is invalid.', {
              issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
            })
          : normalizePgError(error);
    if (normalized) {
      return reply.status(normalized.statusCode).send({
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
        requestId: request.id,
      });
    }
    request.log.error({ err: error }, 'Unhandled request error');
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'The request could not be completed.',
      requestId: request.id,
    });
  });
};
