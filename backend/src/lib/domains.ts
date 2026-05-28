import { randomBytes } from 'node:crypto';
import { domainToASCII } from 'node:url';
import { resolveTxt } from 'node:dns/promises';
import { parse } from 'tldts';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from './db';
import { HttpError } from './auth';

export const CHALLENGE_LABEL = '_fixyourdocs-challenge';

// `github.io`, `pages.dev`, etc. are PRIVATE entries in the Public Suffix List.
// tldts ignores them unless allowPrivateDomains is set, which would let an
// attacker claim `github.io` itself (S19). Use the same option at claim time
// AND resolve time so the registrable boundary is identical in both places.
const PSL_OPTS = { allowPrivateDomains: true } as const;

export interface DomainRow {
  domain: string;
  userId: string;
  status: 'pending' | 'verified' | 'revoked';
  challengeToken: string;
  createdAt: string;
  verifiedAt?: string;
  lastCheckedAt?: string;
}

// Canonical form used at BOTH claim time and resolve time, so a host can't
// dodge a claim by casing/encoding and an IDN homograph can't masquerade (S21).
export function normalizeDomain(input: string): string {
  const ascii = domainToASCII(input.trim().toLowerCase().replace(/\.$/, ''));
  if (!ascii || !ascii.includes('.')) {
    throw new HttpError(400, 'invalid_domain', 'Not a valid domain name');
  }
  return ascii;
}

// (S19) Reject public suffixes (`com`, `github.io`, `pages.dev`). Only a
// registrable domain or a subdomain of one has a non-null `.domain`.
export function assertClaimable(domain: string): void {
  if (!parse(domain, PSL_OPTS).domain) {
    throw new HttpError(400, 'public_suffix', 'Claim your own (sub)domain, not a public suffix');
  }
}

// (A19) Suffixes of `host` from most-specific down to the registrable domain,
// e.g. docs.api.acme.io → [docs.api.acme.io, api.acme.io, acme.io]. Never below
// the registrable boundary, so we never query a public suffix.
export function candidateDomains(host: string): string[] {
  const registrable = parse(host, PSL_OPTS).domain;
  if (!registrable) return [];
  const labels = host.split('.');
  const regLen = registrable.split('.').length;
  const out: string[] = [];
  for (let i = 0; i <= labels.length - regLen; i += 1) {
    out.push(labels.slice(i).join('.'));
  }
  return out;
}

export async function getDomain(domain: string): Promise<DomainRow | null> {
  const res = await ddb.send(new GetCommand({ TableName: tables.domains, Key: { domain } }));
  return (res.Item as DomainRow | undefined) ?? null;
}

export const newChallengeToken = (): string => randomBytes(24).toString('base64url');

export function challengeRecord(domain: string, token: string) {
  return { name: `${CHALLENGE_LABEL}.${domain}`, type: 'TXT', value: `fyd-verify=${token}` };
}

// (S24) DNS-only: resolve ONLY the fixed challenge label, never an arbitrary
// user-supplied hostname, never an HTTP fetch to the domain.
export async function verifyTxt(domain: string, token: string): Promise<boolean> {
  let records: string[][];
  try {
    records = await resolveTxt(`${CHALLENGE_LABEL}.${domain}`);
  } catch {
    return false; // NXDOMAIN / no TXT yet
  }
  const want = `fyd-verify=${token}`;
  return records.some((chunks) => chunks.join('').trim() === want);
}
