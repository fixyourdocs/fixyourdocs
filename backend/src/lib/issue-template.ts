import { HttpError } from './auth';

// Renders a maintainer's Issue template against an untrusted report. The report
// fields come from the *unauthenticated* POST /v1/reports endpoint, so they are
// neutralized before substitution (audit S5): @mentions and #refs would
// otherwise spam the target repo, and a non-http(s) doc_url could smuggle a
// javascript:/data: link into a markdown autolink.

const PLACEHOLDER = /\{(\w+)\}/g;
const ALLOWED = new Set(['summary', 'details', 'doc_url', 'agent_name', 'report_kind']);
const MAX_BODY = 60_000; // under GitHub's 65536-char issue-body limit

// Insert a zero-width space after a leading @ or # so GitHub stops treating it
// as a live mention / cross-reference.
const neutralize = (v: string): string => v.replace(/([@#])(?=\w)/g, '$1​');

export interface RenderInput {
  summary: string;
  details?: string;
  doc_url: string;
  agent_name?: string;
  report_kind?: string;
}

export function renderIssue(template: string, report: RenderInput): { title: string; body: string } {
  // Reject unknown placeholders up-front — a typo must not silently swallow
  // report content.
  for (const match of template.matchAll(PLACEHOLDER)) {
    if (!ALLOWED.has(match[1]!)) {
      throw new HttpError(400, 'bad_template', `Unknown placeholder {${match[1]}}`);
    }
  }

  const values: Record<string, string> = {
    summary: neutralize(report.summary),
    details: neutralize(report.details ?? ''),
    doc_url: /^https?:\/\//i.test(report.doc_url) ? report.doc_url : '(invalid url)',
    agent_name: neutralize(report.agent_name ?? ''),
    report_kind: neutralize(report.report_kind ?? ''),
  };

  // Single, non-recursive pass: replacement text is never re-scanned for
  // placeholders.
  const body = template.replace(PLACEHOLDER, (_m, key: string) => values[key] ?? '');
  const title = `[docs] ${neutralize(report.summary)}`.slice(0, 120);
  return { title, body: body.slice(0, MAX_BODY) };
}
