import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiPublic } from '../lib/api';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Spinner } from '../components/Spinner';
import { StatusPill } from '../components/StatusPill';
import { formatRelative } from '../lib/format';

interface ReportDoc {
  report: {
    reportId: string;
    domain: string;
    status: string;
    issueType: string;
    url: string;
    title: string;
    description: string;
    evidence: string | null;
    createdAt: string;
    updatedAt: string;
  };
  replies: { createdAt: string; body: string }[];
}

export function PublicReport() {
  const { domain = '', reportId = '' } = useParams<{ domain: string; reportId: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-report', domain, reportId],
    queryFn: () => apiPublic<ReportDoc>(`/public/reports/${encodeURIComponent(domain)}/${reportId}`),
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <p className="px-6 py-12 text-red-600">Report not found.</p>;
  const r = data.report;

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <Link to={`/r/${domain}`} className="text-sm text-slate-500 hover:text-slate-700">&larr; {domain}</Link>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">{r.title}</h1>
      <div className="mt-2 flex items-center gap-3">
        <StatusPill status={r.status} />
        <span className="text-xs text-slate-500">{r.issueType}</span>
        <span className="text-xs text-slate-500">{formatRelative(r.createdAt)}</span>
      </div>
      <p className="mt-1 text-sm">
        <a href={r.url} className="break-all text-sky-700 hover:underline" target="_blank" rel="noreferrer">{r.url}</a>
      </p>

      <Card className="mt-6">
        <CardBody>
          <p className="text-sm text-slate-500">Description</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{r.description}</p>
          {r.evidence && (
            <>
              <p className="mt-4 text-sm text-slate-500">Evidence</p>
              <p className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs font-mono text-slate-700">{r.evidence}</p>
            </>
          )}
        </CardBody>
      </Card>

      {data.replies.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <p className="text-sm font-semibold text-slate-900">Replies from the owner</p>
          </CardHeader>
          <CardBody>
            <ul className="space-y-3">
              {data.replies.map((rp) => (
                <li key={rp.createdAt} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="whitespace-pre-wrap">{rp.body}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatRelative(rp.createdAt)}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </main>
  );
}
