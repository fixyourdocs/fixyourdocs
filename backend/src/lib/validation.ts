import { z } from 'zod';

export const reportKindSchema = z.enum([
  'broken',
  'incorrect',
  'outdated',
  'missing',
  'unclear',
  'other',
]);

export const fileReportSchema = z.object({
  protocol_version: z.literal('0'),
  doc_url: z.string().url().max(2048),
  agent: z.object({
    name: z.string().min(1).max(120),
  }),
  report: z.object({
    kind: reportKindSchema,
    summary: z.string().min(1).max(280),
    details: z.string().max(8000).optional(),
  }),
});

export type FileReport = z.infer<typeof fileReportSchema>;

const repoOwnerRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38}[a-zA-Z0-9])?$/;
const repoNameRegex = /^[a-zA-Z0-9._-]{1,100}$/;

// Claim a repository with its own Issue template (installationId comes from the
// stored integration, not the body).
export const repoClaimSchema = z.object({
  repo_owner: z.string().regex(repoOwnerRegex, 'invalid repo owner'),
  repo_name: z.string().regex(repoNameRegex, 'invalid repo name'),
  issue_template: z.string().min(1).max(8000),
});

export type RepoClaim = z.infer<typeof repoClaimSchema>;

export const domainClaimSchema = z.object({
  domain: z.string().min(3).max(253),
});
export type DomainClaim = z.infer<typeof domainClaimSchema>;

export const oauthStateSchema = z.object({
  nonce: z.string().min(16).max(128),
  return_to: z.string().max(2048).optional(),
});

export type OAuthState = z.infer<typeof oauthStateSchema>;
