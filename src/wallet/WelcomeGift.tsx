import { useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { Sheet } from '../components/Sheet';
import { formatDateTime } from '../lib/clock';
import { formatMinor } from '../lib/money';
import { t } from '../i18n/i18n';
import { useWallet } from './queries';
import { welcome } from './welcome';

const GiftIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="h-5 w-5"
  >
    <path d="M20 12v9H4v-9M2 7h20v5H2zM12 22V7m0 0H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zm0 0h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z" />
  </svg>
);

/** The popup a new account sees once: the welcome bonus is in the wallet. */
export function WelcomeGift() {
  const { user } = useAuth();
  const wallet = useWallet();
  const navigate = useNavigate();
  const pending = useSyncExternalStore(welcome.subscribe, welcome.get, () => null);

  if (!user || !pending || pending.userId !== user.id) return null;
  const amountMinor = pending.amountMinor;
  const w = wallet.data;
  const amount = formatMinor(amountMinor, w?.currency ?? 'ETB', w?.minorUnits ?? 2);
  const close = () => welcome.dismiss();

  return (
    <Sheet
      title={t('Welcome to LeyuBid!')}
      icon={<GiftIcon />}
      onClose={close}
      footer={
        <button
          type="button"
          onClick={() => {
            close();
            void navigate('/');
          }}
          className="w-full rounded-full bg-gradient-to-b from-brand-500 to-brand-600 px-5 py-3.5 font-bold text-white shadow-[0_6px_16px_-4px_rgb(5_150_105/0.45)]"
        >
          {t('Start bidding')}
        </button>
      }
    >
      <div className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 px-6 py-8 text-center text-white">
        <span
          aria-hidden="true"
          className="absolute -top-16 -left-12 h-44 w-44 rounded-full bg-white/10 blur-2xl"
        />
        <span
          aria-hidden="true"
          className="absolute -right-10 -bottom-16 h-48 w-48 rounded-full bg-brand-400/40 blur-3xl"
        />
        <p className="relative text-sm font-semibold text-white/85">{t('A welcome gift for you')}</p>
        <p className="relative mt-1 text-5xl font-black tracking-tight tabular-nums drop-shadow-[0_4px_18px_rgb(110_231_183/0.5)]">
          {amount}
        </p>
        <p className="relative mt-2 font-semibold">{t('is in your wallet')}</p>
      </div>
      <p className="text-center text-sm text-slate-600">
        {w?.bonusExpiresAt
          ? t('Use it for bid fees by {date}. It cannot be withdrawn.', {
              date: formatDateTime(w.bonusExpiresAt),
            })
          : t('Use it for bid fees. It cannot be withdrawn.')}
      </p>
    </Sheet>
  );
}
