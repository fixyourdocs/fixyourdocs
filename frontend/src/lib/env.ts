declare global {
  interface Window {
    __ENV__?: Partial<RuntimeEnv>;
  }
}

export interface RuntimeEnv {
  API_BASE_URL: string;
  MCP_BASE_URL: string;
  COGNITO_AUTHORITY: string;
  COGNITO_CLIENT_ID: string;
  COGNITO_DOMAIN: string;
  COGNITO_REDIRECT_URI: string;
  COGNITO_LOGOUT_URI: string;
  PUBLIC_BASE_URL: string;
}

const fallback: RuntimeEnv = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? 'https://api.fixyourdocs.org',
  MCP_BASE_URL: import.meta.env.VITE_MCP_BASE_URL ?? 'https://mcp.fixyourdocs.org',
  COGNITO_AUTHORITY: import.meta.env.VITE_COGNITO_AUTHORITY ?? '',
  COGNITO_CLIENT_ID: import.meta.env.VITE_COGNITO_CLIENT_ID ?? '',
  COGNITO_DOMAIN: import.meta.env.VITE_COGNITO_DOMAIN ?? 'https://auth.fixyourdocs.org',
  COGNITO_REDIRECT_URI: import.meta.env.VITE_COGNITO_REDIRECT_URI ?? 'http://localhost:5173/auth/callback',
  COGNITO_LOGOUT_URI: import.meta.env.VITE_COGNITO_LOGOUT_URI ?? 'http://localhost:5173/',
  PUBLIC_BASE_URL: import.meta.env.VITE_PUBLIC_BASE_URL ?? 'https://fixyourdocs.org',
};

export const env: RuntimeEnv = { ...fallback, ...(typeof window !== 'undefined' ? window.__ENV__ ?? {} : {}) };
