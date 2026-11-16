import { errorMessage } from '../api/errors';
import { Alert, Button, Card, PageLoading } from '../components/ui';
import { cx } from '../lib/cx';
import { formatDateTime } from '../lib/clock';
import { formatMoney } from '../lib/money';
import { useWallet, useWalletTransactions, type WalletTransaction } from '../wallet/queries';
import { usePageTitle } from '../lib/usePageTitle';

const TYPE_LABELS: Record<WalletTransaction['type'], string> = {
  DEPOSIT: 'Deposit',
  BID_FEE: 'Bid fees',
  REFUND: 'Refund',
  WITHDRAWAL_HOLD: 'Withdrawal requested',
  WITHDRAWAL_RELEASE: 'Withdrawal cancelled',
  WITHDRAWAL_PAYOUT: 'Withdrawal paid',
  ADJUSTMENT: 'Adjustment by support',
};

/** Types whose description is written by the system. An adjustment's is a staff note, so it is not shown. */
const DESCRIBED: ReadonlySet<WalletTransaction['type']> = new Set(['BID_FEE', 'REFUND']);

export function WalletPage() {
  usePageTitle('Wallet');
  const wallet = useWallet();
  const transactions = useWalletTransactions();

  if (wallet.isPending) return <PageLoading label="Loading wallet" />;
  if (wallet.isError) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <Alert>{errorMessage(wallet.error)}</Alert>
        <Button variant="secondary" onClick={() => void wallet.refetch()} busy={wallet.isFetching}>
          Try again
        </Button>
      </div>
    );
  }

  const w = wallet.data;
  const rows = transactions.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">Wallet</h1>

      <section aria-label="Balance" className="rounded-2xl bg-brand-700 px-5 py-6 text-white">
        <p className="text-sm text-brand-50">Available balance</p>
        <p className="text-3xl font-bold tabular-nums">{formatMoney(w.available, w.currency)}</p>
        {w.heldMinor !== '0' && (
          <p className="mt-1 text-sm text-brand-50">
            On hold: <span className="tabular-nums">{formatMoney(w.held, w.currency)}</span>
          </p>
        )}
      </section>

      {w.isFrozen && (
        <Alert tone="warning">
          Your wallet is frozen. Money can still arrive, but you cannot bid with it. Please contact support.
        </Alert>
      )}
      <Alert tone="info">
        Paying in online is not available yet. To add money to your wallet, please contact support.
      </Alert>

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-lg font-semibold">
          History
        </h2>
        {transactions.isPending ? (
          <PageLoading label="Loading history" />
        ) : transactions.isError && rows.length === 0 ? (
          <div className="mt-3 space-y-3">
            <Alert>{errorMessage(transactions.error)}</Alert>
            <Button
              variant="secondary"
              onClick={() => void transactions.refetch()}
              busy={transactions.isFetching}
            >
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-slate-500">
            Nothing has gone in or out of your wallet yet.
          </p>
        ) : (
          <>
            <Card className="mt-3">
              <ul className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <TransactionRow key={row.id} row={row} />
                ))}
              </ul>
            </Card>
            {transactions.isError && <Alert>{errorMessage(transactions.error)}</Alert>}
            {transactions.hasNextPage && (
              <div className="mt-4 text-center">
                <Button
                  variant="secondary"
                  onClick={() => void transactions.fetchNextPage()}
                  busy={transactions.isFetchingNextPage}
                >
                  Show older
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function TransactionRow({ row }: { row: WalletTransaction }) {
  const credit = row.direction === 'CREDIT';
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="font-semibold">
          {TYPE_LABELS[row.type]}
          {row.status === 'REVERSED' && (
            <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
              Reversed
            </span>
          )}
        </p>
        {DESCRIBED.has(row.type) && row.description && (
          <p className="text-sm break-words text-slate-600">{row.description}</p>
        )}
        <p className="text-xs text-slate-500">
          <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time> · {row.reference}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={cx('font-semibold tabular-nums', credit ? 'text-emerald-700' : 'text-slate-900')}>
          {credit ? '+' : '−'}
          {formatMoney(row.amount, row.currency)}
        </p>
        <p className="text-xs text-slate-500 tabular-nums">
          Balance {formatMoney(row.balanceAfter, row.currency)}
        </p>
      </div>
    </li>
  );
}
