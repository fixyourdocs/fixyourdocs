import { FormEvent, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '../components/Button';
import { Input, Label } from '../components/Input';
import { Card, CardBody, CardHeader } from '../components/Card';
import { ApiError, api } from '../lib/api';
import { env } from '../lib/env';

const DEFAULT_TEMPLATE = `**Docs feedback from an AI agent**

- URL: {doc_url}
- Agent: {agent_name}
- Kind: {report_kind}

{summary}

{details}
`;

// Error codes the install callback redirects back with (?error=...).
const INSTALL_ERRORS: Record<string, string> = {
  not_your_installation: "You don't have admin access to that GitHub installation.",
  state_mismatch: 'Your install session expired — please start the install again.',
  github_oauth_failed: "Couldn't verify your GitHub authorization — please try again.",
  rate_limited: 'Too many attempts — wait a moment and try again.',
  invalid_request: 'GitHub returned an unexpected response — please try again.',
};

export function IntegrationsSetup() {
  const [step, setStep] = useState<'install' | 'configure' | 'done'>('install');
  const [installationId, setInstallationId] = useState('');
  const [repoOwner, setRepoOwner] = useState('');
  const [repoName, setRepoName] = useState('');
  const [issueTemplate, setIssueTemplate] = useState(DEFAULT_TEMPLATE);
  const [error, setError] = useState<string | null>(null);

  // After GitHub redirects back to this page, advance to "configure"
  // (prefilling the installation id) or surface the error, then strip the
  // query so a refresh doesn't re-trigger it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get('error');
    const installed = params.get('installed');
    if (errorCode) {
      setError(INSTALL_ERRORS[errorCode] ?? `GitHub install failed (${errorCode}). Please try again.`);
    } else if (installed === '1') {
      const instId = params.get('installation_id');
      if (instId) setInstallationId(instId);
      setStep('configure');
    }
    if (errorCode || installed) {
      window.history.replaceState({}, '', '/integrations/github');
    }
  }, []);

  const startInstall = useMutation({
    mutationFn: async () => {
      // install is authed (the JWT authoriser reads the Authorization header),
      // so we fetch with the header via api() and then redirect the browser to
      // the returned GitHub URL — a top-level navigation couldn't carry the header.
      const { url } = await api<{ url: string }>('/v1/integrations/github/install');
      window.location.href = url;
    },
    onError: () => setError('Could not start the GitHub install flow.'),
  });

  const save = useMutation({
    mutationFn: () =>
      api<{ ok: true }>('/v1/orgs/me/integrations/github', {
        method: 'POST',
        body: JSON.stringify({
          installation_id: Number(installationId),
          repo_owner: repoOwner,
          repo_name: repoName,
          issue_template: issueTemplate,
        }),
      }),
    onSuccess: () => setStep('done'),
    onError: (err: ApiError) => setError(err.message),
  });

  function onConfigureSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    save.mutate();
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-slate-900">Connect a GitHub repo</h2>
          <p className="mt-1 text-sm text-slate-500">
            FixYourDocs forwards every accepted report as a GitHub Issue on a repo you control.
          </p>
        </CardHeader>
        <CardBody>
          {step === 'install' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Step 1 of 2. Install the FixYourDocs GitHub App on the repo where you want
                Issues to land.
              </p>
              <Button onClick={() => startInstall.mutate()} disabled={startInstall.isPending}>
                {startInstall.isPending ? 'Redirecting…' : 'Install the GitHub App'}
              </Button>
              <p className="text-xs text-slate-500">
                After install, GitHub will redirect you back here to complete configuration.
              </p>
              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer">Already installed? Enter the details manually</summary>
                <button
                  type="button"
                  className="mt-2 text-sky-700 underline"
                  onClick={() => setStep('configure')}
                >
                  Configure manually
                </button>
              </details>
            </div>
          )}

          {step === 'configure' && (
            <form onSubmit={onConfigureSubmit} className="space-y-4">
              <div>
                <Label htmlFor="installationId">GitHub installation id</Label>
                <Input
                  id="installationId"
                  value={installationId}
                  onChange={(e) => setInstallationId(e.target.value)}
                  inputMode="numeric"
                  placeholder="e.g. 12345678"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="repoOwner">Repo owner</Label>
                  <Input
                    id="repoOwner"
                    value={repoOwner}
                    onChange={(e) => setRepoOwner(e.target.value)}
                    placeholder="acme"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="repoName">Repo name</Label>
                  <Input
                    id="repoName"
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                    placeholder="docs"
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="issueTemplate">Issue template</Label>
                <textarea
                  id="issueTemplate"
                  value={issueTemplate}
                  onChange={(e) => setIssueTemplate(e.target.value)}
                  rows={10}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Placeholders: <code>{'{doc_url}'}</code>, <code>{'{agent_name}'}</code>,{' '}
                  <code>{'{report_kind}'}</code>, <code>{'{summary}'}</code>, <code>{'{details}'}</code>.
                </p>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? 'Saving…' : 'Save integration'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setStep('install')}>
                  Back
                </Button>
              </div>
            </form>
          )}

          {step === 'done' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">
                Your integration is live. Reports posted to{' '}
                <code className="rounded bg-slate-100 px-1 text-xs">
                  POST {env.HUB_BASE_URL}/v1/reports
                </code>{' '}
                will land as Issues on{' '}
                <code className="rounded bg-slate-100 px-1 text-xs">
                  {repoOwner}/{repoName}
                </code>{' '}
                within a few seconds.
              </p>
              <p className="text-sm text-slate-600">
                Point your agents at the Hub URL, or use one of the SDKs and the AGENTS.md
                snippet to make this part of every agent run on your docs.
              </p>
            </div>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
