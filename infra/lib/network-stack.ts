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
  /** Certificate covering apex + www + api.* + mcp.* — historical SAN list,
   *  kept unchanged so the cross-stack export value (the cert ARN) does not
   *  flip while `FydFrontendStack` still imports it. Consumed today by
   *  `FydFrontendStack` for CloudFront. The api.* / mcp.* SANs are no longer
   *  used by any route, but trimming them would require an ACM replacement
   *  that CloudFormation refuses while the export is in use; deferred. */
  readonly certApi: ICertificate;
  /** Certificate covering hub.* only. New resource introduced for
   *  `hub.fixyourdocs.io` (the single Hub API hostname). Consumed by
   *  `FydApiStack`'s HubDomain. */
  readonly certHub: ICertificate;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { config } = props;

    this.hostedZone = HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: config.hostedZoneId,
      zoneName: config.rootDomain,
    });

    // Existing cert. Construct id pinned to `CertApi` so CloudFormation
    // identifies the live resource by the same logical id and does not try
    // to replace it. SAN list matches what is already deployed.
    this.certApi = new Certificate(this, 'CertApi', {
      domainName: config.rootDomain,
      subjectAlternativeNames: [
        `www.${config.rootDomain}`,
        `api.${config.rootDomain}`,
        `mcp.${config.rootDomain}`,
      ],
      validation: CertificateValidation.fromDns(this.hostedZone),
    });

    // New cert dedicated to hub.fixyourdocs.io. Adding a fresh cert avoids
    // the CloudFormation "Cannot update export … as it is in use" error
    // that would fire if we tried to mutate the existing CertApi SAN list
    // while FydFrontendStack still imports it.
    this.certHub = new Certificate(this, 'CertHub', {
      domainName: config.subdomains.hub,
      validation: CertificateValidation.fromDns(this.hostedZone),
    });

    new CfnOutput(this, 'CertApiArn', { value: this.certApi.certificateArn });
    new CfnOutput(this, 'CertHubArn', { value: this.certHub.certificateArn });
  }
}
