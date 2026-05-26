import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';

// P0-08 Step 0d scaffold. Full implementation lands in Step 5: validate the
// `integrationCreateSchema` body, write `{ userId, installation_id,
// repo_owner, repo_name, issue_template }` to the Integrations table.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async () => ({
  statusCode: 501,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ error: { code: 'not_implemented', message: 'POST /v1/orgs/me/integrations/github is not implemented yet' } }),
});
