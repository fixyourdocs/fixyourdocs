import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody } from '../components/Card';
import { Spinner } from '../components/Spinner';
import { env } from '../lib/env';
import { setSessionFromTokens } from '../lib/auth';

const DEFAULT_NEXT = '/integrations/github';

// M1: accept same-origin relative paths only. Reject absolute URLs and
// protocol-relative `//evil.com` to avoid an open redirect.
function safeNext(raw: string | null): string {
  return raw && /^\/[^/]/.test(raw) ? raw : DEFAULT_NEXT;
}

// Mounted at /auth/github/complete. Reads the single-use handoff code from the
// URL fragment, strips it from history, exchanges it for Cognito tokens, and
// adopts the session. No token ever appears in window.location.
export function AuthGithubComplete() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const rawHash = window.location.hash.replace(/^#/, '');
    const handoff = new URLSearchParams(rawHash).get('handoff');
    const next = safeNext(new URLSearchParams(window.location.search).get('next'));

    // Strip the fragment immediately so the code never lingers in history.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);

    if (!handoff) {
      setError('Missing sign-in code. Please try signing in again.');
      return;
    }

    void (async () => {
      try {
        const res = await fetch(`${env.HUB_BASE_URL}/v1/auth/github/exchange`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ handoff }),
        });
        if (!res.ok) throw new Error('exchange_failed');
        const tokens = (await res.json()) as {
          id_token: string;
          access_token: string;
          refresh_token?: string | null;
        };
        setSessionFromTokens(tokens);
        navigate(next, { replace: true });
      } catch {
        setError('Could not complete GitHub sign-in. Please try again.');
      }
    })();
  }, [navigate]);

  if (error) {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <Card>
          <CardBody>
            <p className="text-sm text-red-600">{error}</p>
            <a href="/signin" className="mt-3 inline-block text-sm font-medium text-sky-700 hover:underline">
              Back to sign in
            </a>
          </CardBody>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12 text-center">
      <Spinner />
      <p className="mt-3 text-sm text-slate-500">Completing GitHub sign-in…</p>
    </main>
  );
}
