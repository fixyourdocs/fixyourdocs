#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { config, env } from '../lib/config';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { AuthStack } from '../lib/auth-stack';
import { ApiStack } from '../lib/api-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { MonitoringStack } from '../lib/monitoring-stack';
import { GithubOidcStack } from '../lib/github-oidc-stack';
import { DocsfeedbackStack } from '../lib/docsfeedback-stack';

const app = new App();
const { stackPrefix: p } = config;

const network = new NetworkStack(app, `${p}NetworkStack`, { env, config });
const data = new DataStack(app, `${p}DataStack`, { env });
const auth = new AuthStack(app, `${p}AuthStack`, { env, config });

const api = new ApiStack(app, `${p}ApiStack`, {
  env,
  config,
  hostedZone: network.hostedZone,
  certHub: network.certHub,
  userPool: auth.userPool,
  userPoolClient: auth.userPoolClient,
  reportsTable: data.reportsTable,
  integrationsTable: data.integrationsTable,
  rateLimitTable: data.rateLimitTable,
});
api.addDependency(network);
api.addDependency(data);
api.addDependency(auth);

const frontend = new FrontendStack(app, `${p}FrontendStack`, {
  env,
  config,
  hostedZone: network.hostedZone,
  certApi: network.certApi,
  userPoolId: auth.userPool.userPoolId,
  userPoolClientId: auth.userPoolClient.userPoolClientId,
});
frontend.addDependency(network);
frontend.addDependency(auth);

new MonitoringStack(app, `${p}MonitoringStack`, {
  env,
  config,
  httpApi: api.httpApi,
}).addDependency(api);

new GithubOidcStack(app, `${p}GithubOidcStack`, { env, config });

new DocsfeedbackStack(app, `${p}DocsfeedbackStack`, {
  env,
  hostedZoneId: config.docsfeedbackHostedZoneId,
});

app.synth();
