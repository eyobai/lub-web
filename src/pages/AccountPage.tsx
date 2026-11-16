import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { errorMessage } from '../api/errors';
import { useAuth } from '../auth/useAuth';
import { Alert, Button, ButtonLink, Card } from '../components/ui';
import { formatDateTime } from '../lib/clock';
import { usePageTitle } from '../lib/usePageTitle';

export function AccountPage() {
  usePageTitle('Your account');
  const { user, signOut, signOutEverywhere } = useAuth();
  const location = useLocation();
  const passwordChanged = (location.state as { passwordChanged?: boolean } | null)?.passwordChanged === true;
  const [busy, setBusy] = useState<'here' | 'everywhere' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  if (!user) return null;

  async function run(kind: 'here' | 'everywhere') {
    setBusy(kind);
    setFailure(null);
    try {
      await (kind === 'here' ? signOut() : signOutEverywhere());
    } catch (error) {
      setFailure(errorMessage(error));
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Your account</h1>
      {passwordChanged && <Alert tone="info">Your password was changed.</Alert>}
      {failure && <Alert>{failure}</Alert>}
      <Card className="p-5">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-slate-500">Phone number</dt>
            <dd className="font-semibold">{user.phoneNumber}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Name</dt>
            <dd className="font-semibold">{user.fullName ?? 'Not given'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Email</dt>
            <dd className="font-semibold break-words">{user.email ?? 'Not given'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Member since</dt>
            <dd className="font-semibold">{formatDateTime(user.createdAt)}</dd>
          </div>
        </dl>
      </Card>
      <Card className="space-y-3 p-5">
        <ButtonLink to="/wins" variant="secondary" className="w-full">
          My wins
        </ButtonLink>
        <ButtonLink to="/notifications" variant="secondary" className="w-full">
          Notifications
        </ButtonLink>
      </Card>
      <Card className="space-y-3 p-5">
        <ButtonLink to="/change-password" variant="secondary" className="w-full">
          Change password
        </ButtonLink>
        <Button
          variant="secondary"
          className="w-full"
          busy={busy === 'here'}
          disabled={busy !== null}
          onClick={() => void run('here')}
        >
          Sign out
        </Button>
        <Button
          variant="danger"
          className="w-full"
          busy={busy === 'everywhere'}
          disabled={busy !== null}
          onClick={() => void run('everywhere')}
        >
          Sign out on all devices
        </Button>
      </Card>
    </div>
  );
}
