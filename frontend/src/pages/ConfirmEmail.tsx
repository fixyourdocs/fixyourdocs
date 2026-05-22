import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input, Label } from '../components/Input';
import { Card, CardBody, CardHeader } from '../components/Card';
import { confirmSignUp, resendConfirmationCode } from '../lib/auth';

export function ConfirmEmail() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialEmail = params.get('email') ?? '';
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await confirmSignUp(email.trim().toLowerCase(), code.trim());
      navigate('/signin?confirmed=1', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setInfo(null);
    try {
      await resendConfirmationCode(email.trim().toLowerCase());
      setInfo('Code resent — check your email.');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <Card>
        <CardHeader>
          <h1 className="text-base font-semibold text-slate-900">Confirm your email</h1>
          <p className="mt-1 text-sm text-slate-500">We sent a 6-digit code to {initialEmail || 'your email'}.</p>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="code">Verification code</Label>
              <Input id="code" inputMode="numeric" pattern="[0-9]{6}" required value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {info && <p className="text-sm text-emerald-700">{info}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy} className="flex-1">{busy ? 'Confirming...' : 'Confirm'}</Button>
              <Button type="button" variant="ghost" onClick={resend}>Resend code</Button>
            </div>
          </form>
        </CardBody>
      </Card>
      <p className="mt-4 text-center text-sm text-slate-600">
        <Link to="/signin" className="text-slate-500 hover:underline">Back to sign in</Link>
      </p>
    </main>
  );
}
