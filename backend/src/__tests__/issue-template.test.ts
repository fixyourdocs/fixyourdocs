import { describe, it, expect } from 'vitest';
import { renderIssue } from '../lib/issue-template';

const ZWSP = '​';

describe('renderIssue', () => {
  it('substitutes the known placeholders', () => {
    const { body } = renderIssue('S: {summary}\nD: {details}\nU: {doc_url}', {
      summary: 'broken link',
      details: 'the anchor 404s',
      doc_url: 'https://docs.example.com/p',
    });
    expect(body).toBe('S: broken link\nD: the anchor 404s\nU: https://docs.example.com/p');
  });

  it('substitutes agent_name and report_kind', () => {
    const { body } = renderIssue('agent={agent_name} kind={report_kind}', {
      summary: 's',
      doc_url: 'https://e.com',
      agent_name: 'claude-code',
      report_kind: 'outdated',
    });
    expect(body).toBe('agent=claude-code kind=outdated');
  });

  it('renders agent_name/report_kind empty when absent (no throw)', () => {
    const { body } = renderIssue('[{agent_name}/{report_kind}]', { summary: 's', doc_url: 'https://e.com' });
    expect(body).toBe('[/]');
  });

  it('derives a [docs]-prefixed title truncated to 120 chars', () => {
    const long = 'x'.repeat(200);
    const { title } = renderIssue('{summary}', { summary: long, doc_url: 'https://e.com' });
    expect(title.startsWith('[docs] ')).toBe(true);
    expect(title.length).toBe(120);
  });

  it('neutralizes @mentions and #refs so they do not spam the repo', () => {
    const { body, title } = renderIssue('{summary}', {
      summary: '@maintainer please see #1',
      doc_url: 'https://e.com',
    });
    // The raw live forms must not survive.
    expect(body).not.toContain('@maintainer');
    expect(body).not.toContain('#1 ');
    expect(body).toContain(`@${ZWSP}maintainer`);
    expect(body).toContain(`#${ZWSP}1`);
    expect(title).toContain(`@${ZWSP}maintainer`);
  });

  it('rejects an unknown placeholder', () => {
    expect(() => renderIssue('{summary} {bogus}', { summary: 's', doc_url: 'https://e.com' })).toThrow(
      /Unknown placeholder \{bogus\}/,
    );
  });

  it('drops a non-http(s) doc_url (javascript: / data: cannot smuggle a link)', () => {
    const { body } = renderIssue('{doc_url}', {
      summary: 's',
      doc_url: 'javascript:alert(1)',
    });
    expect(body).toBe('(invalid url)');
  });

  it('does not re-expand placeholders that appear inside replacement text', () => {
    const { body } = renderIssue('{summary}', { summary: '{doc_url}', doc_url: 'https://e.com' });
    // The literal {doc_url} from summary must survive verbatim, not be expanded.
    expect(body).toBe('{doc_url}');
  });
});
