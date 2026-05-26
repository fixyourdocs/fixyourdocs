import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

// P0-08 Step 0d scaffold. Full implementation lands in Step 5: verify the
// signed `state` parameter, persist `{ userId, installation_id }` to the
// Integrations table, then redirect back to the SPA so the maintainer can
// pick a target repo + Issue template.
export const handler: APIGatewayProxyHandlerV2 = async () => ({
  statusCode: 501,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ error: { code: 'not_implemented', message: 'GET /v1/integrations/github/callback is not implemented yet' } }),
});
