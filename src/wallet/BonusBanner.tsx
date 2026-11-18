import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { fromMinor } from '../lib/money';
import { t } from '../i18n/i18n';
import { useDepositOptions } from './deposits';
import { useWallet } from './queries';

/** "10000.00" → "10,000": the cap as people say it, without the currency or empty decimals. */
const plain = (minor: string, minorUnits: number) => {
  const [whole, fraction = ''] = fromMinor(minor, minorUnits).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return /^0*$/.test(fraction) ? grouped : `${grouped}.${fraction}`;
};

/**
 * The top-up bonus, advertised with the numbers the server actually applies. Hidden while top-ups or the bonus are
 * off. Signed-in people go straight to the top-up sheet; visitors to registration.
 */
export function BonusBanner() {
  const { user } = useAuth();
  const options = useDepositOptions();
  const wallet = useWallet();
  const o = options.data;
  if (!o?.enabled || o.bonusPercent <= 0) return null;
  // Only the first top-up earns it: someone who has had it is not offered it again.
  if (user && wallet.data?.topUpBonusAvailable === false) return null;
  const cap = plain(o.bonusMaxMinor, o.minorUnits);
  const target = user ? '/wallet?topup=1' : '/register';

  return (
    <Link
      to={target}
      aria-label={t('{percent}% bonus on your first top-up, up to ETB {amount}. Top up now', {
        percent: o.bonusPercent,
        amount: cap,
      })}
      className="group relative mt-5 flex min-h-[13rem] overflow-hidden rounded-4xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 text-white shadow-[0_18px_40px_-18px_rgb(4_120_87/0.7)] focus-visible:outline-offset-4"
    >
      <span
        aria-hidden="true"
        className="absolute -top-20 -left-16 h-56 w-56 rounded-full bg-white/10 blur-2xl"
      />
      <span
        aria-hidden="true"
        className="absolute -right-10 -bottom-24 h-64 w-64 rounded-full bg-brand-400/40 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.12)_1.5px,transparent_1.6px)] [background-size:22px_22px] [mask-image:linear-gradient(90deg,#000,transparent_70%)]"
      />

      <div
        aria-hidden="true"
        className="relative z-10 flex flex-1 flex-col justify-center py-5 pr-1 pl-5 sm:pl-8"
      >
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-bold ring-1 ring-white/25 backdrop-blur-sm">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M12 19V5m-6 6 6-6 6 6" />
          </svg>
          {t('Top up your wallet')}
        </span>
        <span className="mt-1 block text-[3.6rem] leading-none font-black tracking-tight drop-shadow-[0_4px_18px_rgb(110_231_183/0.55)] sm:text-7xl">
          <span className="bg-gradient-to-b from-white to-brand-100 bg-clip-text text-transparent">
            {o.bonusPercent}%
          </span>
        </span>
        <span className="block text-4xl leading-tight font-black sm:text-5xl">{t('Bonus')}</span>
        <span className="mt-0.5 block text-base font-semibold text-white/90">
          {t('on your first top-up')}
        </span>
        <span className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-ink px-3.5 py-1.5 text-sm font-bold text-white shadow-md">
            {t('Up to ETB {amount}', { amount: cap })}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-sm font-bold text-brand-700 shadow-md transition-transform group-hover:translate-x-0.5">
            {user ? t('Top up now') : t('Join now')}
            <span>→</span>
          </span>
        </span>
      </div>

      <div
        aria-hidden="true"
        className="relative z-0 -mr-3 flex w-[38%] max-w-[15rem] shrink-0 items-end justify-center self-end sm:-mr-0 sm:w-[34%]"
      >
        <BonusPhone percent={o.bonusPercent} />
      </div>
    </Link>
  );
}

/** A phone showing a LeyuBid wallet doubled by the bonus, with coins around it. Drawn, so it is ours. */
function BonusPhone({ percent }: { percent: number }) {
  return (
    <svg
      viewBox="0 0 220 260"
      className="h-auto w-full translate-y-3 drop-shadow-[0_18px_22px_rgb(2_44_34/0.45)]"
    >
      <defs>
        <linearGradient id="bb-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a2f2e" />
          <stop offset="1" stopColor="#0d0f0f" />
        </linearGradient>
        <linearGradient id="bb-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4fbf8" />
          <stop offset="1" stopColor="#dff5ea" />
        </linearGradient>
        <linearGradient id="bb-coin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset=".5" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
        <radialGradient id="bb-dot" cx=".35" cy=".3" r=".8">
          <stop offset="0" stopColor="#6ee7b7" />
          <stop offset=".55" stopColor="#10b981" />
          <stop offset="1" stopColor="#047857" />
        </radialGradient>
      </defs>
      <g transform="rotate(8 120 140)">
        <rect x="58" y="14" width="124" height="246" rx="22" fill="url(#bb-body)" />
        <rect x="64" y="20" width="112" height="234" rx="17" fill="url(#bb-screen)" />
        <rect x="102" y="27" width="36" height="9" rx="4.5" fill="#0d0f0f" />
        {/* app header */}
        <rect x="74" y="46" width="18" height="18" rx="5" fill="#161513" />
        <path
          d="M80 50v9h7"
          fill="none"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="87.5" cy="51.5" r="2" fill="url(#bb-dot)" />
        <text
          x="97"
          y="59.5"
          fontSize="10"
          fontWeight="700"
          fill="#161513"
          fontFamily="Outfit Variable, Noto Sans Ethiopic Variable, sans-serif"
        >
          LeyuBid
        </text>
        {/* balance card */}
        <rect x="74" y="72" width="92" height="58" rx="12" fill="#161513" />
        <text
          x="83"
          y="88"
          fontSize="7"
          fill="#a7f3d0"
          fontFamily="Outfit Variable, Noto Sans Ethiopic Variable, sans-serif"
        >
          {t('Balance')}
        </text>
        <text
          x="83"
          y="106"
          fontSize="15"
          fontWeight="800"
          fill="#fff"
          fontFamily="Outfit Variable, Noto Sans Ethiopic Variable, sans-serif"
        >
          ETB 2,000
        </text>
        <rect x="83" y="113" width="62" height="11" rx="5.5" fill="#10b981" />
        <text
          x="114"
          y="121"
          textAnchor="middle"
          fontSize="6.5"
          fontWeight="700"
          fill="#fff"
          fontFamily="Outfit Variable, Noto Sans Ethiopic Variable, sans-serif"
        >
          +{percent}% {t('Bonus')}
        </text>
        {/* rows */}
        <rect x="74" y="140" width="92" height="22" rx="8" fill="#fff" />
        <circle cx="85" cy="151" r="6" fill="#d1fae5" />
        <path d="M85 148v6m-3-3h6" stroke="#047857" strokeWidth="1.6" strokeLinecap="round" />
        <rect x="95" y="147" width="30" height="4" rx="2" fill="#cbd5e1" />
        <text
          x="160"
          y="154"
          textAnchor="end"
          fontSize="7"
          fontWeight="700"
          fill="#047857"
          fontFamily="Outfit Variable, Noto Sans Ethiopic Variable, sans-serif"
        >
          +1,000
        </text>
        <rect x="74" y="167" width="92" height="22" rx="8" fill="#fff" />
        <circle cx="85" cy="178" r="6" fill="#fef3c7" />
        <path
          d="M82 176h6v5h-6zm3 0v5m-3.5-5c.5-2 3.5-2 3.5 0 0-2 3-2 3.5 0"
          stroke="#b45309"
          strokeWidth="1.2"
          fill="none"
        />
        <rect x="95" y="174" width="26" height="4" rx="2" fill="#cbd5e1" />
        <text
          x="160"
          y="181"
          textAnchor="end"
          fontSize="7"
          fontWeight="700"
          fill="#047857"
          fontFamily="Outfit Variable, Noto Sans Ethiopic Variable, sans-serif"
        >
          +1,000
        </text>
        <rect x="74" y="200" width="92" height="22" rx="11" fill="#059669" />
        <text
          x="120"
          y="214"
          textAnchor="middle"
          fontSize="8"
          fontWeight="700"
          fill="#fff"
          fontFamily="Outfit Variable, Noto Sans Ethiopic Variable, sans-serif"
        >
          {t('Top up')}
        </text>
      </g>
      {/* coins */}
      {[
        [40, 92, 17],
        [24, 140, 12],
        [196, 70, 13],
        [44, 196, 10],
      ].map(([cx, cy, r], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={r} fill="url(#bb-coin)" />
          <circle
            cx={cx}
            cy={cy}
            r={r * 0.72}
            fill="none"
            stroke="#fff7d6"
            strokeOpacity=".7"
            strokeWidth="1.5"
          />
          <text
            x={cx}
            y={cy + r * 0.32}
            textAnchor="middle"
            fontSize={r * 0.9}
            fontWeight="800"
            fill="#92400e"
            fontFamily="Outfit Variable, Noto Sans Ethiopic Variable, sans-serif"
          >
            ብር
          </text>
        </g>
      ))}
      <path d="M198 112l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff" opacity=".9" />
      <path d="M22 60l2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2z" fill="#a7f3d0" />
    </svg>
  );
}
