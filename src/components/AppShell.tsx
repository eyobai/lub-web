import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { config } from '../config';
import { ButtonLink } from './ui';
import { cx } from '../lib/cx';

export function AppShell() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-20 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <Link to="/" className="flex items-center gap-2 font-bold text-brand-800">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <span className={cx('whitespace-nowrap', !user && 'sr-only min-[22.5rem]:not-sr-only')}>
              {config.appName}
            </span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 text-sm font-medium whitespace-nowrap">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cx(
                  'rounded-lg px-2.5 py-2 sm:px-3',
                  // On narrow phones a visitor has the logo for this; the space goes to Sign in and Register.
                  !user && 'hidden min-[26rem]:block',
                  isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100',
                )
              }
            >
              Auctions
            </NavLink>
            {user ? (
              <NavLink
                to="/account"
                className={({ isActive }) =>
                  cx(
                    'rounded-lg px-2.5 py-2 sm:px-3',
                    isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100',
                  )
                }
              >
                Account
              </NavLink>
            ) : (
              <>
                <Link
                  to="/sign-in"
                  className="rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-100 sm:px-3"
                >
                  Sign in
                </Link>
                <ButtonLink to="/register" className="px-3 py-2">
                  Register
                </ButtonLink>
              </>
            )}
          </nav>
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
