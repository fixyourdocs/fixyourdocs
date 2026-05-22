import { Link, Navigate } from 'react-router-dom';
import { useDefaultOrg } from '../hooks/useOrg';
import { Card, CardBody } from '../components/Card';
import { Spinner } from '../components/Spinner';

export function Dashboard() {
  const { org, isLoading, isError } = useDefaultOrg();

  if (isLoading) return <Spinner />;
  if (isError) return <p className="px-6 py-12 text-red-600">Failed to load orgs.</p>;
  if (!org) return <Navigate to="/onboarding" replace />;

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-6">
        <p className="text-sm text-slate-500">Organization</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{org.name}</h1>
        <p className="mt-1 text-sm text-slate-500">/{org.slug}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardBody>
            <p className="text-sm font-medium text-slate-700">Domains</p>
            <p className="mt-1 text-sm text-slate-500">Register a documentation domain to start receiving reports.</p>
            <Link to="/app/domains" className="mt-3 inline-block text-sm font-medium text-sky-700 hover:underline">
              Manage domains &rarr;
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm font-medium text-slate-700">MCP endpoint</p>
            <p className="mt-1 break-all text-sm font-mono text-slate-500">https://mcp.fixyourdocs.io/mcp</p>
            <p className="mt-2 text-xs text-slate-500">Any MCP-aware agent can file reports against your verified domains.</p>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
