import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { anonymousApi, api, unwrap } from '../api/client';
import { ApiError } from '../api/errors';
import { PUBLIC_QUERIES } from '../queryClient';
import { session } from './session';
import { AuthContext, type RegisterInput } from './useAuth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const user = useSyncExternalStore(session.subscribe, () => session.get()?.user ?? null);
  const userId = user?.id ?? null;

  // The stored user can be stale (roles, a forced password change): ask the server on load and on refocus.
  const me = useQuery({
    queryKey: ['auth', 'me', userId],
    queryFn: () => unwrap(api.GET('/api/v1/auth/me')),
    enabled: userId !== null,
    staleTime: 60_000,
    retry: false,
  });
  useEffect(() => {
    if (me.data && session.get()?.user.id === me.data.id) session.setUser(me.data);
  }, [me.data]);

  // Whatever one account loaded must not be shown to the next one.
  useEffect(() => {
    if (userId === null)
      queryClient.removeQueries({ predicate: (q) => !PUBLIC_QUERIES.includes(q.queryKey[0]) });
  }, [userId, queryClient]);

  const signIn = useCallback(async (phoneNumber: string, password: string) => {
    const result = await unwrap(anonymousApi.POST('/api/v1/auth/login', { body: { phoneNumber, password } }));
    session.start(result.user, result.tokens);
    return result.user;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const result = await unwrap(anonymousApi.POST('/api/v1/auth/register', { body: input }));
    if (!result.user || !result.tokens) {
      // The server asks for an SMS code, which this site does not support.
      throw new ApiError(0, 'PHONE_VERIFICATION_UNSUPPORTED', 'Phone verification is required');
    }
    session.start(result.user, result.tokens);
    return result.user;
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const result = await unwrap(
      api.POST('/api/v1/auth/change-password', { body: { currentPassword, newPassword } }),
    );
    session.start(result.user, result.tokens);
  }, []);

  const signOut = useCallback(async () => {
    const refreshToken = session.get()?.refreshToken;
    session.end(null);
    // Best effort: the session is gone from this device either way.
    if (refreshToken)
      await anonymousApi.POST('/api/v1/auth/logout', { body: { refreshToken } }).catch(() => undefined);
  }, []);

  const signOutEverywhere = useCallback(async () => {
    await unwrap(api.POST('/api/v1/auth/logout-all'));
    session.end(null);
  }, []);

  const value = useMemo(
    () => ({ user, signIn, register, changePassword, signOut, signOutEverywhere }),
    [user, signIn, register, changePassword, signOut, signOutEverywhere],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
