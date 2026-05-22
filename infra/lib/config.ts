export interface Config {
  account: string;
  region: string;
  rootDomain: string;
  hostedZoneId: string;
  subdomains: {
    app: string;
    api: string;
    mcp: string;
    auth: string;
  };
  allowedOrigins: string[];
  githubRepo: string;
  opsAlertEmail: string;
  stackPrefix: string;
  cognitoDomainPrefix: string;
}

const rootDomain = process.env.FYD_ROOT_DOMAIN ?? 'fixyourdocs.io';
const account = process.env.CDK_DEFAULT_ACCOUNT ?? process.env.FYD_AWS_ACCOUNT ?? '';

export const config: Config = {
  account,
  region: process.env.CDK_DEFAULT_REGION ?? process.env.FYD_AWS_REGION ?? 'us-east-1',
  rootDomain,
  hostedZoneId: process.env.FYD_HOSTED_ZONE_ID ?? '',
  subdomains: {
    app: rootDomain,
    api: `api.${rootDomain}`,
    mcp: `mcp.${rootDomain}`,
    auth: `auth.${rootDomain}`,
  },
  allowedOrigins: [`https://${rootDomain}`, 'http://localhost:5173'],
  githubRepo: process.env.FYD_GITHUB_REPO ?? 'fixyourdocs/fixyourdocs',
  opsAlertEmail: process.env.FYD_OPS_ALERT_EMAIL ?? '',
  stackPrefix: process.env.FYD_STACK_PREFIX ?? 'Fyd',
  cognitoDomainPrefix: process.env.FYD_COGNITO_DOMAIN_PREFIX ?? (account ? `fyd-auth-${account}` : 'fyd-auth'),
};

export const env = {
  account: config.account,
  region: config.region,
} as const;
