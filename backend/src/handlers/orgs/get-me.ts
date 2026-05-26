import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUser, getOrigin } from '../../lib/auth';
import { ok } from '../../lib/response';
import { wrapAuth } from '../../lib/wrap';

// P0-08 Step 4a — verification target for the Cognito SRP sign-in flow.
// Returns the JWT subject + email so the SPA (and the e2e suite) can confirm
// the authoriser is wired correctly. No DB read; the claims come straight
// from API Gateway's JWT authoriser context.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const user = requireUser(event);
  return ok({ sub: user.sub, email: user.email }, getOrigin(event));
});
