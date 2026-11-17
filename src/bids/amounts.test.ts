import { describe, expect, it } from 'vitest';
import { formatMinor, fromMinor, toMinor } from '../lib/money';
import { newIdempotencyKey, parseBidAmount, sortAmounts } from './amounts';

const rules = { minorUnits: 2, minBidMinor: '100', maxBidMinor: '100000', bidStepMinor: '100' };

describe('toMinor / fromMinor', () => {
  it('reads typed amounts exactly, without floating point', () => {
    expect(toMinor('4', 2)).toBe(400n);
    expect(toMinor(' 4.5 ', 2)).toBe(450n);
    expect(toMinor('0.07', 2)).toBe(7n);
    expect(toMinor('4.', 2)).toBe(400n);
    expect(toMinor('123456789012345.99', 2)).toBe(12345678901234599n);
    expect(toMinor('19', 0)).toBe(19n);
  });

  it('refuses anything that is not a plain amount', () => {
    for (const bad of [
      '',
      ' ',
      '-4',
      '+4',
      '4.555',
      '1,000',
      '4e2',
      '0x10',
      'four',
      '.5',
      '4 5',
      '1'.repeat(16),
    ]) {
      expect(toMinor(bad, 2), bad).toBeNull();
    }
    expect(toMinor('4.5', 0)).toBeNull();
  });

  it('writes minor units back as major units', () => {
    expect(fromMinor('450', 2)).toBe('4.50');
    expect(fromMinor(7n, 2)).toBe('0.07');
    expect(fromMinor('-12345', 2)).toBe('-123.45');
    expect(fromMinor('19', 0)).toBe('19');
    expect(formatMinor('6500000', 'ETB', 2)).toBe('ETB 65,000');
    expect(formatMinor('90071992547409930001', 'ETB', 2)).toBe('ETB 900,719,925,474,099,300.01');
  });
});

describe('parseBidAmount', () => {
  it('accepts amounts inside the range and on the step', () => {
    expect(parseBidAmount('1', rules)).toEqual({ ok: true, minor: 100n });
    expect(parseBidAmount('1000.00', rules)).toEqual({ ok: true, minor: 100000n });
    expect(parseBidAmount('2.5', { ...rules, minBidMinor: '50', bidStepMinor: '50' })).toEqual({
      ok: true,
      minor: 250n,
    });
  });

  it('names what is wrong with the others', () => {
    expect(parseBidAmount('abc', rules)).toEqual({ ok: false, problem: 'format' });
    expect(parseBidAmount('0.5', rules)).toEqual({ ok: false, problem: 'below' });
    expect(parseBidAmount('0', rules)).toEqual({ ok: false, problem: 'below' });
    expect(parseBidAmount('1000.01', rules)).toEqual({ ok: false, problem: 'above' });
    expect(parseBidAmount('4.50', rules)).toEqual({ ok: false, problem: 'step' });
    // The step counts from the lowest bid, not from zero.
    expect(parseBidAmount('3', { ...rules, minBidMinor: '100', bidStepMinor: '300' })).toEqual({
      ok: false,
      problem: 'step',
    });
    expect(parseBidAmount('4', { ...rules, minBidMinor: '100', bidStepMinor: '300' })).toEqual({
      ok: true,
      minor: 400n,
    });
  });
});

describe('sortAmounts / newIdempotencyKey', () => {
  it('sorts by value, not as text', () => {
    expect(sortAmounts([1000n, 200n, 30000n, 100n])).toEqual([100n, 200n, 1000n, 30000n]);
  });

  it('makes keys the API accepts, different every time', () => {
    const keys = new Set(Array.from({ length: 50 }, newIdempotencyKey));
    expect(keys.size).toBe(50);
    for (const key of keys) expect(key).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
  });
});
