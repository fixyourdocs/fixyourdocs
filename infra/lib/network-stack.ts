import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HostedZone, IHostedZone } from 'aws-cdk-lib/aws-route53';
import { Certificate, CertificateValidation, ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Config } from './config';

export interface NetworkStackProps extends StackProps {
  config: Config;
}

export class NetworkStack extends Stack {
  readonly hostedZone: IHostedZone;
  readonly certApi: ICertificate;
  readonly certAuth: ICertificate;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { config } = props;

    this.hostedZone = HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: config.hostedZoneId,
      zoneName: config.rootDomain,
    });

    this.certApi = new Certificate(this, 'CertApi', {
      domainName: config.rootDomain,
      subjectAlternativeNames: [
        `www.${config.rootDomain}`,
        config.subdomains.api,
        config.subdomains.mcp,
      ],
      validation: CertificateValidation.fromDns(this.hostedZone),
    });

    this.certAuth = new Certificate(this, 'CertAuth', {
      domainName: config.subdomains.auth,
      validation: CertificateValidation.fromDns(this.hostedZone),
    });

    new CfnOutput(this, 'CertApiArn', { value: this.certApi.certificateArn });
    new CfnOutput(this, 'CertAuthArn', { value: this.certAuth.certificateArn });
  }
}
