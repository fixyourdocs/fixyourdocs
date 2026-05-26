import type {
  APIGatewayProxyHandlerV2,
  APIGatewayProxyHandlerV2WithJWTAuthorizer,
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { HttpError, getOrigin } from './auth';
import { errorResponse, publicError } from './response';

// Structured request log emitted once per invocation. Fields kept stable so
// downstream queries can pivot on requestId across the API ↔ forwarder hop.
function logRequest(
  event: APIGatewayProxyEventV2 | undefined,
  status: number,
  err?: unknown,
): void {
  const reqCtx = event?.requestContext;
  console.log(
    JSON.stringify({
      requestId: reqCtx?.requestId,
      method: reqCtx?.http?.method,
      path: reqCtx?.http?.path,
      ip: reqCtx?.http?.sourceIp,
      status,
      ...(err instanceof Error
        ? {
            error: {
              code: err instanceof HttpError ? err.code : 'internal_error',
              message: err.message,
            },
          }
        : {}),
    }),
  );
}

function statusOf(result: APIGatewayProxyResultV2 | undefined): number {
  if (!result || typeof result !== 'object') return 200;
  return (result as { statusCode?: number }).statusCode ?? 200;
}

export const wrapAuth = (
  handler: APIGatewayProxyHandlerV2WithJWTAuthorizer,
): APIGatewayProxyHandlerV2WithJWTAuthorizer =>
  (async (event, ctx, cb) => {
    try {
      const result = await (handler as any)(event, ctx, cb);
      logRequest(event as any, statusOf(result));
      return result;
    } catch (err) {
      const origin = getOrigin(event as any);
      if (err instanceof HttpError) {
        logRequest(event as any, err.status, err);
        return errorResponse(err.code, err.message, err.status, origin);
      }
      console.error('Unhandled error', err);
      logRequest(event as any, 500, err);
      return errorResponse('internal_error', 'Internal server error', 500, origin);
    }
  }) as APIGatewayProxyHandlerV2WithJWTAuthorizer;

export const wrapPublic = (handler: APIGatewayProxyHandlerV2): APIGatewayProxyHandlerV2 =>
  (async (event, ctx, cb) => {
    try {
      const result = await (handler as any)(event, ctx, cb);
      logRequest(event, statusOf(result));
      return result;
    } catch (err) {
      if (err instanceof HttpError) {
        logRequest(event, err.status, err);
        return publicError(err.code, err.message, err.status);
      }
      console.error('Unhandled error', err);
      logRequest(event, 500, err);
      return publicError('internal_error', 'Internal server error', 500);
    }
  }) as APIGatewayProxyHandlerV2;
