import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input, Label } from '../components/Input';
import { Card, CardBody, CardHeader } from '../components/Card';
import { confirmNewPassword } from '../lib/auth';

export function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await confirmNewPassword(email.trim().toLowerCase(), code.trim(), password);
      navigate('/signin?reset=1', { replace: true });
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
          <h1 className="text-base font-semibold text-slate-900">Set a new password</h1>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="code">Code from email</Label>
              <Input id="code" inputMode="numeric" pattern="[0-9]{6}" required value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pw">New password</Label>
              <Input id="pw" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? 'Updating...' : 'Update password'}</Button>
          </form>
        </CardBody>
      </Card>
      <p className="mt-4 text-center text-sm text-slate-600">
        <Link to="/signin" className="text-slate-500 hover:underline">Back to sign in</Link>
      </p>
    </main>
  );
}
