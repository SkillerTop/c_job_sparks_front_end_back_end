import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { getEnvironment, type Environment } from './config/env.js';
import { createPool } from './db/pool.js';
import { installErrorHandler } from './errors.js';
import { registerRoutes } from './routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool;
  }
}

export interface BuildAppOptions {
  environment?: Environment;
  pool?: Pool;
}

export const sessionCookieOptions = (environment: Environment) => ({
  path: '/',
  httpOnly: true,
  secure: environment.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: environment.SESSION_TTL_HOURS * 60 * 60,
});

export const buildApp = async (options: BuildAppOptions = {}): Promise<FastifyInstance> => {
  const environment = options.environment ?? getEnvironment();
  const ownsPool = options.pool === undefined;
  const pool = options.pool ?? createPool(environment);
  const app = Fastify({
    trustProxy: environment.TRUST_PROXY,
    bodyLimit: 2_500_000,
    requestTimeout: 30_000,
    connectionTimeout: 10_000,
    keepAliveTimeout: 72_000,
    genReqId: () => randomUUID(),
    logger: {
      level: environment.LOG_LEVEL,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers.set-cookie',
          'password',
          '*.password',
          '*.token',
        ],
        censor: '[REDACTED]',
      },
    },
  });

  app.decorate('db', pool);
  await app.register(helmet);
  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || environment.CORS_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed.'), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'idempotency-key', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
    maxAge: 600,
  });
  await app.register(cookie, { secret: environment.COOKIE_SECRET, hook: 'onRequest' });
  await app.register(multipart, {
    limits: { files: 1, fileSize: 2_000_000, fields: 4, parts: 5 },
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    hook: 'onRequest',
  });

  app.addHook('onSend', async (request, reply, payload) => {
    void reply.header('x-request-id', request.id);
    return payload;
  });

  installErrorHandler(app);

  app.get('/health/live', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));
  app.get('/health/ready', { config: { rateLimit: false } }, async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ready' };
    } catch (error) {
      app.log.error({ err: error }, 'Database readiness check failed');
      return reply.status(503).send({ status: 'not_ready' });
    }
  });

  await registerRoutes(app, environment);

  if (ownsPool) {
    app.addHook('onClose', async () => {
      await pool.end();
    });
  }

  return app;
};
