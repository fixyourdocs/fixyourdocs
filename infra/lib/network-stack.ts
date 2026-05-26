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

    // Construct id stays `CertApi` (matching the original logical id in the
    // already-deployed stack) so CloudFormation treats the SAN change as an
    // in-place replacement on the same logical resource. That preserves the
    // cross-stack export name (`ExportsOutputRefCertApi...`) consumers
    // already import in `FydApiStack` and `FydFrontendStack`, and avoids the
    // export-deadlock that would occur if we renamed to a new logical id.
    this.cert = new Certificate(this, 'CertApi', {
      domainName: config.rootDomain,
      subjectAlternativeNames: [
        `www.${config.rootDomain}`,
        config.subdomains.hub,
      ],
      validation: CertificateValidation.fromDns(this.hostedZone),
    });

    new CfnOutput(this, 'CertApiArn', { value: this.cert.certificateArn });
  }
}
