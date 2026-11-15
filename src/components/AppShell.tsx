import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { config } from '../config';
import { cx } from '../lib/cx';
import { formatMoney } from '../lib/money';
import { useWallet } from '../wallet/queries';
import { ButtonLink } from './ui';

const ICONS = {
  auctions: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  bids: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  wallet:
    'M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2zm13 7h.01',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
} as const;

const USER_LINKS = [
  { to: '/', label: 'Auctions', icon: 'auctions', end: true },
  { to: '/bids', label: 'My bids', icon: 'bids', end: false },
  { to: '/wallet', label: 'Wallet', icon: 'wallet', end: false },
  { to: '/account', label: 'Account', icon: 'account', end: false },
] as const;

export function AppShell() {
  const { user } = useAuth();
  return (
    // Signed-in phones get a tab bar fixed to the bottom edge; the page leaves room for it.
    <div className={cx('flex min-h-dvh flex-col', user && 'pb-16 sm:pb-0')}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-30 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      {/* No backdrop filter here: it would pin the fixed tab bar to the header instead of the screen. */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <Link to="/" className="flex items-center gap-2 font-bold text-brand-800">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <span className={cx('whitespace-nowrap', !user && 'sr-only min-[22.5rem]:not-sr-only')}>
              {config.appName}
            </span>
          </Link>
          {user ? (
            <div className="flex items-center gap-2">
              <UserNav />
              <Balance />
            </div>
          ) : (
            <nav aria-label="Main" className="flex items-center gap-1 text-sm font-medium whitespace-nowrap">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  cx(
                    // On narrow phones a visitor has the logo for this; the space goes to Sign in and Register.
                    'hidden rounded-lg px-2.5 py-2 min-[26rem]:block sm:px-3',
                    isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100',
                  )
                }
              >
                Auctions
              </NavLink>
              <Link
                to="/sign-in"
                className="rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-100 sm:px-3"
              >
                Sign in
              </Link>
              <ButtonLink to="/register" className="px-3 py-2">
                Register
              </ButtonLink>
            </nav>
          )}
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 text-center text-xs text-slate-500">
          The lowest bid that nobody else placed wins. Every bid costs a fixed fee.
        </div>
      </footer>
    </div>
  );
}

/** One list of links: a bottom tab bar on phones, part of the header from tablet width up. */
function UserNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-slate-200 bg-white text-xs font-medium sm:static sm:flex sm:items-center sm:gap-1 sm:border-0 sm:text-sm"
    >
      {USER_LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) =>
            cx(
              'flex flex-col items-center gap-0.5 px-1 py-2 whitespace-nowrap sm:rounded-lg sm:px-3',
              isActive ? 'text-brand-800 sm:bg-brand-50' : 'text-slate-600 hover:bg-slate-100',
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
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Balance() {
  const wallet = useWallet();
  if (!wallet.data) return null;
  const amount = formatMoney(wallet.data.available, wallet.data.currency);
  return (
    <Link
      to="/wallet"
      aria-label={`Balance: ${amount}`}
      className="rounded-full border border-brand-100 bg-brand-50 px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-brand-800 tabular-nums hover:bg-brand-100"
    >
      {amount}
    </Link>
  );
}
