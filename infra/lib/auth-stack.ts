import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  AccountRecovery,
  Mfa,
  UserPool,
  UserPoolClient,
} from 'aws-cdk-lib/aws-cognito';
import { Config } from './config';

export interface AuthStackProps extends StackProps {
  config: Config;
}

export class AuthStack extends Stack {
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    void props.config;

    this.userPool = new UserPool(this, 'UserPool', {
      userPoolName: 'fyd-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: false } },
      passwordPolicy: {
        minLength: 10,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: false,
      },
      mfa: Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // SRP-only client; no Hosted UI redirect flow. The SPA signs users in via
    // `amazon-cognito-identity-js` directly against the user pool. The
    // optional GitHub OAuth sign-in path (P0-08 Step 4b) is implemented inside
    // the Hub backend, not via Cognito federated identity providers.
    this.userPoolClient = new UserPoolClient(this, 'WebClient', {
      userPool: this.userPool,
      userPoolClientName: 'fyd-web',
      generateSecret: false,
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });

    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    new CfnOutput(this, 'CognitoAuthority', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`,
    });
  }
}
