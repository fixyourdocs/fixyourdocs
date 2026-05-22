import { FormEvent, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDefaultOrg } from '../hooks/useOrg';
import { ApiError, api, apiPublic } from '../lib/api';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { StatusPill } from '../components/StatusPill';
import { Select, Textarea, Label } from '../components/Input';
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

const SETTABLE = ['open', 'acknowledged', 'fixed', 'wontfix', 'duplicate', 'spam'];

export function ReportDetail() {
  const { domain = '', reportId = '' } = useParams<{ domain: string; reportId: string }>();
  const { org, isLoading } = useDefaultOrg();
  if (isLoading) return <Spinner />;
  if (!org) return <Navigate to="/onboarding" replace />;
  return <Inner orgId={org.orgId} domain={domain} reportId={reportId} />;
}

function Inner({ domain, reportId }: { orgId: string; domain: string; reportId: string }) {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['report', domain, reportId],
    queryFn: () => apiPublic<ReportDoc>(`/public/reports/${encodeURIComponent(domain)}/${reportId}`),
  });

  const patchMut = useMutation({
    mutationFn: (status: string) =>
      api(`/api/reports/${encodeURIComponent(domain)}/${reportId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report', domain, reportId] }),
  });

  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const replyMut = useMutation({
    mutationFn: () =>
      api(`/api/reports/${encodeURIComponent(domain)}/${reportId}/replies`, {
        method: 'POST',
        body: JSON.stringify({ body, visibility: 'public' }),
      }),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['report', domain, reportId] });
    },
    onError: (e: ApiError) => setErr(e.message),
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <p className="px-6 py-12 text-red-600">Report not found.</p>;
  const r = data.report;

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <Link to={`/app/domains/${domain}`} className="text-sm text-slate-500 hover:text-slate-700">&larr; {domain}</Link>
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
          <p className="text-sm text-slate-500">Agent description</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{r.description}</p>
          {r.evidence && (
            <>
              <p className="mt-4 text-sm text-slate-500">Evidence</p>
              <p className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs font-mono text-slate-700">{r.evidence}</p>
            </>
          )}
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <p className="text-sm font-semibold text-slate-900">Triage</p>
        </CardHeader>
        <CardBody>
          <div className="flex items-center gap-3">
            <Label htmlFor="s">Status</Label>
            <Select id="s" defaultValue={r.status} onChange={(e) => patchMut.mutate(e.target.value)} className="w-44">
              {SETTABLE.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
            {patchMut.isPending && <span className="text-xs text-slate-500">saving...</span>}
          </div>
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <p className="text-sm font-semibold text-slate-900">Public replies</p>
        </CardHeader>
        <CardBody>
          {data.replies.length === 0 ? (
            <p className="text-sm text-slate-500">No replies yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.replies.map((rp) => (
                <li key={rp.createdAt} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="whitespace-pre-wrap">{rp.body}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatRelative(rp.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-4 space-y-2"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              setErr(null);
              replyMut.mutate();
            }}
          >
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Reply publicly..." required maxLength={4000} />
            {err && <p className="text-sm text-red-600">{err}</p>}
            <div>
              <Button type="submit" size="sm" disabled={replyMut.isPending || !body.trim()}>
                {replyMut.isPending ? 'Posting...' : 'Post reply'}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </main>
  );
}
