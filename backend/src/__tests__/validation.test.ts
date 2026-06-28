import { describe, it, expect } from 'vitest';
import { fileReportSchema, repoClaimSchema, oauthStateSchema } from '../lib/validation';

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

describe('repoClaimSchema', () => {
  it('accepts valid GitHub repo coordinates', () => {
    const result = repoClaimSchema.safeParse({
      repo_owner: 'fixyourdocs',
      repo_name: 'fixyourdocs',
      issue_template: '{summary}\n\n{details}\n\n{doc_url}',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a repo owner with slashes', () => {
    const result = repoClaimSchema.safeParse({
      repo_owner: 'foo/bar',
      repo_name: 'baz',
      issue_template: 'x',
    });
    expect(result.success).toBe(false);
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
