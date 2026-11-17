import { useParams } from 'react-router-dom';
import { errorMessage, isApiError } from '../api/errors';
import { Alert, Button, ButtonLink, Card, PageLoading, Spinner } from '../components/ui';
import { formatDateTime } from '../lib/clock';
import { formatMoney } from '../lib/money';
import { usePageTitle } from '../lib/usePageTitle';
import { bidsPending, checkoutAddress, isWaiting, useDeposit, type Deposit } from '../wallet/deposits';
import { t, tk } from '../i18n/i18n';
import { tRich } from '../i18n/rich';

const CLOSED: Record<'FAILED' | 'CANCELLED' | 'EXPIRED', { title: string; text: string }> = {
  FAILED: {
    title: tk('Payment not completed'),
    text: tk('The payment did not go through, so no money was added to your wallet.'),
  },
  CANCELLED: {
    title: tk('Payment cancelled'),
    text: tk('The payment was cancelled, so no money was added to your wallet.'),
  },
  EXPIRED: {
    title: tk('Payment expired'),
    text: tk('This payment was not finished in time, so no money was added to your wallet.'),
  },
};

/** Where Chapa sends the user back to. Shows what the server knows about the payment, never what the address says. */
export function DepositPage() {
  usePageTitle(t('Payment'));
  const { id = '' } = useParams();
  const deposit = useDeposit(id);

  if (deposit.isPending) return <PageLoading label={t('Checking your payment')} />;
  if (deposit.isError && !deposit.data) {
    const missing = isApiError(deposit.error, 'NOT_FOUND', 'VALIDATION_FAILED');
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <h1 className="text-2xl font-bold tracking-tight">{t('Payment')}</h1>
        <Alert>{missing ? t('We could not find this payment.') : errorMessage(deposit.error)}</Alert>
        {missing ? (
          <ButtonLink to="/wallet" variant="secondary">
            {t('Back to wallet')}
          </ButtonLink>
        ) : (
          <Button variant="secondary" onClick={() => void deposit.refetch()} busy={deposit.isFetching}>
            {t('Try again')}
          </Button>
        )}
      </div>
    );
  }

  const d = deposit.data;
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">{t('Payment')}</h1>
      <Card className="space-y-4 p-5">
        <Outcome deposit={d} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-slate-100 pt-4 text-sm">
          <dt className="text-slate-500">{t('Amount')}</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(d.amount, d.currency)}</dd>
          <dt className="text-slate-500">{t('Reference')}</dt>
          <dd className="break-all">{d.reference}</dd>
          <dt className="text-slate-500">{t('Started')}</dt>
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

  if (deposit.status === 'SUCCEEDED' && deposit.bid) return <PaidBids deposit={deposit} bid={deposit.bid} />;

  if (deposit.status === 'SUCCEEDED') {
    return (
      <div className="space-y-3">
        <div role="status">
          <h2 className="text-lg font-semibold text-emerald-800">{t('Payment received')}</h2>
          <p className="text-slate-700">{t('{amount} was added to your wallet.', { amount })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/wallet">{t('Go to wallet')}</ButtonLink>
          <ButtonLink to="/" variant="secondary">
            {t('See auctions')}
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
            <h2 className="text-lg font-semibold">{t('Waiting for your payment')}</h2>
            {deposit.bid && (
              <p className="text-slate-700">
                {t(
                  deposit.bid.amounts.length === 1
                    ? 'Your bid of {amounts} will be placed as soon as the payment is confirmed.'
                    : 'Your bids of {amounts} will be placed as soon as the payment is confirmed.',
                  { amounts: bidList(deposit) },
                )}
              </p>
            )}
            <p className="text-slate-700">
              {t(
                'We have not received confirmation from Chapa yet. If you have paid, stay on this page: it updates by itself, usually within a minute. No money is added until the payment is confirmed.',
              )}
            </p>
          </div>
        </div>
        {address && (
          <a
            href={address}
            className="inline-flex min-h-11 items-center rounded-full bg-slate-200/80 px-5 text-sm font-semibold text-slate-900 hover:bg-slate-300/80"
          >
            {t('I have not paid yet: open the payment page')}
          </a>
        )}
        <p className="text-sm text-slate-500">
          {tRich('This payment can be finished until {date}.', {
            date: <time dateTime={deposit.expiresAt}>{formatDateTime(deposit.expiresAt)}</time>,
          })}
        </p>
      </div>
    );
  }

  const closed = CLOSED[deposit.status as keyof typeof CLOSED] ?? CLOSED.FAILED;
  return (
    <div className="space-y-3">
      <div role="alert">
        <h2 className="text-lg font-semibold text-red-800">{t(closed.title)}</h2>
        <p className="text-slate-700">{t(closed.text)}</p>
      </div>
      <p className="text-sm text-slate-600">
        {t('If money left your account for this payment, contact support and give them the reference below.')}
      </p>
      <ButtonLink to="/wallet">{t('Try again')}</ButtonLink>
    </div>
  );
}

const bidList = (deposit: Deposit): string =>
  (deposit.bid?.amounts ?? []).map((amount) => formatMoney(amount, deposit.currency)).join(', ');

/** Pay and bid: the payment arrived; what happened to the bids it was for. */
function PaidBids({ deposit, bid }: { deposit: Deposit; bid: NonNullable<Deposit['bid']> }) {
  const amount = formatMoney(deposit.amount, deposit.currency);
  const auction = (
    <ButtonLink to={`/auctions/${bid.auctionId}`} variant="secondary">
      {t('Back to the auction')}
    </ButtonLink>
  );
  if (bidsPending(deposit)) {
    return (
      <div role="status" className="flex items-start gap-3">
        <Spinner className="mt-1 h-5 w-5 shrink-0 text-brand-700" />
        <div>
          <h2 className="text-lg font-semibold">{t('Payment received, placing your bids')}</h2>
          <p className="text-slate-700">{t('This takes a moment. The page updates by itself.')}</p>
        </div>
      </div>
    );
  }
  if (bid.state === 'PLACED') {
    const many = bid.amounts.length > 1;
    return (
      <div className="space-y-3">
        <div role="status">
          <h2 className="text-lg font-semibold text-emerald-800">
            {many ? t('Your bids are placed') : t('Your bid is placed')}
          </h2>
          <p className="text-slate-700">
            {t('You paid {amount} and bid {amounts}. Good luck!', { amount, amounts: bidList(deposit) })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/bids">{t('See my bids')}</ButtonLink>
          {auction}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div role="alert">
        <h2 className="text-lg font-semibold text-red-800">
          {t('Payment received, but the bids were not placed')}
        </h2>
        <p className="text-slate-700">
          {bid.error ? `${bid.error.replace(/\.?$/, '.')} ` : ''}
          {t('Your {amount} is in your wallet, so you can bid again from there.', { amount })}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <ButtonLink to="/wallet">{t('Go to wallet')}</ButtonLink>
        {auction}
      </div>
    </div>
  );
}
