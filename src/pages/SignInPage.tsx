import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { errorMessage } from '../api/errors';
import { useAuth } from '../auth/useAuth';
import { session, type SignOutReason } from '../auth/session';
import { Alert, Button, Card, Field } from '../components/ui';
import { phoneError } from '../lib/validation';

const SIGNED_OUT_NOTICE: Record<SignOutReason, string> = {
  expired: 'You were signed out. Please sign in again.',
  suspended: 'This account has been suspended. Please contact support.',
  blocked: 'This account has been blocked. Please contact support.',
};

export function SignInPage() {
  const { signIn } = useAuth();
  const location = useLocation();
  const [notice] = useState(() => session.takeSignOutReason());
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ phone?: string | null; password?: string | null }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next = { phone: phoneError(phoneNumber), password: password ? null : 'Enter your password.' };
    setErrors(next);
    setFailure(null);
    if (next.phone || next.password) return;
    setBusy(true);
    try {
      // On success GuestOnly sends the user to the page they came from.
      await signIn(phoneNumber.trim(), password);
    } catch (error) {
      setFailure(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card className="p-6">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          {notice && !failure && <Alert tone="warning">{SIGNED_OUT_NOTICE[notice]}</Alert>}
          {failure && <Alert>{failure}</Alert>}
          <Field
            label="Phone number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0911 234 567"
            required
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            error={errors.phone}
          />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          <Button type="submit" busy={busy} className="w-full">
            Sign in
          </Button>
        </form>
        <p className="mt-4 text-sm text-slate-600">
          Forgot your password? Contact support and they will reset it for you.
        </p>
      </Card>
      <p className="mt-4 text-center text-sm text-slate-600">
        New here?{' '}
        <Link to="/register" state={location.state} className="font-semibold text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
