import type { FastifyRequest } from 'fastify';
import type { AuthenticatedPrincipal } from './domain.js';
import { unauthorized } from './errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: AuthenticatedPrincipal;
  }
}

export const principalOf = (request: FastifyRequest) => {
  if (!request.principal) throw unauthorized();
  return request.principal;
};

export const requestMetadata = (request: FastifyRequest) => ({
  requestId: request.id,
  ip: request.ip,
  userAgent: request.headers['user-agent']?.slice(0, 1000) ?? null,
});
