import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { publicJson } from '../../lib/response';
import { wrapPublic } from '../../lib/wrap';

export const handler: APIGatewayProxyHandlerV2 = wrapPublic(async () => {
  return publicJson(200, { ok: true });
});
