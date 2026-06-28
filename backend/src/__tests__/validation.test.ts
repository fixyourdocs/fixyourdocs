import { describe, it, expect } from 'vitest';
import {
  fileReportSchema, integrationCreateSchema, oauthStateSchema, domainClaimSchema, repoClaimSchema,
} from '../lib/validation';

describe('fileReportSchema', () => {
  it('accepts the canonical v0 envelope', () => {
    const example = {
      protocol_version: '0',
      doc_url: 'https://docs.example.com/getting-started',
      agent: { name: 'claude-code' },
      report: {
        kind: 'outdated',
        summary: 'Step 3 references a flag that was removed in v2.4',
        details: 'The doc says `--legacy-mode` but the CLI rejects it.',
      },
    };
    const result = fileReportSchema.safeParse(example);
    expect(result.success).toBe(true);
  });

  it('makes report.details optional', () => {
    const result = fileReportSchema.safeParse({
      protocol_version: '0',
      doc_url: 'https://docs.example.com/x',
      agent: { name: 'a' },
      report: { kind: 'other', summary: 's' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown protocol_version', () => {
    const result = fileReportSchema.safeParse({
      protocol_version: '1',
      doc_url: 'https://docs.example.com/x',
      agent: { name: 'a' },
      report: { kind: 'other', summary: 's' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown report.kind', () => {
    const result = fileReportSchema.safeParse({
      protocol_version: '0',
      doc_url: 'https://docs.example.com/x',
      agent: { name: 'a' },
      report: { kind: 'critique', summary: 's' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-URL doc_url', () => {
    const result = fileReportSchema.safeParse({
      protocol_version: '0',
      doc_url: 'not-a-url',
      agent: { name: 'a' },
      report: { kind: 'broken', summary: 's' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty summary', () => {
    const result = fileReportSchema.safeParse({
      protocol_version: '0',
      doc_url: 'https://docs.example.com/x',
      agent: { name: 'a' },
      report: { kind: 'broken', summary: '' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects summary over 280 chars', () => {
    const result = fileReportSchema.safeParse({
      protocol_version: '0',
      doc_url: 'https://docs.example.com/x',
      agent: { name: 'a' },
      report: { kind: 'broken', summary: 'x'.repeat(281) },
    });
    expect(result.success).toBe(false);
  });
});

describe('integrationCreateSchema', () => {
  it('accepts valid GitHub repo coordinates', () => {
    const result = integrationCreateSchema.safeParse({
      installation_id: 12345,
      repo_owner: 'fixyourdocs',
      repo_name: 'fixyourdocs',
      issue_template: '{summary}\n\n{details}\n\n{doc_url}',
    });
    expect(result.success).toBe(true);
  });

  it('coerces installation_id from a string', () => {
    const result = integrationCreateSchema.safeParse({
      installation_id: '12345',
      repo_owner: 'fixyourdocs',
      repo_name: 'fixyourdocs',
      issue_template: 'x',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a repo owner with slashes', () => {
    const result = integrationCreateSchema.safeParse({
      installation_id: 1,
      repo_owner: 'foo/bar',
      repo_name: 'baz',
      issue_template: 'x',
    });
    expect(result.success).toBe(false);
  });
});

describe('repoClaimSchema', () => {
  it('accepts owner/repo + template', () => {
    expect(repoClaimSchema.safeParse({ repo_owner: 'acme', repo_name: 'widgets', issue_template: '{summary}' }).success).toBe(true);
  });
  it('rejects an owner with slashes', () => {
    expect(repoClaimSchema.safeParse({ repo_owner: 'a/b', repo_name: 'widgets', issue_template: 'x' }).success).toBe(false);
  });
  it('rejects an empty template', () => {
    expect(repoClaimSchema.safeParse({ repo_owner: 'acme', repo_name: 'widgets', issue_template: '' }).success).toBe(false);
  });
});

describe('domainClaimSchema', () => {
  it('accepts a bare domain (no repo attachment) — back-compatible', () => {
    expect(domainClaimSchema.safeParse({ domain: 'acme.io' }).success).toBe(true);
  });
  it('accepts a domain with a repo to attach', () => {
    expect(domainClaimSchema.safeParse({ domain: 'docs.acme.io', repo_owner: 'acme', repo_name: 'widgets' }).success).toBe(true);
  });
  it('rejects an invalid repo owner', () => {
    expect(domainClaimSchema.safeParse({ domain: 'acme.io', repo_owner: 'a/b', repo_name: 'widgets' }).success).toBe(false);
  });
});

describe('oauthStateSchema', () => {
  it('accepts a long nonce', () => {
    const result = oauthStateSchema.safeParse({ nonce: 'a'.repeat(32) });
    expect(result.success).toBe(true);
  });

  it('rejects a short nonce', () => {
    const result = oauthStateSchema.safeParse({ nonce: 'short' });
    expect(result.success).toBe(false);
  });
});
