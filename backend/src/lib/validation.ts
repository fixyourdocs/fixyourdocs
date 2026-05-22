import { z } from 'zod';

const hostnameRegex = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

const PRIVATE_HOSTS = new Set(['localhost', 'localhost.localdomain']);

export const slugRegex = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export const orgCreateSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().regex(slugRegex, 'invalid slug'),
});

export const domainSchema = z
  .string()
  .min(3)
  .max(253)
  .transform((s) => s.toLowerCase().trim().replace(/\.$/, ''))
  .refine((s) => hostnameRegex.test(s), 'invalid domain')
  .refine((s) => !PRIVATE_HOSTS.has(s), 'private hostname not allowed')
  .refine((s) => !/^\d+\.\d+\.\d+\.\d+$/.test(s), 'ip not allowed');

export const registerDomainSchema = z.object({
  domain: domainSchema,
});

export const issueTypeSchema = z.enum([
  'gap',
  'outdated',
  'contradiction',
  'dead_end',
  'broken_link',
  'other',
]);

export const statusSchema = z.enum([
  'open',
  'acknowledged',
  'fixed',
  'wontfix',
  'duplicate',
  'spam',
]);

export const fileReportSchema = z.object({
  domain: domainSchema,
  url: z.string().url().max(2048),
  issueType: issueTypeSchema,
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(4000),
  evidence: z.string().max(8000).optional(),
});

export const listReportsSchema = z.object({
  domain: domainSchema,
  status: statusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const patchReportSchema = z.object({
  status: statusSchema.optional(),
  note: z.string().max(4000).optional(),
});

export const replySchema = z.object({
  body: z.string().min(1).max(4000),
  visibility: z.enum(['public', 'internal']).optional(),
});

export function urlMatchesDomain(url: string, domain: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return host === domain || host.endsWith('.' + domain);
  } catch {
    return false;
  }
}
