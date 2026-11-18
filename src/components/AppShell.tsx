import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { config } from '../config';
import { cx } from '../lib/cx';
import { formatMinor } from '../lib/money';
import { useOnline } from '../lib/useOnline';
import { useUnreadCount } from '../notifications/queries';
import { useWallet } from '../wallet/queries';
import { WelcomeGift } from '../wallet/WelcomeGift';
import { ErrorBoundary } from './ErrorBoundary';
import { ButtonLink } from './ui';
import { language, t, tk, type Language } from '../i18n/i18n';
import { useLanguage } from '../i18n/useLanguage';

const ICONS = {
  auctions: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  winners: 'M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0zm0 2H4a3 3 0 0 0 3 4m10-4h3a3 3 0 0 1-3 4',
  bids: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
} as const;

const USER_LINKS = [
  { to: '/', label: tk('Home'), icon: 'auctions', end: true },
  { to: '/winners', label: tk('Winners'), icon: 'winners', end: false },
  { to: '/bids', label: tk('My bids'), icon: 'bids', end: false },
  { to: '/account', label: tk('Account'), icon: 'account', end: false },
] as const;
// No Wallet tab: the balance next to the bell opens the wallet.

/**
 * A new page starts at its top, with the keyboard and screen reader placed on it, as after a full page load.
 * Going back or forward is left alone, and so is the first page, which the browser has already handled.
 */
function usePageStart(): React.RefObject<HTMLElement | null> {
  const main = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const how = useNavigationType();
  const shown = useRef(pathname);
  useEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    if (how === 'POP') return;
    window.scrollTo({ top: 0 });
    main.current?.focus({ preventScroll: true });
  }, [pathname, how]);
  return main;
}

export function AppShell() {
  const { user } = useAuth();
  const online = useOnline();
  const main = usePageStart();
  const { pathname } = useLocation();
  return (
    // Signed-in phones get a tab bar fixed to the bottom edge; the page leaves room for it.
    <div className={cx('flex min-h-dvh flex-col', user && 'pb-20 sm:pb-0')}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-30 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        {t('Skip to content')}
      </a>
      {/* No backdrop filter here: it would pin the fixed tab bar to the header instead of the screen. */}
      <header className="sticky top-0 z-10 rounded-b-4xl bg-white shadow-[0_2px_12px_rgb(22_21_19/0.05)]">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-ink">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <span
              className={cx(
                // The name gives way where the links need the room: to Sign in, Register and the language switch on
                // phones, and to the signed-in links on small tablets.
                user ? 'sm:max-md:sr-only' : 'sr-only min-[26rem]:not-sr-only',
              )}
            >
              {/* Its own element: not-sr-only resets white-space, which would let the name break onto two lines. */}
              <span className="whitespace-nowrap">{config.appName}</span>
            </span>
          </Link>
          {user ? (
            <div className="flex items-center gap-2">
              <UserNav />
              <NotificationsLink />
              <Balance />
              <LanguageSwitch />
            </div>
          ) : (
            <nav
              aria-label={t('Main')}
              className="flex items-center gap-1 text-sm font-medium whitespace-nowrap"
            >
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  cx(
                    // On narrow phones a visitor has the logo for this; the space goes to Sign in and Register.
                    'hidden rounded-full px-3 py-2 min-[26rem]:block sm:px-4',
                    isActive ? 'bg-ink text-white' : 'text-slate-600 hover:bg-slate-100',
                  )
                }
              >
                {t('Home')}
              </NavLink>
              <NavLink
                to="/winners"
                className={({ isActive }) =>
                  cx(
                    'hidden rounded-full px-3 py-2 min-[32rem]:block sm:px-4',
                    isActive ? 'bg-ink text-white' : 'text-slate-600 hover:bg-slate-100',
                  )
                }
              >
                {t('Winners')}
              </NavLink>
              <Link
                to="/sign-in"
                className="rounded-full px-3 py-2 text-slate-600 hover:bg-slate-100 sm:px-4"
              >
                {t('Sign in')}
              </Link>
              <ButtonLink to="/register" className="px-3 py-2">
                {t('Register')}
              </ButtonLink>
              <LanguageSwitch />
            </nav>
          )}
        </div>
      </header>
      {!online && (
        <p role="status" className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
          {t(
            'You are offline. What you see may be out of date, and nothing can be sent until you reconnect.',
          )}
        </p>
      )}
      <main
        id="main"
        ref={main}
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 outline-none"
      >
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
        <WelcomeGift />
      </main>
      <footer>
        <div className="mx-auto max-w-5xl px-4 py-4 text-center text-xs text-slate-500">
          {t('The lowest bid that nobody else placed wins. Every bid costs a fixed fee.')}{' '}
          <Link
            to="/winners"
            className="font-semibold text-slate-900 underline decoration-brand-500 decoration-2 underline-offset-2"
          >
            {t('Recent winners')}
          </Link>
        </div>
      </footer>
    </div>
  );
}

/** One list of links: a bottom tab bar on phones, part of the header from tablet width up. */
function UserNav() {
  return (
    <nav
      aria-label={t('Main')}
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 gap-1 rounded-t-4xl bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[0.7rem] font-medium shadow-[0_-4px_20px_rgb(22_21_19/0.08)] sm:static sm:flex sm:items-center sm:gap-1 sm:rounded-none sm:p-0 sm:text-sm sm:shadow-none"
    >
      {USER_LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) =>
            cx(
              'flex flex-col items-center gap-0.5 rounded-full px-1 py-1.5 whitespace-nowrap transition-colors sm:px-4 sm:py-2',
              isActive
                ? 'bg-slate-200 font-semibold text-ink sm:bg-ink sm:text-white'
                : 'text-slate-600 hover:bg-slate-100',
            )
          }
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="h-5 w-5 sm:hidden"
          >
            <path d={ICONS[link.icon]} />
          </svg>
          {t(link.label)}
        </NavLink>
      ))}
    </nav>
  );
}

/** The bell, with the number of unread notifications on it. */
function NotificationsLink() {
  const unread = useUnreadCount().data?.unread ?? 0;
  return (
    <NavLink
      to="/notifications"
      aria-label={unread > 0 ? t('Notifications: {count} unread', { count: unread }) : t('Notifications')}
      className={({ isActive }) =>
        cx(
          'relative rounded-full bg-slate-100 p-2.5',
          isActive ? 'bg-ink text-white' : 'text-slate-700 hover:bg-slate-200',
        )
      }
    >
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
        <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9zm4 10a2 2 0 0 0 4 0" />
      </svg>
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 min-w-[1.125rem] rounded-full bg-red-600 px-1 text-center text-[0.65rem] leading-[1.125rem] font-bold text-white"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </NavLink>
  );
}

function Balance() {
  const wallet = useWallet();
  if (!wallet.data) return null;
  // Bonus counts: it is spent on bid fees like the rest.
  const amount = formatMinor(wallet.data.spendableMinor, wallet.data.currency, wallet.data.minorUnits);
  return (
    <Link
      to="/wallet"
      aria-label={t('Balance: {amount}', { amount })}
      className="rounded-full bg-brand-500 px-3.5 py-2 text-sm font-semibold whitespace-nowrap text-white tabular-nums hover:bg-brand-600"
    >
      {amount}
    </Link>
  );
}

/** English ⇄ Amharic. Shows the language it switches to, written in that language. */
function LanguageSwitch() {
  const lang = useLanguage();
  const next: Language = lang === 'am' ? 'en' : 'am';
  return (
    <button
      type="button"
      onClick={() => language.set(next)}
      lang={next}
      aria-label={next === 'am' ? 'አማርኛ — Switch to Amharic' : 'English — ወደ እንግሊዝኛ ቀይር'}
      className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-4 w-4"
      >
        <path d="m5 8 6 6m-7 0 6-6 2-3M2 5h12M7 2h1m14 20-5-10-5 10m2-4h6" />
      </svg>
      {next === 'am' ? 'አማ' : 'EN'}
    </button>
  );
}
