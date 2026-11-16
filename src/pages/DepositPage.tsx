import { useParams } from 'react-router-dom';
import { errorMessage, isApiError } from '../api/errors';
import { Alert, Button, ButtonLink, Card, PageLoading, Spinner } from '../components/ui';
import { formatDateTime } from '../lib/clock';
import { formatMoney } from '../lib/money';
import { usePageTitle } from '../lib/usePageTitle';
import { checkoutAddress, isWaiting, useDeposit, type Deposit } from '../wallet/deposits';

const CLOSED: Record<'FAILED' | 'CANCELLED' | 'EXPIRED', { title: string; text: string }> = {
  FAILED: {
    title: 'Payment not completed',
    text: 'The payment did not go through, so no money was added to your wallet.',
  },
  CANCELLED: {
    title: 'Payment cancelled',
    text: 'The payment was cancelled, so no money was added to your wallet.',
  },
  EXPIRED: {
    title: 'Payment expired',
    text: 'This payment was not finished in time, so no money was added to your wallet.',
  },
};

/** Where Chapa sends the user back to. Shows what the server knows about the payment, never what the address says. */
export function DepositPage() {
  usePageTitle('Payment');
  const { id = '' } = useParams();
  const deposit = useDeposit(id);

  if (deposit.isPending) return <PageLoading label="Checking your payment" />;
  if (deposit.isError && !deposit.data) {
    const missing = isApiError(deposit.error, 'NOT_FOUND', 'VALIDATION_FAILED');
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <h1 className="text-2xl font-bold">Payment</h1>
        <Alert>{missing ? 'We could not find this payment.' : errorMessage(deposit.error)}</Alert>
        {missing ? (
          <ButtonLink to="/wallet" variant="secondary">
            Back to wallet
          </ButtonLink>
        ) : (
          <Button variant="secondary" onClick={() => void deposit.refetch()} busy={deposit.isFetching}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  const d = deposit.data;
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-2xl font-bold">Payment</h1>
      <Card className="space-y-4 p-5">
        <Outcome deposit={d} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-slate-100 pt-4 text-sm">
          <dt className="text-slate-500">Amount</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(d.amount, d.currency)}</dd>
          <dt className="text-slate-500">Reference</dt>
          <dd className="break-all">{d.reference}</dd>
          <dt className="text-slate-500">Started</dt>
          <dd>
            <time dateTime={d.createdAt}>{formatDateTime(d.createdAt)}</time>
          </dd>
        </dl>
      </Card>
      {deposit.isError && <Alert>{errorMessage(deposit.error)}</Alert>}
    </div>
  );
}

function Outcome({ deposit }: { deposit: Deposit }) {
  const amount = formatMoney(deposit.amount, deposit.currency);

  if (deposit.status === 'SUCCEEDED') {
    return (
      <div className="space-y-3">
        <div role="status">
          <h2 className="text-lg font-semibold text-emerald-800">Payment received</h2>
          <p className="text-slate-700">{amount} was added to your wallet.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/wallet">Go to wallet</ButtonLink>
          <ButtonLink to="/" variant="secondary">
            See auctions
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (isWaiting(deposit)) {
    const address = checkoutAddress(deposit);
    return (
      <div className="space-y-3">
        <div role="status" className="flex items-start gap-3">
          <Spinner className="mt-1 h-5 w-5 shrink-0 text-brand-700" />
          <div>
            <h2 className="text-lg font-semibold">Waiting for your payment</h2>
            <p className="text-slate-700">
              We have not received confirmation from Chapa yet. If you have paid, stay on this page: it
              updates by itself, usually within a minute. No money is added until the payment is confirmed.
            </p>
          </div>
        </div>
        {address && (
          <a
            href={address}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            I have not paid yet: open the payment page
          </a>
        )}
        <p className="text-sm text-slate-500">
          This payment can be finished until{' '}
          <time dateTime={deposit.expiresAt}>{formatDateTime(deposit.expiresAt)}</time>.
        </p>
      </div>
    );
  }

  const closed = CLOSED[deposit.status as keyof typeof CLOSED] ?? CLOSED.FAILED;
  return (
    <div className="space-y-3">
      <div role="alert">
        <h2 className="text-lg font-semibold text-red-800">{closed.title}</h2>
        <p className="text-slate-700">{closed.text}</p>
      </div>
      <p className="text-sm text-slate-600">
        If money left your account for this payment, contact support and give them the reference below.
      </p>
      <ButtonLink to="/wallet">Try again</ButtonLink>
    </div>
  );
}
