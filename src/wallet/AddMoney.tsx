import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Field } from '../components/ui';
import { formatDateTime } from '../lib/clock';
import { leaveTo } from '../lib/leave';
import { formatMinor, formatMoney } from '../lib/money';
import {
  checkoutAddress,
  depositErrorMessage,
  isWaiting,
  parseDepositAmount,
  quickAmounts,
  useMyDeposits,
  useStartDeposit,
  type DepositOptions,
} from './deposits';

/** The form that starts a deposit and hands the user over to Chapa's payment page. */
export function AddMoney({ options }: { options: DepositOptions }) {
  const [input, setInput] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const start = useStartDeposit();
  const limits = `${formatMinor(options.minAmountMinor, options.currency, options.minorUnits)} to ${formatMinor(options.maxAmountMinor, options.currency, options.minorUnits)}`;

  function submit(event: FormEvent) {
    event.preventDefault();
    const amount = parseDepositAmount(input, options);
    if (!amount.ok) {
      setProblem(amount.message);
      return;
    }
    setProblem(null);
    start.mutate(amount.minor.toString(), {
      onSuccess: (deposit) => {
        const address = checkoutAddress(deposit);
        if (!address) {
          setProblem('The payment page could not be opened. No money was taken. Please try again.');
          return;
        }
        setLeaving(true);
        leaveTo(address);
      },
    });
  }

  return (
    <section aria-labelledby="add-money-heading">
      <h2 id="add-money-heading" className="text-lg font-semibold">
        Add money
      </h2>
      <Card className="mt-3 space-y-4 p-4">
        {options.testMode && (
          <Alert tone="warning">Test mode: payments here are practice only. No real money moves.</Alert>
        )}
        <form onSubmit={submit} noValidate className="space-y-3">
          <Field
            label={`Amount (${options.currency})`}
            required
            inputMode="decimal"
            autoComplete="off"
            placeholder="500"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setProblem(null);
            }}
            hint={`${limits} at a time.`}
            error={problem}
          />
          <ul aria-label="Common amounts" className="flex flex-wrap gap-2">
            {quickAmounts(options).map((amount) => (
              <li key={amount}>
                <button
                  type="button"
                  onClick={() => {
                    setInput(amount);
                    setProblem(null);
                  }}
                  className="min-h-11 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {formatMoney(amount, options.currency)}
                </button>
              </li>
            ))}
          </ul>
          {start.isError && <Alert>{depositErrorMessage(start.error, options)}</Alert>}
          <Button type="submit" busy={start.isPending || leaving} className="w-full sm:w-auto">
            Continue to payment
          </Button>
          <p className="text-sm text-slate-500">
            You pay on Chapa&rsquo;s payment page, then come back here. The money is added to your wallet once
            Chapa confirms the payment.
          </p>
        </form>
      </Card>
      <UnfinishedDeposits />
    </section>
  );
}

/** Payments the user started and has not finished, so a closed tab does not lose them. */
function UnfinishedDeposits() {
  const deposits = useMyDeposits(true);
  const waiting = deposits.data?.items.filter(isWaiting) ?? [];
  if (waiting.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-slate-700">Payments not finished</h3>
      <Card className="mt-2">
        <ul className="divide-y divide-slate-100">
          {waiting.map((deposit) => (
            <li key={deposit.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold tabular-nums">{formatMoney(deposit.amount, deposit.currency)}</p>
                <p className="text-xs text-slate-500">
                  Started <time dateTime={deposit.createdAt}>{formatDateTime(deposit.createdAt)}</time>
                </p>
              </div>
              <Link
                to={`/wallet/deposits/${deposit.id}`}
                className="shrink-0 text-sm font-semibold text-brand-700 underline"
              >
                View payment
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
