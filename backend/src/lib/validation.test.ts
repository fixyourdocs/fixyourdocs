import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  domainSchema,
  fileReportSchema,
  issueTypeSchema,
  listReportsSchema,
  orgCreateSchema,
  patchReportSchema,
  registerDomainSchema,
  replySchema,
  slugRegex,
  statusSchema,
  urlMatchesDomain,
} from './validation.js';

describe('orgCreateSchema', () => {
  it('accepts a well-formed org', () => {
    const result = orgCreateSchema.safeParse({ name: 'Acme', slug: 'acme' });
    assert.equal(result.success, true);
  });

  it('rejects a short name', () => {
    const result = orgCreateSchema.safeParse({ name: 'A', slug: 'acme' });
    assert.equal(result.success, false);
  });

  it('rejects an invalid slug (uppercase, underscore, leading dash)', () => {
    for (const slug of ['Acme', 'ac_me', '-acme', 'a', 'acme-']) {
      const result = orgCreateSchema.safeParse({ name: 'Acme', slug });
      assert.equal(result.success, false, `expected ${slug} to fail`);
    }
  });

  it('slugRegex accepts the documented shape (min 3 chars, alphanumeric edges, hyphens in middle)', () => {
    for (const slug of ['abc', 'acme', 'acme-co', 'a1b2', 'acme-2026']) {
      assert.equal(slugRegex.test(slug), true, slug);
    }
  });

  it('slugRegex rejects 2-char slugs (length floor)', () => {
    assert.equal(slugRegex.test('ab'), false);
  });
});

describe('domainSchema', () => {
  it('lowercases + trims trailing dot', () => {
    const r = domainSchema.safeParse('Docs.ACME.COM.');
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data, 'docs.acme.com');
  });

  it('rejects private + IP hostnames', () => {
    for (const bad of ['localhost', '127.0.0.1', '10.0.0.1']) {
      const r = domainSchema.safeParse(bad);
      assert.equal(r.success, false, bad);
    }
  });

  it('rejects malformed hostnames', () => {
    for (const bad of ['', 'foo', 'foo..bar', 'foo bar.com', 'a'.repeat(254)]) {
      const r = domainSchema.safeParse(bad);
      assert.equal(r.success, false, bad);
    }
  });
});

describe('registerDomainSchema', () => {
  it('uses domainSchema transformation', () => {
    const r = registerDomainSchema.safeParse({ domain: 'Docs.Acme.COM' });
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.domain, 'docs.acme.com');
  });
});

describe('issueTypeSchema + statusSchema', () => {
  it('issueType accepts the documented enum', () => {
    for (const v of ['gap', 'outdated', 'contradiction', 'dead_end', 'broken_link', 'other']) {
      assert.equal(issueTypeSchema.safeParse(v).success, true, v);
    }
  });

  it('issueType rejects unknown values', () => {
    assert.equal(issueTypeSchema.safeParse('typo').success, false);
  });

  it('status accepts the documented enum (incl. terminal spam)', () => {
    for (const v of ['open', 'acknowledged', 'fixed', 'wontfix', 'duplicate', 'spam']) {
      assert.equal(statusSchema.safeParse(v).success, true, v);
    }
  });
});

describe('fileReportSchema', () => {
  const valid = {
    domain: 'docs.acme.com',
    url: 'https://docs.acme.com/guide#step-3',
    issueType: 'outdated',
    title: 'Step 3 references the v1 API',
    description: 'The v1 API was deprecated in March; the example should reference v2.',
  };

  it('accepts a complete valid report', () => {
    assert.equal(fileReportSchema.safeParse(valid).success, true);
  });

  it('accepts optional evidence', () => {
    const r = fileReportSchema.safeParse({ ...valid, evidence: 'curl -X GET /v1/...' });
    assert.equal(r.success, true);
  });

  it('rejects oversized fields', () => {
    assert.equal(
      fileReportSchema.safeParse({ ...valid, title: 'x'.repeat(121) }).success,
      false,
    );
    assert.equal(
      fileReportSchema.safeParse({ ...valid, description: 'x'.repeat(4001) }).success,
      false,
    );
    assert.equal(
      fileReportSchema.safeParse({ ...valid, evidence: 'x'.repeat(8001) }).success,
      false,
    );
  });

  it('rejects malformed urls', () => {
    assert.equal(
      fileReportSchema.safeParse({ ...valid, url: 'not-a-url' }).success,
      false,
    );
  });
});

describe('listReportsSchema', () => {
  it('coerces limit from string (query-string source)', () => {
    const r = listReportsSchema.safeParse({ domain: 'docs.acme.com', limit: '25' });
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.limit, 25);
  });

  it('rejects limit outside [1, 50]', () => {
    assert.equal(
      listReportsSchema.safeParse({ domain: 'docs.acme.com', limit: 0 }).success,
      false,
    );
    assert.equal(
      listReportsSchema.safeParse({ domain: 'docs.acme.com', limit: 51 }).success,
      false,
    );
  });
});

describe('patchReportSchema + replySchema', () => {
  it('patchReport accepts a status-only patch', () => {
    assert.equal(patchReportSchema.safeParse({ status: 'fixed' }).success, true);
  });

  it('reply rejects empty body', () => {
    assert.equal(replySchema.safeParse({ body: '' }).success, false);
  });

  it('reply accepts visibility = internal', () => {
    assert.equal(
      replySchema.safeParse({ body: 'noted', visibility: 'internal' }).success,
      true,
    );
  });
});

describe('urlMatchesDomain', () => {
  it('accepts apex match', () => {
    assert.equal(urlMatchesDomain('https://acme.com/guide', 'acme.com'), true);
  });

  it('accepts subdomain match', () => {
    assert.equal(urlMatchesDomain('https://docs.acme.com/guide', 'acme.com'), true);
  });

  it('rejects unrelated host', () => {
    assert.equal(urlMatchesDomain('https://attacker.com/acme.com', 'acme.com'), false);
  });

  it('rejects suffix-only spoof', () => {
    assert.equal(urlMatchesDomain('https://notacme.com/x', 'acme.com'), false);
  });

  it('rejects non-http schemes', () => {
    assert.equal(urlMatchesDomain('javascript:alert(1)', 'acme.com'), false);
  });

  it('returns false on malformed URLs', () => {
    assert.equal(urlMatchesDomain('not-a-url', 'acme.com'), false);
  });
});
