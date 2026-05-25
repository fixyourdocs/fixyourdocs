import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

// P0-08 Step 0d scaffold. Full implementation lands in Step 2.
export const handler: APIGatewayProxyHandlerV2 = async () => ({
  statusCode: 501,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ error: { code: 'not_implemented', message: 'GET /v1/reports/:id is not implemented yet' } }),
});
