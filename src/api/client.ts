import createClient from 'openapi-fetch';
import { session } from '../auth/session';
import { config } from '../config';
import { ApiError } from './errors';
import type { paths } from './schema';

async function send(request: Request): Promise<Response> {
  try {
    return await fetch(request);
  } catch {
    throw ApiError.network();
  }
}

/**
 * Sends the request as the signed-in user, if there is one. When the server no longer accepts the access token
 * (signed out elsewhere, password changed), the token is renewed and the request sent once more.
 */
async function authorizedFetch(request: Request): Promise<Response> {
  const token = await session.accessToken();
  if (!token) return send(request);

  const retry = request.clone();
  request.headers.set('Authorization', `Bearer ${token}`);
  const response = await send(request);
  if (response.status !== 401 && response.status !== 403) return response;

  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as { error?: string } | null;
  switch (body?.error) {
    case 'ACCOUNT_SUSPENDED':
    case 'ACCOUNT_BLOCKED':
      session.end(body.error === 'ACCOUNT_BLOCKED' ? 'blocked' : 'suspended');
      return response;
    case 'PASSWORD_CHANGE_REQUIRED':
      // Support reset the password since this page loaded: the guards now send the user to choose a new one.
      session.requirePasswordChange();
      return response;
    case 'UNAUTHORIZED': {
      const renewed = await session.accessToken(token);
      if (!renewed) return response;
      retry.headers.set('Authorization', `Bearer ${renewed}`);
      return send(retry);
    }
    default:
      // Any other refusal (a wrong current password, a missing role) is an answer, not a stale token.
      return response;
  }
}

/** Typed client for every endpoint in `api/openapi.json`. */
export const api = createClient<paths>({ baseUrl: config.apiBaseUrl, fetch: authorizedFetch });

/** The same client without the signed-in user: for signing in, registering and signing out. */
export const anonymousApi = createClient<paths>({ baseUrl: config.apiBaseUrl, fetch: send });

/** Unwraps an openapi-fetch result: the data on success, a thrown ApiError otherwise. */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await call;
  if (!response.ok) throw ApiError.fromBody(response.status, error);
  return data as T;
}
