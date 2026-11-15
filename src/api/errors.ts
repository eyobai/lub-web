import type { components } from './schema';

type ErrorBody = components['schemas']['ErrorResponseDto'];

/** A refusal from the API, or a failure to reach it (`status` 0, `code` NETWORK_ERROR). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  static network(): ApiError {
    return new ApiError(0, 'NETWORK_ERROR', 'The server could not be reached');
  }

  static fromBody(status: number, body: unknown): ApiError {
    const b = (body ?? {}) as Partial<ErrorBody>;
    return new ApiError(
      status,
      typeof b.error === 'string' ? b.error : `HTTP_${status}`,
      typeof b.message === 'string' ? b.message : 'The request failed',
      b.details,
      b.requestId,
    );
  }
}

function minutes(seconds: unknown): string {
  const m = Math.max(1, Math.ceil(Number(seconds) / 60));
  return m === 1 ? '1 minute' : `${m} minutes`;
}

/** Wording shown to people. Codes without an entry fall back to a generic sentence, never to server text. */
const MESSAGES: Record<string, string | ((e: ApiError) => string)> = {
  NETWORK_ERROR: 'We could not reach the server. Check your connection and try again.',
  SERVICE_BUSY: 'The service is busy right now. Please try again in a moment.',
  RATE_LIMITED: 'Too many attempts. Please wait a minute and try again.',
  INVALID_CREDENTIALS: 'The phone number or password is incorrect.',
  ACCOUNT_LOCKED: (e) =>
    e.details?.retryAfterSeconds
      ? `Too many failed attempts. Try again in ${minutes(e.details.retryAfterSeconds)}.`
      : 'Too many failed attempts. Please try again later.',
  ACCOUNT_SUSPENDED: 'This account has been suspended. Please contact support.',
  ACCOUNT_BLOCKED: 'This account has been blocked. Please contact support.',
  INVALID_PHONE_NUMBER: 'Enter a valid Ethiopian mobile number, for example 0911 234 567.',
  PHONE_ALREADY_REGISTERED: 'This phone number already has an account. Sign in instead.',
  EMAIL_ALREADY_IN_USE: 'This email address is already used by another account.',
  PASSWORD_REUSED: 'Choose a password that is different from your current one.',
  PASSWORD_CHANGE_REQUIRED: 'Choose a new password before continuing.',
  SMS_VERIFICATION_DISABLED: 'Password reset by SMS is not available. Please contact support.',
  NOT_FOUND: 'We could not find what you were looking for.',
  VALIDATION_FAILED: 'Some of the details are not valid. Please check them and try again.',
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const entry = MESSAGES[error.code];
    if (typeof entry === 'function') return entry(error);
    if (entry) return entry;
  }
  return 'Something went wrong. Please try again.';
}

export function isApiError(error: unknown, ...codes: string[]): error is ApiError {
  return error instanceof ApiError && (codes.length === 0 || codes.includes(error.code));
}
