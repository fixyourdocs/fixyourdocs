import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input, Label } from '../components/Input';
import { Card, CardBody, CardHeader } from '../components/Card';
import { forgotPassword } from '../lib/auth';

export function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const normalized = email.trim().toLowerCase();
      await forgotPassword(normalized);
      navigate(`/reset?email=${encodeURIComponent(normalized)}`, { replace: true });
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
          <h1 className="text-base font-semibold text-slate-900">Reset your password</h1>
          <p className="mt-1 text-sm text-slate-500">We'll email you a 6-digit code.</p>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? 'Sending...' : 'Send code'}</Button>
          </form>
        </CardBody>
      </Card>
      <p className="mt-4 text-center text-sm text-slate-600">
        <Link to="/signin" className="text-slate-500 hover:underline">Back to sign in</Link>
      </p>
    </main>
  );
}
