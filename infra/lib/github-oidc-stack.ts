import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  FederatedPrincipal,
  ManagedPolicy,
  OpenIdConnectProvider,
  Role,
} from 'aws-cdk-lib/aws-iam';
import { Config } from './config';

export interface GithubOidcStackProps extends StackProps {
  config: Config;
}

export class GithubOidcStack extends Stack {
  readonly deployerRoleArn: string;

  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);
    const { config } = props;

    const provider = new OpenIdConnectProvider(this, 'GithubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const role = new Role(this, 'GhActionsDeployerRole', {
      roleName: 'gh-actions-deployer',
      assumedBy: new FederatedPrincipal(
        provider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': `repo:${config.githubRepo}:*`,
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });

    this.deployerRoleArn = role.roleArn;
    new CfnOutput(this, 'DeployerRoleArn', { value: role.roleArn });
  }
}
