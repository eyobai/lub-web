import { api, unwrap } from '../api/client';
import { ApiError } from '../api/errors';
import type { Deposit } from './deposits';

/** Chapa's inline service: sends a phone payment request from the payer's browser, with the public key. */
export const CHAPA_INLINE_ORIGIN = 'https://inline.chapaservices.net';
const CHARGE_URL = `${CHAPA_INLINE_ORIGIN}/v1/inline/charge`;

/**
 * Asks Chapa to send the approval request to the payer's phone for a deposit the server opened. The deposit's own
 * reference is the transaction reference, so the server can confirm the payment with Chapa before giving value;
 * nothing the browser says about the payment is trusted.
 *
 * When Chapa refuses, the server is told, so the deposit does not wait for an approval that cannot come, and an
 * ApiError like the one for a request the server could not send is thrown.
 */
export async function sendInlineCharge(
  publicKey: string,
  deposit: Deposit,
  charge: { method: string; phoneNumber: string },
): Promise<void> {
  const form = new FormData();
  form.append('amount', deposit.amount);
  form.append('currency', deposit.currency);
  form.append('tx_ref', deposit.reference);
  form.append('mobile', charge.phoneNumber);
  form.append('payment_method', charge.method);

  let refused: string | null = null;
  try {
    const response = await fetch(CHARGE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${publicKey}` },
      body: form,
    });
    const body = (await response.json().catch(() => ({}))) as { status?: unknown; message?: unknown };
    if (!response.ok || body.status !== 'success') {
      refused = typeof body.message === 'string' ? body.message : `HTTP ${response.status}`;
    }
  } catch {
    refused = 'Chapa could not be reached';
  }
  if (refused === null) return;

  await unwrap(
    api.POST('/api/v1/wallet/deposits/{id}/charge-not-sent', {
      params: { path: { id: deposit.id } },
      body: { reason: refused.slice(0, 300) },
    }),
  ).catch(() => undefined);
  throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', refused, {
    directCharge: true,
    ...(/not allowed|not permitted|unauthori[sz]ed/i.test(refused) ? { unavailable: true } : {}),
  });
}
