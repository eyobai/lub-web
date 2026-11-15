import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { errorMessage, isApiError } from '../api/errors';
import { useAuth } from '../auth/useAuth';
import { returnPath } from '../auth/returnPath';
import { Alert, Button, Card, Field } from '../components/ui';
import { passwordError } from '../lib/validation';

type Errors = Partial<Record<'current' | 'next' | 'confirm', string | null>>;

export function ChangePasswordPage() {
  const { user, changePassword, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const forced = user?.mustChangePassword ?? false;
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Errors = {
      current: form.current
        ? null
        : forced
          ? 'Enter the temporary password.'
          : 'Enter your current password.',
      next:
        passwordError(form.next) ??
        (form.next === form.current ? 'Choose a password that is different from your current one.' : null),
      confirm: form.confirm === form.next ? null : 'The two passwords do not match.',
    };
    setErrors(next);
    setFailure(null);
    if (Object.values(next).some(Boolean)) return;
    setBusy(true);
    try {
      await changePassword(form.current, form.next);
      navigate(forced ? returnPath(location.state) : '/account', {
        replace: true,
        state: { passwordChanged: true },
      });
    } catch (error) {
      if (isApiError(error, 'INVALID_CREDENTIALS')) {
        setErrors({
          current: forced ? 'The temporary password is incorrect.' : 'The current password is incorrect.',
        });
      } else if (isApiError(error, 'PASSWORD_REUSED')) {
        setErrors({ next: errorMessage(error) });
      } else {
        setFailure(errorMessage(error));
      }
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card className="p-6">
        <h1 className="text-2xl font-bold">{forced ? 'Choose a new password' : 'Change password'}</h1>
        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          {forced && (
            <Alert tone="info">
              Support reset your password. Choose a new one that only you know before you continue.
            </Alert>
          )}
          {failure && <Alert>{failure}</Alert>}
          <Field
            label={forced ? 'Temporary password' : 'Current password'}
            type="password"
            autoComplete="current-password"
            required
            value={form.current}
            onChange={set('current')}
            error={errors.current}
          />
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            hint="At least 8 characters, with a letter and a number."
            value={form.next}
            onChange={set('next')}
            error={errors.next}
          />
          <Field
            label="Repeat new password"
            type="password"
            autoComplete="new-password"
            required
            value={form.confirm}
            onChange={set('confirm')}
            error={errors.confirm}
          />
          <Button type="submit" busy={busy} className="w-full">
            Save new password
          </Button>
          {forced && (
            <Button type="button" variant="secondary" className="w-full" onClick={() => void signOut()}>
              Sign out
            </Button>
          )}
        </form>
        <p className="mt-4 text-sm text-slate-600">
          Changing your password signs you out on your other devices.
        </p>
      </Card>
    </div>
  );
}
