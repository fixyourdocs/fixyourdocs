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
  readonly cert: ICertificate;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { config } = props;

    this.hostedZone = HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: config.hostedZoneId,
      zoneName: config.rootDomain,
    });

    this.cert = new Certificate(this, 'Cert', {
      domainName: config.rootDomain,
      subjectAlternativeNames: [
        `www.${config.rootDomain}`,
        config.subdomains.hub,
      ],
      validation: CertificateValidation.fromDns(this.hostedZone),
    });

    new CfnOutput(this, 'CertArn', { value: this.cert.certificateArn });
  }
}
