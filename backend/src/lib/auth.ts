import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

export interface AuthedEvent extends APIGatewayProxyEventV2WithJWTAuthorizer {}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function requireUser(event: AuthedEvent): { sub: string; email?: string } {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  if (!claims || typeof claims !== 'object') {
    throw new HttpError(401, 'unauthorized', 'Missing JWT claims');
  }
  const sub = claims.sub as string | undefined;
  if (!sub) throw new HttpError(401, 'unauthorized', 'Missing sub claim');
  const email = claims.email as string | undefined;
  return { sub, email };
}

export function getOrigin(event: AuthedEvent | { headers?: Record<string, string | undefined> }): string | undefined {
  const h = (event as any).headers ?? {};
  return h.origin ?? h.Origin;
}
