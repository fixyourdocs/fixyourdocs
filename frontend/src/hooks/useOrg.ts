import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Org {
  orgId: string;
  name: string;
  slug: string;
  role: string;
}

export function useOrgs() {
  return useQuery({
    queryKey: ['orgs'],
    queryFn: () => api<{ orgs: Org[] }>('/api/orgs').then((r) => r.orgs),
  });
}

export function useDefaultOrg() {
  const { data, ...rest } = useOrgs();
  return { org: data?.[0], orgs: data ?? [], ...rest };
}
