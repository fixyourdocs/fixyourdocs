import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';

// P0-08 Step 0d scaffold. Full implementation lands in Step 5 (redirect to
// the GitHub App installation URL with a signed `state` carrying the
// maintainer's Cognito sub).
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async () => ({
  statusCode: 501,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ error: { code: 'not_implemented', message: 'GET /v1/integrations/github/install is not implemented yet' } }),
});
