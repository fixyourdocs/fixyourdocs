import type { APIGatewayProxyResultV2 } from 'aws-lambda';

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean);

function corsHeaders(origin?: string): Record<string, string> {
  const allow = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0] ?? '*';
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-credentials': 'true',
    vary: 'Origin',
  };
}

export function json(status: number, body: unknown, origin?: string): APIGatewayProxyResultV2 {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
    body: JSON.stringify(body),
  };
}

export const ok = (body: unknown, origin?: string) => json(200, body, origin);
export const created = (body: unknown, origin?: string) => json(201, body, origin);
export const noContent = (origin?: string): APIGatewayProxyResultV2 => ({
  statusCode: 204,
  headers: corsHeaders(origin),
  body: '',
});

export function errorResponse(code: string, message: string, status: number, origin?: string) {
  return json(status, { error: { code, message } }, origin);
}

export const publicCacheHeaders = (seconds = 30): Record<string, string> => ({
  'cache-control': `public, max-age=${seconds}`,
});

export function publicJson(status: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      ...publicCacheHeaders(30),
    },
    body: JSON.stringify(body),
  };
}

export const publicOk = (body: unknown) => publicJson(200, body);
export function publicError(code: string, message: string, status: number) {
  return publicJson(status, { error: { code, message } });
}
