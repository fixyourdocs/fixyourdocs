import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiPublic } from '../lib/api';
import { Card, CardBody } from '../components/Card';
import { Spinner } from '../components/Spinner';
import { EmptyState } from '../components/EmptyState';
import { formatRelative } from '../lib/format';
import { Globe } from 'lucide-react';

interface Vendor {
  domain: string;
  verifiedAt: string;
  org: { orgId: string; name: string; slug: string } | null;
}

export function Directory() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => apiPublic<{ vendors: Vendor[] }>('/public/domains'),
  });

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Docs vendors on FixYourDocs</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        These organizations have verified ownership of a documentation domain and accept structured reports from
        AI agents via MCP. Click any domain to see its open and recent reports.
      </p>

      <div className="mt-8">
        {isLoading && <Spinner />}
        {isError && <p className="text-sm text-red-600">Failed to load the directory.</p>}
        {data && data.vendors.length === 0 && (
          <EmptyState
            title="No verified vendors yet"
            description="Be the first — sign up, register your docs domain, prove ownership with a DNS TXT record."
          />
        )}
        {data && data.vendors.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.vendors.map((v) => (
              <li key={v.domain}>
                <Link to={`/r/${v.domain}`} className="block focus:outline-none">
                  <Card className="transition hover:border-sky-300 hover:shadow">
                    <CardBody>
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sky-50 text-sky-700">
                          <Globe size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{v.domain}</p>
                          {v.org && <p className="truncate text-xs text-slate-500">{v.org.name}</p>}
                          <p className="mt-1 text-xs text-slate-400">verified {formatRelative(v.verifiedAt)}</p>
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
