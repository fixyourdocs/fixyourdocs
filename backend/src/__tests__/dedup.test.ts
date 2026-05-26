import { describe, it, expect } from 'vitest';
import { computeDedupKey, dayBucket } from '../lib/dedup';
import type { FileReport } from '../lib/validation';

const baseReport: FileReport = {
  protocol_version: '0',
  doc_url: 'https://docs.example.com/page',
  agent: { name: 'claude-code' },
  report: {
    kind: 'outdated',
    summary: 'Section 3 says X but the CLI rejects X',
    details: 'unimportant for dedup',
  },
};

const fixedDay = new Date('2026-05-26T12:00:00Z');
const sameDay = new Date('2026-05-26T23:59:59Z');
const nextDay = new Date('2026-05-27T00:00:01Z');

describe('computeDedupKey', () => {
  it('is deterministic for identical inputs on the same day', () => {
    const a = computeDedupKey(baseReport, fixedDay);
    const b = computeDedupKey(baseReport, sameDay);
    expect(a).toBe(b);
  });

  it('ignores the details field (not part of the key)', () => {
    const a = computeDedupKey(baseReport, fixedDay);
    const b = computeDedupKey(
      { ...baseReport, report: { ...baseReport.report, details: 'totally different' } },
      fixedDay,
    );
    expect(a).toBe(b);
  });

  it('changes when doc_url changes', () => {
    const a = computeDedupKey(baseReport, fixedDay);
    const b = computeDedupKey({ ...baseReport, doc_url: 'https://docs.example.com/other' }, fixedDay);
    expect(a).not.toBe(b);
  });

  it('changes when summary changes', () => {
    const a = computeDedupKey(baseReport, fixedDay);
    const b = computeDedupKey(
      { ...baseReport, report: { ...baseReport.report, summary: 'different summary' } },
      fixedDay,
    );
    expect(a).not.toBe(b);
  });

  it('changes when agent.name changes', () => {
    const a = computeDedupKey(baseReport, fixedDay);
    const b = computeDedupKey({ ...baseReport, agent: { name: 'gpt-5' } }, fixedDay);
    expect(a).not.toBe(b);
  });

  it('changes across the UTC day boundary', () => {
    const a = computeDedupKey(baseReport, sameDay);
    const b = computeDedupKey(baseReport, nextDay);
    expect(a).not.toBe(b);
  });

  it('returns a 64-char hex string', () => {
    expect(computeDedupKey(baseReport, fixedDay)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('dayBucket', () => {
  it('produces ISO YYYY-MM-DD in UTC', () => {
    expect(dayBucket(fixedDay)).toBe('2026-05-26');
  });

  it('rolls over at UTC midnight', () => {
    expect(dayBucket(sameDay)).toBe('2026-05-26');
    expect(dayBucket(nextDay)).toBe('2026-05-27');
  });
});
