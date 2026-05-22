import { Link, Navigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDefaultOrg } from '../hooks/useOrg';
import { api } from '../lib/api';
import { Card, CardBody } from '../components/Card';
import { Spinner } from '../components/Spinner';
import { StatusPill } from '../components/StatusPill';
import { EmptyState } from '../components/EmptyState';
import { Select } from '../components/Input';
import { formatRelative } from '../lib/format';

interface Report {
  reportId: string;
  status: string;
  issueType: string;
  url: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

const STATUSES = ['', 'open', 'acknowledged', 'fixed', 'wontfix', 'duplicate'];

export function DomainDetail() {
  const { domain = '' } = useParams<{ domain: string }>();
  const { org, isLoading } = useDefaultOrg();
  const [statusFilter, setStatusFilter] = useState<string>('open');

  if (isLoading) return <Spinner />;
  if (!org) return <Navigate to="/onboarding" replace />;

  return <DomainDetailInner orgId={org.orgId} domain={domain} statusFilter={statusFilter} setStatusFilter={setStatusFilter} />;
}

function DomainDetailInner({ orgId, domain, statusFilter, setStatusFilter }: { orgId: string; domain: string; statusFilter: string; setStatusFilter: (s: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports', orgId, domain, statusFilter],
    queryFn: () =>
      api<{ reports: Report[] }>(
        `/api/orgs/${orgId}/reports?domain=${encodeURIComponent(domain)}${statusFilter ? `&status=${statusFilter}` : ''}`,
      ).then((r) => r.reports),
  });

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <Link to="/app/domains" className="text-sm text-slate-500 hover:text-slate-700">&larr; Domains</Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{domain}</h1>
      <p className="mt-1 text-sm text-slate-500">
        Public view: <Link to={`/r/${domain}`} className="text-sky-700 hover:underline">/r/{domain}</Link>
      </p>

      <div className="mt-6 mb-4 flex items-center gap-3">
        <label className="text-sm text-slate-600">Status:</label>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s || 'all'}</option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <Spinner />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No reports" description="Agents will create reports when they hit problems with your docs." />
      ) : (
        <div className="space-y-2">
          {data.map((r) => (
            <Card key={r.reportId}>
              <CardBody>
                <Link to={`/app/reports/${domain}/${r.reportId}`} className="flex items-start justify-between gap-4 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{r.title}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{r.url}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusPill status={r.status} />
                    <span className="text-xs text-slate-500">{formatRelative(r.createdAt)}</span>
                  </div>
                </Link>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
