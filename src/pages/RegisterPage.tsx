import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { errorMessage, isApiError } from '../api/errors';
import { useAuth } from '../auth/useAuth';
import { Alert, Button, Card, Field } from '../components/ui';
import { fullNameError, passwordError, phoneError } from '../lib/validation';
import { usePageTitle } from '../lib/usePageTitle';
import { t } from '../i18n/i18n';

type Errors = Partial<Record<'phone' | 'password' | 'confirm' | 'fullName', string | null>>;

export function RegisterPage() {
  usePageTitle(t('Create your account'));
  const { register } = useAuth();
  const location = useLocation();
  const [form, setForm] = useState({ phoneNumber: '', password: '', confirm: '', fullName: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Errors = {
      phone: phoneError(form.phoneNumber),
      password: passwordError(form.password),
      confirm: form.confirm === form.password ? null : t('The two passwords do not match.'),
      fullName: fullNameError(form.fullName),
    };
    setErrors(next);
    setFailure(null);
    if (Object.values(next).some(Boolean)) return;
    setBusy(true);
    try {
      await register({
        phoneNumber: form.phoneNumber.trim(),
        password: form.password,
        fullName: form.fullName.trim() || undefined,
      });
    } catch (error) {
      if (isApiError(error, 'PHONE_ALREADY_REGISTERED', 'INVALID_PHONE_NUMBER')) {
        setErrors({ phone: errorMessage(error) });
      } else if (isApiError(error, 'PHONE_VERIFICATION_UNSUPPORTED')) {
        setFailure(
          t('Your account needs phone verification, which this site cannot do yet. Please contact support.'),
        );
      } else {
        setFailure(errorMessage(error));
      }
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card className="p-6">
        <h1 className="text-2xl font-bold tracking-tight">{t('Create your account')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('You only need a phone number and a password.')}</p>
        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          {failure && <Alert>{failure}</Alert>}
          <Field
            label={t('Phone number')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0911 234 567"
            required
            value={form.phoneNumber}
            onChange={set('phoneNumber')}
            error={errors.phone}
          />
          <Field
            label={t('Password')}
            type="password"
            autoComplete="new-password"
            required
            hint={t('At least 8 characters, with a letter and a number.')}
            value={form.password}
            onChange={set('password')}
            error={errors.password}
          />
          <Field
            label={t('Repeat password')}
            type="password"
            autoComplete="new-password"
            required
            value={form.confirm}
            onChange={set('confirm')}
            error={errors.confirm}
          />
          <Field
            label={t('Full name')}
            autoComplete="name"
            value={form.fullName}
            onChange={set('fullName')}
            error={errors.fullName}
          />
          <Button type="submit" busy={busy} className="w-full">
            {t('Create account')}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-slate-600">
        {t('Already have an account?')}{' '}
        <Link to="/sign-in" state={location.state} className="font-semibold text-brand-700 hover:underline">
          {t('Sign in')}
        </Link>
      </p>
    </div>
  );
}
