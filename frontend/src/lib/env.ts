declare global {
  interface Window {
    __ENV__?: Partial<RuntimeEnv>;
  }
}

export interface RuntimeEnv {
  HUB_BASE_URL: string;
  COGNITO_REGION: string;
  COGNITO_USER_POOL_ID: string;
  COGNITO_CLIENT_ID: string;
  APP_BASE_URL: string;
}

const fallback: RuntimeEnv = {
  HUB_BASE_URL: import.meta.env.VITE_HUB_BASE_URL ?? 'https://hub.fixyourdocs.io',
  COGNITO_REGION: import.meta.env.VITE_COGNITO_REGION ?? 'us-east-1',
  COGNITO_USER_POOL_ID: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? '',
  COGNITO_CLIENT_ID: import.meta.env.VITE_COGNITO_CLIENT_ID ?? '',
  APP_BASE_URL: import.meta.env.VITE_APP_BASE_URL ?? 'https://fixyourdocs.io',
};

export const env: RuntimeEnv = { ...fallback, ...(typeof window !== 'undefined' ? window.__ENV__ ?? {} : {}) };
