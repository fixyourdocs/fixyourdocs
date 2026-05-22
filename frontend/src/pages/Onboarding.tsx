import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/Button';
import { Input, Label } from '../components/Input';
import { Card, CardBody, CardHeader } from '../components/Card';
import { ApiError, api } from '../lib/api';

export function Onboarding() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => api<{ orgId: string }>('/api/orgs', { method: 'POST', body: JSON.stringify({ name, slug }) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['orgs'] });
      navigate('/app', { replace: true });
    },
    onError: (err: ApiError) => setError(err.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mut.mutate();
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-slate-900">Create your organization</h2>
          <p className="mt-1 text-sm text-slate-500">
            One org per documentation team. You can add more domains later.
          </p>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Organization name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Docs Team" required minLength={2} maxLength={80} />
            </div>
            <div>
              <Label htmlFor="slug">URL slug</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="acme"
                pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]"
                required
              />
              <p className="mt-1 text-xs text-slate-500">Lowercase letters, digits, and hyphens. Used in URLs.</p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="pt-2">
              <Button type="submit" disabled={mut.isPending}>
                {mut.isPending ? 'Creating&hellip;' : 'Create organization'}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </main>
  );
}
