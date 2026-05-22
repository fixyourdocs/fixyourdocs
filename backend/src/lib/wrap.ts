import type { APIGatewayProxyHandlerV2WithJWTAuthorizer, APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { HttpError, getOrigin } from './auth';
import { errorResponse, publicError } from './response';

export const wrapAuth = (
  handler: APIGatewayProxyHandlerV2WithJWTAuthorizer,
): APIGatewayProxyHandlerV2WithJWTAuthorizer =>
  (async (event, ctx, cb) => {
    try {
      return await (handler as any)(event, ctx, cb);
    } catch (err) {
      const origin = getOrigin(event as any);
      if (err instanceof HttpError) {
        return errorResponse(err.code, err.message, err.status, origin);
      }
      console.error('Unhandled error', err);
      return errorResponse('internal_error', 'Internal server error', 500, origin);
    }
  }) as APIGatewayProxyHandlerV2WithJWTAuthorizer;

export const wrapPublic = (handler: APIGatewayProxyHandlerV2): APIGatewayProxyHandlerV2 =>
  (async (event, ctx, cb) => {
    try {
      return await (handler as any)(event, ctx, cb);
    } catch (err) {
      if (err instanceof HttpError) {
        return publicError(err.code, err.message, err.status);
      }
      console.error('Unhandled error', err);
      return publicError('internal_error', 'Internal server error', 500);
    }
  }) as APIGatewayProxyHandlerV2;
