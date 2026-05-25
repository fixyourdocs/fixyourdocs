import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

// P0-08 Step 0d scaffold. Full implementation lands in Step 2 (validate +
// persist), Step 3 (dedup), Step 6 (forwarder async-invoke), Step 7 (rate
// limit). Until then the handler returns 501 so the route is wired and
// observable.
export const handler: APIGatewayProxyHandlerV2 = async () => ({
  statusCode: 501,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ error: { code: 'not_implemented', message: 'POST /v1/reports is not implemented yet' } }),
});
