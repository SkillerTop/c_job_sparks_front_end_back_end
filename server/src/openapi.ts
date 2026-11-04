import { FULFILLMENT_STATUSES, WORKSPACE_SECTIONS } from './contracts.js';

export const openApiDocument = (origin: string) => ({
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
    },
  },
  paths: {
    '/api/v1/workspace': { get: { security: [{ session: [] }], parameters: [{ in: 'query', name: 'section',
      schema: { $ref: '#/components/schemas/WorkspaceSection' } }], responses: { '200': { description: 'Role-scoped workspace' },
      '403': { description: 'Section is not available to this role' } } } },
    '/api/v1/me/ledger': { get: { security: [{ session: [] }], responses: { '200': { description: 'Cursor page',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/CursorPage' } } } } } } },
    '/api/v1/admin/shop/{collection}': { get: { security: [{ session: [] }], parameters: [
      { in: 'path', name: 'collection', required: true, schema: { type: 'string', enum: ['products','purchases','balances','fulfillments'] } },
      { in: 'query', name: 'cursor', schema: { type: 'string' } },
      { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 200 } },
    ], responses: { '200': { description: 'Cursor page', content: { 'application/json': {
      schema: { $ref: '#/components/schemas/CursorPage' } } } } } } },
  },
});
