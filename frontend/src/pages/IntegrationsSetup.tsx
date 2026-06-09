import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/Button';
import { Input, Textarea, Label } from '../components/Input';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Spinner } from '../components/Spinner';
import {
  ApiError,
  api,
  deleteAccount,
  deleteDomain,
  deleteIntegration,
  deleteRepoConfig,
} from '../lib/api';
import { signOut } from '../lib/auth';
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

interface Integration {
  status: string;
  installationId?: number;
  installAccountLogin?: string;
  repoOwner?: string;
  repoName?: string;
  issueTemplate?: string;
}
interface DnsRecord {
  name: string;
  type: string;
  value: string;
}
interface DomainView {
  domain: string;
  status: string;
  createdAt?: string;
  verifiedAt?: string;
  dns_record?: DnsRecord;
}
interface Me {
  sub: string;
  email?: string;
  integration: Integration | null;
  domains: DomainView[];
}

const BADGE: Record<string, string> = {
  verified: 'bg-green-100 text-green-800',
  configured: 'bg-green-100 text-green-800',
  pending: 'bg-amber-100 text-amber-800',
  installed: 'bg-sky-100 text-sky-800',
  revoked: 'bg-slate-100 text-slate-600',
};

function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
        <code className="block truncate font-mono text-xs text-slate-800">{value}</code>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={async () => {
          await navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

export function IntegrationsSetup() {
  const qc = useQueryClient();
  const [banner, setBanner] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Handle the GitHub install redirect (?installed=1 / ?error=...), then strip
  // the query so a refresh doesn't replay it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get('error');
    const installed = params.get('installed');
    if (errorCode) {
      setBanner({ kind: 'error', text: INSTALL_ERRORS[errorCode] ?? `GitHub install failed (${errorCode}).` });
    } else if (installed === '1') {
      setBanner({ kind: 'ok', text: 'GitHub App installed — now pick the repo reports should land in.' });
      qc.invalidateQueries({ queryKey: ['me'] });
    }
    if (errorCode || installed) window.history.replaceState({}, '', '/integrations/github');
  }, [qc]);

  const me = useQuery<Me>({ queryKey: ['me'], queryFn: () => api<Me>('/v1/orgs/me') });

  if (me.isLoading) return <Spinner />;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Connect a repo and verify the domains your docs live on.</p>
      </div>

      {banner && (
        <div className={`rounded-md px-4 py-3 text-sm ${banner.kind === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          {banner.text}
        </div>
      )}

      {me.isError || !me.data ? (
        <Card>
          <CardBody>
            <p className="text-sm text-red-600">Couldn't load your settings. Refresh to try again.</p>
          </CardBody>
        </Card>
      ) : (
        <>
          <GithubRepoSection integration={me.data.integration} />
          <DomainsSection domains={me.data.domains} />
          <p className="text-xs text-slate-500">
            Agents post to{' '}
            <code className="rounded bg-slate-100 px-1">{`POST ${env.HUB_BASE_URL}/v1/reports`}</code>. A report whose{' '}
            <code className="rounded bg-slate-100 px-1">doc_url</code> is on a verified domain lands as an Issue on your connected repo within seconds.
          </p>
          <DangerZone email={me.data.email} />
        </>
      )}
    </main>
  );
}

// "Delete account" is irreversible and cascades (domains + integration + GitHub
// link + Cognito user), so gate it behind a typed confirmation. On success we
// clear the local Cognito session and bounce to the landing page — the user no
// longer exists, so any further authed call would 401 anyway.
function DangerZone({ email }: { email?: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const expected = email ?? 'DELETE';

  const del = useMutation({
    mutationFn: () => deleteAccount(),
    onSuccess: () => {
      signOut(); // clears amazon-cognito-identity-js localStorage tokens
      navigate('/', { replace: true });
    },
    onError: (err: ApiError) => setError(err.message),
  });

  return (
    <Card className="border-red-200">
      <CardHeader>
        <h2 className="text-base font-semibold text-red-700">Danger zone</h2>
        <p className="mt-1 text-sm text-slate-500">
          Permanently delete your account. This removes your verified domains, your GitHub
          integration (and uninstalls the FixYourDocs App), and your sign-in — and cannot be undone.
        </p>
      </CardHeader>
      <CardBody className="space-y-4">
        {!open ? (
          <Button variant="danger" onClick={() => setOpen(true)}>
            Delete account
          </Button>
        ) : (
          <div className="space-y-3 rounded-md border border-red-200 bg-red-50 p-4">
            <Label htmlFor="confirmDelete">
              Type <code className="rounded bg-white px-1 text-xs">{expected}</code> to confirm
            </Label>
            <Input
              id="confirmDelete"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={expected}
              autoComplete="off"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex items-center gap-3">
              <Button
                variant="danger"
                disabled={confirm !== expected || del.isPending}
                onClick={() => {
                  setError(null);
                  del.mutate();
                }}
              >
                {del.isPending ? 'Deleting…' : 'Permanently delete'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setOpen(false);
                  setConfirm('');
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function GithubRepoSection({ integration }: { integration: Integration | null }) {
  const qc = useQueryClient();
  const installed = !!integration;
  const configured = integration?.status === 'configured';

  const [repoOwner, setRepoOwner] = useState(integration?.repoOwner ?? '');
  const [repoName, setRepoName] = useState(integration?.repoName ?? '');
  const [issueTemplate, setIssueTemplate] = useState(integration?.issueTemplate ?? DEFAULT_TEMPLATE);
  const [error, setError] = useState<string | null>(null);

  // Re-sync the form when the integration finishes loading / changes.
  useEffect(() => {
    setRepoOwner(integration?.repoOwner ?? '');
    setRepoName(integration?.repoName ?? '');
    setIssueTemplate(integration?.issueTemplate ?? DEFAULT_TEMPLATE);
  }, [integration?.repoOwner, integration?.repoName, integration?.issueTemplate]);

  const startInstall = useMutation({
    mutationFn: async () => {
      // install is authed; api() attaches the bearer, then we redirect to the
      // returned GitHub URL (a top-level navigation couldn't carry the header).
      const { url } = await api<{ url: string }>('/v1/integrations/github/install');
      window.location.href = url;
    },
    onError: () => setError('Could not start the GitHub install flow.'),
  });

  const save = useMutation({
    mutationFn: () =>
      api<{ status: string; repo: string }>('/v1/orgs/me/integrations/github', {
        method: 'POST',
        body: JSON.stringify({
          installation_id: integration?.installationId ?? 0,
          repo_owner: repoOwner.trim(),
          repo_name: repoName.trim(),
          issue_template: issueTemplate,
        }),
      }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: ApiError) =>
      setError(err.code === 'no_installation' ? 'Install the GitHub App first.' : err.message),
  });

  const removeRepo = useMutation({
    mutationFn: () => deleteRepoConfig(),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: ApiError) => setError(err.message),
  });

  const disconnect = useMutation({
    mutationFn: () => deleteIntegration(),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: ApiError) => setError(err.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    save.mutate();
  }

  return (
    <Card>
      <CardHeader className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">GitHub repo</h2>
          <p className="mt-1 text-sm text-slate-500">Accepted reports are forwarded here as Issues.</p>
        </div>
        {installed && integration && <Badge status={integration.status} />}
      </CardHeader>
      <CardBody className="space-y-4">
        {configured ? (
          <p className="text-sm text-slate-700">
            Connected — reports go to{' '}
            <code className="rounded bg-slate-100 px-1 text-xs">
              {integration!.repoOwner}/{integration!.repoName}
            </code>
            .
          </p>
        ) : installed ? (
          <p className="text-sm text-slate-700">
            GitHub App installed
            {integration?.installAccountLogin ? (
              <>
                {' '}
                on <code className="rounded bg-slate-100 px-1 text-xs">{integration.installAccountLogin}</code>
              </>
            ) : null}
            . Pick the repo reports should land in.
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            Install the FixYourDocs GitHub App on the repo where Issues should land.
          </p>
        )}

        <div>
          <Button
            variant={installed ? 'secondary' : 'primary'}
            onClick={() => startInstall.mutate()}
            disabled={startInstall.isPending}
          >
            {startInstall.isPending ? 'Redirecting…' : installed ? 'Manage GitHub App' : 'Install the GitHub App'}
          </Button>
          {installed && <p className="mt-1 text-xs text-slate-500">Add or remove repositories on GitHub.</p>}
        </div>

        <form onSubmit={onSubmit} className="space-y-4 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="repoOwner">Repo owner</Label>
              <Input id="repoOwner" value={repoOwner} onChange={(e) => setRepoOwner(e.target.value)} placeholder="acme" required />
            </div>
            <div>
              <Label htmlFor="repoName">Repo name</Label>
              <Input id="repoName" value={repoName} onChange={(e) => setRepoName(e.target.value)} placeholder="docs" required />
            </div>
          </div>
          <div>
            <Label htmlFor="issueTemplate">Issue template</Label>
            <Textarea
              id="issueTemplate"
              value={issueTemplate}
              onChange={(e) => setIssueTemplate(e.target.value)}
              rows={10}
              className="font-mono text-xs"
            />
            <p className="mt-1 text-xs text-slate-500">
              Placeholders: <code>{'{doc_url}'}</code>, <code>{'{agent_name}'}</code>, <code>{'{report_kind}'}</code>,{' '}
              <code>{'{summary}'}</code>, <code>{'{details}'}</code>.
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={save.isPending || !installed}>
              {save.isPending ? 'Saving…' : configured ? 'Update integration' : 'Save integration'}
            </Button>
            {!installed && <span className="text-xs text-slate-500">Install the app first to enable saving.</span>}
            {save.isSuccess && !save.isPending && <span className="text-xs text-green-700">Saved.</span>}
          </div>
        </form>

        {installed && (
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            {configured && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => removeRepo.mutate()}
                disabled={removeRepo.isPending}
              >
                {removeRepo.isPending ? 'Removing…' : 'Remove repo'}
              </Button>
            )}
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              {disconnect.isPending ? 'Disconnecting…' : 'Disconnect GitHub'}
            </Button>
            <span className="text-xs text-slate-500">
              Disconnect also uninstalls the FixYourDocs App from your GitHub account.
            </span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function DomainsSection({ domains }: { domains: DomainView[] }) {
  const qc = useQueryClient();
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);

  const claim = useMutation({
    mutationFn: () => api('/v1/orgs/me/domains', { method: 'POST', body: JSON.stringify({ domain: domain.trim() }) }),
    onSuccess: () => {
      setDomain('');
      setError(null);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: ApiError) => setError(err.message),
  });

  const verify = useMutation({
    mutationFn: (d: string) =>
      api<{ status: string; hint?: string }>(`/v1/orgs/me/domains/${encodeURIComponent(d)}/verify`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  const remove = useMutation({
    mutationFn: (d: string) => deleteDomain(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
    onError: (err: ApiError) => setError(err.message),
  });

  function onClaim(e: FormEvent) {
    e.preventDefault();
    setError(null);
    claim.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-slate-900">Verified domains</h2>
        <p className="mt-1 text-sm text-slate-500">
          A report routes to your repo only when its{' '}
          <code className="rounded bg-slate-100 px-1 text-xs">doc_url</code> is on a domain you've verified you own.
        </p>
      </CardHeader>
      <CardBody className="space-y-5">
        <form onSubmit={onClaim} className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="domain">Add a domain</Label>
            <Input id="domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="docs.acme.com" required />
          </div>
          <Button type="submit" disabled={claim.isPending}>
            {claim.isPending ? 'Claiming…' : 'Claim domain'}
          </Button>
        </form>
        {error && <p className="text-sm text-red-600">{error}</p>}

        {domains.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            No domains yet. Claim the domain your docs live on so reports can route to your repo.
          </p>
        ) : (
          <ul className="space-y-4">
            {domains.map((d) => {
              const verifying = verify.isPending && verify.variables === d.domain;
              const removing = remove.isPending && remove.variables === d.domain;
              const hint = verify.variables === d.domain && verify.data?.status === 'pending' ? verify.data.hint : null;
              return (
                <li key={d.domain} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <code className="truncate font-mono text-sm text-slate-800">{d.domain}</code>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge status={d.status} />
                      {d.status !== 'verified' && (
                        <Button type="button" variant="secondary" size="sm" onClick={() => verify.mutate(d.domain)} disabled={verifying}>
                          {verifying ? 'Checking…' : 'Verify'}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => remove.mutate(d.domain)}
                        disabled={removing}
                      >
                        {removing ? 'Removing…' : 'Remove'}
                      </Button>
                    </div>
                  </div>
                  {d.status === 'pending' && d.dns_record && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-slate-500">Add this DNS TXT record at your domain host, then click Verify:</p>
                      <CopyField label="Name" value={d.dns_record.name} />
                      <CopyField label="Value" value={d.dns_record.value} />
                      {hint && <p className="text-xs text-amber-700">{hint}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
