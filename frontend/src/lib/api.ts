import { env } from './env';
import { getIdToken } from './auth';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getIdToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  const res = await fetch(`${env.API_BASE_URL}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as any)?.error ?? { code: 'unknown', message: res.statusText };
    throw new ApiError(res.status, err.code, err.message);
  }
  return data as T;
}

export const apiPublic = async <T = unknown>(path: string): Promise<T> => {
  const res = await fetch(`${env.API_BASE_URL}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as any)?.error ?? { code: 'unknown', message: res.statusText };
    throw new ApiError(res.status, err.code, err.message);
  }
  return data as T;
};
