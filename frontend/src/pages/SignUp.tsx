import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input, Label } from '../components/Input';
import { Card, CardBody, CardHeader } from '../components/Card';
import { signUp } from '../lib/auth';

export function SignUp() {
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
      const normalized = email.trim().toLowerCase();
      await signUp(normalized, password);
      navigate(`/signup/confirm?email=${encodeURIComponent(normalized)}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <Card>
        <CardHeader>
          <h1 className="text-base font-semibold text-slate-900">Create your account</h1>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pw">Password</Label>
              <Input id="pw" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} />
              <p className="mt-1 text-xs text-slate-500">At least 10 characters with upper, lower, and a digit.</p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? 'Creating...' : 'Create account'}</Button>
          </form>
        </CardBody>
      </Card>
      <p className="mt-4 text-center text-sm text-slate-600">
        Already have an account? <Link to="/signin" className="font-medium text-sky-700 hover:underline">Sign in</Link>
      </p>
    </main>
  );
}
