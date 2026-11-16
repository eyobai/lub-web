import { describe, expect, it } from 'vitest';
import { returnPath } from '../auth/returnPath';
import { formatTimeLeft, serverClock, timeLeft } from './clock';
import { formatMoney } from './money';
import { emailError, fullNameError, passwordError, phoneError } from './validation';

describe('formatMoney', () => {
  it('groups thousands and drops an all-zero fraction', () => {
    expect(formatMoney('65000.00', 'ETB')).toBe('ETB 65,000');
    expect(formatMoney('4.00', 'ETB')).toBe('ETB 4');
    expect(formatMoney('1234567', 'ETB')).toBe('ETB 1,234,567');
  });

  it('keeps a fraction that is not zero, exactly as sent', () => {
    expect(formatMoney('75.50', 'ETB')).toBe('ETB 75.50');
    expect(formatMoney('0.05', 'ETB')).toBe('ETB 0.05');
  });

  it('does not lose digits on amounts beyond what a number can hold', () => {
    expect(formatMoney('90071992547409931.25', 'ETB')).toBe('ETB 90,071,992,547,409,931.25');
  });
});

describe('timeLeft', () => {
  const at = Date.parse('2026-01-01T00:00:00.000Z');

  it('splits the remaining time and never goes below zero', () => {
    expect(timeLeft('2026-01-02T03:04:05.000Z', at)).toEqual({
      totalSeconds: 97_445,
      days: 1,
      hours: 3,
      minutes: 4,
      seconds: 5,
    });
    expect(timeLeft('2025-12-31T23:59:59.000Z', at).totalSeconds).toBe(0);
  });

  it('shows a started second as still remaining, so zero means the time has passed', () => {
    expect(timeLeft('2026-01-01T00:00:00.400Z', at).totalSeconds).toBe(1);
    expect(timeLeft('2026-01-01T00:00:00.000Z', at).totalSeconds).toBe(0);
  });

  it('formats with days above a day and as a clock below', () => {
    expect(formatTimeLeft(timeLeft('2026-01-03T03:04:05.000Z', at))).toBe('2 days 03:04:05');
    expect(formatTimeLeft(timeLeft('2026-01-02T03:04:05.000Z', at))).toBe('1 day 03:04:05');
    expect(formatTimeLeft(timeLeft('2026-01-01T03:04:05.000Z', at))).toBe('03:04:05');
  });
});

describe('serverClock', () => {
  it('follows the server when this device is wrong, and ignores a time it cannot read', () => {
    serverClock.sync(new Date(Date.now() + 600_000).toISOString());
    expect(serverClock.now() - Date.now()).toBeGreaterThan(599_000);
    serverClock.sync('not a date');
    expect(serverClock.now() - Date.now()).toBeGreaterThan(599_000);
    serverClock.sync(new Date().toISOString());
    expect(Math.abs(serverClock.now() - Date.now())).toBeLessThan(1000);
  });
});

describe('validation', () => {
  it.each(['+251911234567', '251911234567', '0911234567', '911234567', '0911 234 567', '0711234567'])(
    'accepts the phone number %s',
    (value) => expect(phoneError(value)).toBeNull(),
  );

  it.each(['', '12345', '0811234567', '+1 202 555 0100', '09112345678', 'abc'])(
    'rejects the phone number "%s"',
    (value) => expect(phoneError(value)).not.toBeNull(),
  );

  it('applies the password rules of the API', () => {
    expect(passwordError('abc1234')).toMatch(/8 characters/);
    expect(passwordError('abcdefgh')).toMatch(/letter and one number/);
    expect(passwordError('12345678')).toMatch(/letter and one number/);
    expect(passwordError('a1'.repeat(65))).toMatch(/128/);
    expect(passwordError('abcd1234')).toBeNull();
  });

  it('treats name and email as optional but checks them when given', () => {
    expect(fullNameError('  ')).toBeNull();
    expect(fullNameError('A')).not.toBeNull();
    expect(fullNameError('<b>Abebe</b>')).not.toBeNull();
    expect(emailError('')).toBeNull();
    expect(emailError('abebe@example')).not.toBeNull();
    expect(emailError('abebe@example.com')).toBeNull();
  });
});

describe('returnPath', () => {
  it('returns a path inside this site', () => {
    expect(returnPath({ from: '/auctions/1?x=1' })).toBe('/auctions/1?x=1');
  });

  it.each([
    null,
    {},
    { from: 5 },
    { from: 'https://evil.example' },
    { from: '//evil.example' },
    { from: '/\\evil.example' },
  ])('falls back to the home page for %j', (state) => expect(returnPath(state)).toBe('/'));
});
