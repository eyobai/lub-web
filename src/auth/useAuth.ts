import { createContext, useContext } from 'react';
import type { components } from '../api/schema';
import type { AuthUser } from './session';

export type RegisterInput = components['schemas']['RegisterDto'];

export interface AuthContextValue {
  /** The signed-in user, or null. Restored from the browser on load, then confirmed with the server. */
  user: AuthUser | null;
  signIn(phoneNumber: string, password: string): Promise<AuthUser>;
  register(input: RegisterInput): Promise<AuthUser>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  signOut(): Promise<void>;
  signOutEverywhere(): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
