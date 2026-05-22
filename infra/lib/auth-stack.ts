import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  AccountRecovery,
  Mfa,
  OAuthScope,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
  UserPoolDomain,
} from 'aws-cdk-lib/aws-cognito';
import { Config } from './config';

export interface AuthStackProps extends StackProps {
  config: Config;
}

export class AuthStack extends Stack {
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;
  readonly userPoolDomain: UserPoolDomain;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { config } = props;

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

    this.userPoolClient = new UserPoolClient(this, 'WebClient', {
      userPool: this.userPool,
      userPoolClientName: 'fyd-web',
      generateSecret: false,
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: [
          `https://${config.subdomains.app}/auth/callback`,
          'http://localhost:5173/auth/callback',
        ],
        logoutUrls: [
          `https://${config.subdomains.app}/`,
          'http://localhost:5173/',
        ],
      },
    });

    // Use Cognito-managed prefix domain instead of a custom auth.* subdomain.
    // Avoids the chicken-and-egg with the apex A record required by Cognito's
    // custom-domain check. We can switch to a custom domain in V2.
    this.userPoolDomain = new UserPoolDomain(this, 'UserPoolPrefixDomain', {
      userPool: this.userPool,
      cognitoDomain: { domainPrefix: config.cognitoDomainPrefix },
    });

    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    new CfnOutput(this, 'CognitoAuthority', {
      value: `https://cognito-idp.${config.region}.amazonaws.com/${this.userPool.userPoolId}`,
    });
    new CfnOutput(this, 'CognitoDomain', {
      value: this.userPoolDomain.baseUrl(),
    });
  }
}
