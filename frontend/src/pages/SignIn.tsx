import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input, Label } from '../components/Input';
import { Card, CardBody, CardHeader } from '../components/Card';
import { GithubSignInButton } from '../components/GithubSignInButton';
import { AuthError, signIn } from '../lib/auth';

export function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      navigate('/integrations/github', { replace: true });
    } catch (err) {
      if (err instanceof AuthError && err.code === 'UserNotConfirmedException') {
        navigate(`/signup/confirm?email=${encodeURIComponent(email)}`, { replace: true });
        return;
      }
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <Card>
        <CardHeader>
          <h1 className="text-base font-semibold text-slate-900">Sign in</h1>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pw">Password</Label>
              <Input id="pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? 'Signing in...' : 'Sign in'}</Button>
          </form>
          <GithubSignInButton label="Sign in with GitHub" />
        </CardBody>
      </Card>
      <p className="mt-4 text-center text-sm text-slate-600">
        New here?{' '}
        <Link to="/signup" className="font-medium text-sky-700 hover:underline">Create an account</Link>
        {' '}&middot;{' '}
        <Link to="/forgot" className="text-slate-500 hover:underline">Forgot password</Link>
      </p>
    </main>
  );
}
