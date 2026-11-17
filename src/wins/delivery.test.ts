import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { aDelivery, aWin } from '../test/fakeApi';
import {
  deliveryErrors,
  deliverySaveMessage,
  formatAddress,
  initialDeliveryForm,
  stepsDone,
  toDeliveryDetails,
  winStatus,
  type DeliveryForm,
} from './delivery';

const filled: DeliveryForm = {
  recipientName: 'Abebe Kebede',
  recipientPhone: '0911 234 567',
  city: 'Addis Ababa',
};
const sent = aDelivery({
  recipientName: 'Abebe Kebede',
  recipientPhone: '+251911234567',
  address: {
    city: 'Addis Ababa',
    subCity: 'Bole',
    woreda: '03',
  },
});

describe('delivery form', () => {
  it('starts from the account, or from the details already sent', () => {
    const account = { fullName: 'Sara T', phoneNumber: '+251911000222' };
    expect(initialDeliveryForm(aWin(), account)).toMatchObject({
      recipientName: 'Sara T',
      recipientPhone: '+251911000222',
      city: '',
    });
    expect(initialDeliveryForm(aWin({ delivery: sent }), account)).toEqual({
      recipientName: 'Abebe Kebede',
      recipientPhone: '+251911234567',
      city: 'Addis Ababa',
    });
    expect(initialDeliveryForm(aWin(), { fullName: null, phoneNumber: '' }).recipientName).toBe('');
  });

  it('accepts a complete form and points at each box that is wrong', () => {
    expect(deliveryErrors(filled)).toEqual({});
    expect(
      Object.keys(deliveryErrors({ ...filled, recipientName: ' ', recipientPhone: '', city: '' })),
    ).toEqual(['recipientName', 'recipientPhone', 'city']);
    expect(deliveryErrors({ ...filled, recipientName: 'A' }).recipientName).toMatch(/between 2 and 150/);
    expect(deliveryErrors({ ...filled, city: 'x'.repeat(101) }).city).toMatch(/between 2 and 100/);
    for (const phone of ['12345678', '1234567890123456', '09x1234567', '++251911234567']) {
      expect(deliveryErrors({ ...filled, recipientPhone: phone }).recipientPhone, phone).toMatch(
        /valid phone/,
      );
    }
    for (const phone of ['+251 911 234 567', '(091) 123-4567', '911234567']) {
      expect(deliveryErrors({ ...filled, recipientPhone: phone }).recipientPhone, phone).toBeUndefined();
    }
  });

  it('sends the name, the phone as digits and the city, trimmed', () => {
    expect(toDeliveryDetails({ ...filled, recipientName: '  Abebe Kebede ', city: ' Addis Ababa ' })).toEqual(
      {
        recipientName: 'Abebe Kebede',
        recipientPhone: '0911234567',
        address: { city: 'Addis Ababa' },
      },
    );
  });

  it('writes an address on one line', () => {
    expect(formatAddress({ city: 'Addis Ababa', subCity: 'Bole', woreda: '03', houseNumber: '12B' })).toBe(
      'House 12B, Woreda 03, Bole, Addis Ababa',
    );
    expect(formatAddress({ city: 'Adama', region: 'Oromia' })).toBe('Adama, Oromia');
    expect(formatAddress({ city: 'Addis Ababa', region: 'Addis Ababa' })).toBe('Addis Ababa');
  });

  it('words a refused save by its code', () => {
    const refusal = (code: string) => new ApiError(409, code, 'server wording');
    expect(deliverySaveMessage(refusal('DELIVERY_INVALID_STATE'))).toMatch(/can no longer be changed/);
    expect(deliverySaveMessage(refusal('WINNER_INVALID_STATE'))).toMatch(/not been confirmed yet/);
    expect(deliverySaveMessage(refusal('SOMETHING_ELSE'))).toBeNull();
    expect(deliverySaveMessage(new Error('offline'))).toBeNull();
  });
});

describe('where a win stands', () => {
  const at = (status: NonNullable<ReturnType<typeof aWin>['delivery']>['status'], details = true) =>
    aWin({ delivery: details ? { ...sent, status } : aDelivery({ status }) });

  it('follows the win and its delivery', () => {
    const cases: [ReturnType<typeof aWin>, string, number | null][] = [
      [aWin({ verificationStatus: 'PENDING_VERIFICATION', delivery: null }), 'Being checked', 1],
      [aWin({ verificationStatus: 'REJECTED', delivery: null }), 'Not confirmed', null],
      [at('PENDING', false), 'Details needed', 2],
      [at('CONTACTED', false), 'Details needed', 2],
      [at('PENDING'), 'Arranging delivery', 2],
      [at('CONTACTED'), 'Arranging delivery', 2],
      [at('VERIFIED'), 'Preparing', 3],
      [at('DISPATCHED'), 'On its way', 4],
      [at('DELIVERED'), 'Delivered', 5],
      [at('DISPUTED'), 'On hold', null],
    ];
    for (const [win, label, done] of cases) {
      expect(winStatus(win).label).toBe(label);
      expect(stepsDone(win), label).toBe(done);
    }
  });
});
