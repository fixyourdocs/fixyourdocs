import { FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDefaultOrg } from '../hooks/useOrg';
import { ApiError, api } from '../lib/api';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Button } from '../components/Button';
import { Input, Label } from '../components/Input';
import { Spinner } from '../components/Spinner';
import { StatusPill } from '../components/StatusPill';
import { EmptyState } from '../components/EmptyState';

interface DomainRow {
  domain: string;
  status: 'pending' | 'verified' | 'revoked';
  createdAt: string;
  verifiedAt: string | null;
  verification?: { type: string; host: string; value: string };
}

export function Domains() {
  const { org, isLoading } = useDefaultOrg();
  const [adding, setAdding] = useState(false);

  if (isLoading) return <Spinner />;
  if (!org) return <Navigate to="/onboarding" replace />;

  return <DomainsInner orgId={org.orgId} adding={adding} setAdding={setAdding} />;
}

function DomainsInner({ orgId, adding, setAdding }: { orgId: string; adding: boolean; setAdding: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['domains', orgId],
    queryFn: () => api<{ domains: DomainRow[] }>(`/api/orgs/${orgId}/domains`).then((r) => r.domains),
  });

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Documentation domains</h1>
        {!adding && <Button onClick={() => setAdding(true)}>Add domain</Button>}
      </div>

      {adding && (
        <div className="mb-6">
          <AddDomainForm
            orgId={orgId}
            onCancel={() => setAdding(false)}
            onSuccess={() => {
              setAdding(false);
              qc.invalidateQueries({ queryKey: ['domains', orgId] });
            }}
          />
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="No domains yet"
          description="Add the documentation domain you want to receive reports for."
          action={!adding && <Button onClick={() => setAdding(true)}>Add your first domain</Button>}
        />
      ) : (
        <div className="space-y-3">
          {data.map((d) => (
            <DomainCard key={d.domain} orgId={orgId} d={d} onChange={() => qc.invalidateQueries({ queryKey: ['domains', orgId] })} />
          ))}
        </div>
      )}
    </main>
  );
}

function AddDomainForm({ orgId, onCancel, onSuccess }: { orgId: string; onCancel: () => void; onSuccess: () => void }) {
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => api(`/api/orgs/${orgId}/domains`, { method: 'POST', body: JSON.stringify({ domain }) }),
    onSuccess,
    onError: (err: ApiError) => setError(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <p className="text-sm font-semibold text-slate-900">Add a domain</p>
      </CardHeader>
      <CardBody>
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setError(null);
            mut.mutate();
          }}
        >
          <div>
            <Label htmlFor="d">Documentation domain</Label>
            <Input id="d" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="docs.acme.com" required />
            <p className="mt-1 text-xs text-slate-500">You'll prove ownership with a DNS TXT record on the next step.</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? 'Adding...' : 'Add domain'}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function DomainCard({ orgId, d, onChange }: { orgId: string; d: DomainRow; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const verifyMut = useMutation({
    mutationFn: () => api(`/api/orgs/${orgId}/domains/${d.domain}/verify`, { method: 'POST' }),
    onSuccess: onChange,
    onError: (err: ApiError) => setError(err.message),
  });

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link to={`/app/domains/${d.domain}`} className="text-base font-medium text-slate-900 hover:underline">
              {d.domain}
            </Link>
            <div className="mt-1">
              <StatusPill status={d.status} />
            </div>
          </div>
          {d.status === 'pending' && (
            <Button size="sm" onClick={() => verifyMut.mutate()} disabled={verifyMut.isPending}>
              {verifyMut.isPending ? 'Verifying...' : 'Verify'}
            </Button>
          )}
        </div>

        {d.status === 'pending' && d.verification && (
          <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm">
            <p className="font-medium text-slate-700">Add this DNS TXT record:</p>
            <div className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 font-mono text-xs">
              <span className="text-slate-500">Host</span>
              <span className="break-all">{d.verification.host}</span>
              <span className="text-slate-500">Type</span>
              <span>TXT</span>
              <span className="text-slate-500">Value</span>
              <span className="break-all">{d.verification.value}</span>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
