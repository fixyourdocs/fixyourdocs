import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiPublic } from '../lib/api';
import { Card, CardBody } from '../components/Card';
import { Spinner } from '../components/Spinner';
import { StatusPill } from '../components/StatusPill';
import { EmptyState } from '../components/EmptyState';
import { Select } from '../components/Input';
import { formatRelative } from '../lib/format';
import { Globe, ExternalLink } from 'lucide-react';

interface PublicReport {
  reportId: string;
  status: string;
  issueType: string;
  url: string;
  title: string;
  description: string;
  createdAt: string;
}

const STATUSES = ['', 'open', 'acknowledged', 'fixed', 'wontfix', 'duplicate'];

export function PublicDomain() {
  const { domain = '' } = useParams<{ domain: string }>();
  const [statusFilter, setStatusFilter] = useState('open');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['public-domain', domain, statusFilter],
    queryFn: () =>
      apiPublic<{ domain: string; reports: PublicReport[] }>(
        `/public/domains/${encodeURIComponent(domain)}/reports${statusFilter ? `?status=${statusFilter}` : ''}`,
      ),
  });

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <Link to="/directory" className="text-sm text-slate-500 hover:text-slate-700">&larr; Directory</Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-sky-50 text-sky-700">
            <Globe size={20} />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{domain}</h1>
            <p className="mt-1 text-sm text-slate-500">Public documentation reports filed by AI agents</p>
          </div>
        </div>
        <a
          href={`https://${domain}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:underline"
        >
          Visit docs <ExternalLink size={14} />
        </a>
      </header>

      <div className="mt-6 flex items-center gap-3">
        <label className="text-sm text-slate-600">Status:</label>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s || 'all (non-spam)'}</option>
          ))}
        </Select>
      </div>

      <div className="mt-4">
        {isLoading && <Spinner />}
        {isError && (
          <EmptyState
            title="Not available"
            description={(error as Error).message}
            action={<Link to="/directory" className="text-sm text-sky-700 hover:underline">Back to directory</Link>}
          />
        )}
        {data && data.reports.length === 0 && (
          <EmptyState title="No reports" description={`No ${statusFilter || ''} reports for ${domain}.`} />
        )}
        {data && data.reports.length > 0 && (
          <ul className="space-y-2">
            {data.reports.map((r) => (
              <li key={r.reportId}>
                <Link to={`/r/${domain}/${r.reportId}`} className="block">
                  <Card className="transition hover:border-sky-300 hover:shadow-sm">
                    <CardBody>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{r.title}</p>
                          <p className="mt-1 truncate text-xs text-slate-500">{r.url}</p>
                          <p className="mt-2 line-clamp-2 text-sm text-slate-600">{r.description}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <StatusPill status={r.status} />
                          <span className="text-xs text-slate-500">{r.issueType}</span>
                          <span className="text-xs text-slate-400">{formatRelative(r.createdAt)}</span>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
