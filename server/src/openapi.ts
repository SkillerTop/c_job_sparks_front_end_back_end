import { FULFILLMENT_STATUSES, WORKSPACE_SECTIONS } from './contracts.js';

export interface RegisteredRoute {
  method: string;
  url: string;
}

const documentedPath = (url: string) => url
  .replace(/:([A-Za-z0-9_]+)/g, '{$1}')
  .replace(/\*$/, '{wildcard}');

const pathParameters = (path: string) => Array.from(path.matchAll(/\{([^}]+)\}/g), ([, name]) => ({
  in: 'path',
  name,
  required: true,
  schema: { type: 'string' },
}));

const publicRoute = (path: string) => path === '/api/v1/openapi.json' ||
  path === '/api/v1/auth/microsoft/config' ||
  path === '/api/v1/auth/microsoft/start' ||
  path === '/api/v1/auth/microsoft/callback' ||
  path === '/api/v1/auth/access-requests' ||
  path.startsWith('/api/v1/auth/access-requests/status') ||
  path === '/api/v1/auth/login' ||
  path.startsWith('/api/v1/auth/password-reset/') ||
  path.startsWith('/api/v1/media/');

const generatedPaths = (registeredRoutes: readonly RegisteredRoute[]) => {
  const paths: Record<string, Record<string, unknown>> = {};
  const seen = new Set<string>();
  for (const route of registeredRoutes) {
    const method = route.method.toLowerCase();
    if (!['get', 'post', 'patch', 'put', 'delete', 'head', 'options'].includes(method)) continue;
    const path = documentedPath(route.url);
    const identity = `${method} ${path}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const parameters = pathParameters(path);
    paths[path] ??= {};
    paths[path][method] = {
      ...(publicRoute(path) ? {} : { security: [{ session: [] }] }),
      ...(parameters.length ? { parameters } : {}),
      responses: {
        '200': { description: 'Successful response' },
        default: { description: 'Error response' },
      },
    };
  }
  return paths;
};

export const openApiDocument = (origin: string, registeredRoutes: readonly RegisteredRoute[] = []) => {
  const paths = generatedPaths(registeredRoutes);
  const detailedPaths = {
    '/api/v1/workspace': { get: { security: [{ session: [] }], parameters: [{ in: 'query', name: 'section',
      schema: { $ref: '#/components/schemas/WorkspaceSection' } }], responses: { '200': { description: 'Role-scoped workspace' },
      '403': { description: 'Section is not available to this role' } } } },
    '/api/v1/me/ledger': { get: { security: [{ session: [] }], responses: { '200': { description: 'Cursor page',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/CursorPage' } } } } } } },
    '/api/v1/task-board': {
      get: { security: [{ session: [] }], parameters: [
        { in: 'query', name: 'filter', schema: { type: 'string', enum: ['all','active','booked','completed','mine','assigned'] } },
        { in: 'query', name: 'cursor', schema: { type: 'string' } },
        { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100 } },
      ], responses: { '200': { description: 'Status-ordered Task Board cursor page' } } },
      post: { security: [{ session: [] }], parameters: [{ in: 'header', name: 'Idempotency-Key', required: true,
        schema: { type: 'string' } }], responses: { '201': { description: 'Published task after two approval confirmations' },
        '403': { description: 'Role cannot publish tasks' } } },
    },
    '/api/v1/task-board/{id}/book': { post: { security: [{ session: [] }], responses: {
      '200': { description: 'Task exclusively booked by the current employee' },
      '409': { description: 'Task is no longer available' },
    } } },
    '/api/v1/task-board/{id}/complete': { post: { security: [{ session: [] }], responses: {
      '200': { description: 'Task completed and reward atomically credited once' },
      '409': { description: 'Task is not booked or was already rewarded' },
    } } },
    '/api/v1/admin/shop/{collection}': { get: { security: [{ session: [] }], parameters: [
      { in: 'path', name: 'collection', required: true, schema: { type: 'string', enum: ['products','purchases','balances','fulfillments'] } },
      { in: 'query', name: 'cursor', schema: { type: 'string' } },
      { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 200 } },
    ], responses: { '200': { description: 'Cursor page', content: { 'application/json': {
      schema: { $ref: '#/components/schemas/CursorPage' } } } } } } },
  };
  for (const [path, pathItem] of Object.entries(detailedPaths))
    paths[path] = { ...paths[path], ...pathItem };
  return {
  openapi: '3.1.0',
  info: { title: 'C-Job Sparks API', version: '1.0.0' },
  servers: [{ url: origin.replace(/\/$/, '') }],
  components: {
    securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'cjob_session' } },
    schemas: {
      CursorPage: {
        type: 'object', required: ['items', 'nextCursor', 'hasNext'],
        properties: { items: { type: 'array', items: {} }, nextCursor: { type: ['string', 'null'] },
          hasNext: { type: 'boolean' } },
      },
      FulfillmentStatus: { type: 'string', enum: [...FULFILLMENT_STATUSES] },
      WorkspaceSection: { type: 'string', enum: [...WORKSPACE_SECTIONS] },
      TaskBoardStatus: { type: 'string', enum: ['Active', 'Booked', 'Completed', 'Cancelled'] },
      TaskBoardDraft: { type: 'object', required: ['title', 'description', 'rewardComponents', 'dueDate'], properties: {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        description: { type: 'string', minLength: 1, maxLength: 10_000 },
        rewardComponents: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'object',
          required: ['sparkType', 'amount'], properties: {
            sparkType: { type: 'string', enum: ['White', 'Yellow', 'Blue'] },
            amount: { type: 'integer', minimum: 1, maximum: 1_000_000 },
          } } },
        dueDate: { type: ['string', 'null'], format: 'date' },
      } },
    },
  },
    paths,
  };
};
