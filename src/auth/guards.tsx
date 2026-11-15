import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { returnPath } from './returnPath';
import { useAuth } from './useAuth';

/** Pages for signed-in users. A user who must choose a new password is sent to do that first. */
export function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/** Sign-in and registration pages: someone already signed in is sent on. */
export function GuestOnly() {
  const { user } = useAuth();
  const location = useLocation();
  return user ? <Navigate to={returnPath(location.state)} replace /> : <Outlet />;
}

/**
 * Public pages. They stay public for visitors, but a signed-in user who must choose a new password cannot use
 * the site until they have.
 */
export function PublicPages() {
  const { user } = useAuth();
  const location = useLocation();
  return user?.mustChangePassword ? (
    <Navigate to="/change-password" replace state={{ from: location.pathname + location.search }} />
  ) : (
    <Outlet />
  );
}
