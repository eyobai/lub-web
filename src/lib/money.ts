/**
 * Formats an amount the API already converted to major units ("65000.00") for display: "ETB 65,000".
 * Works on the digits themselves, so large amounts keep full precision.
 */
export function formatMoney(major: string, currency: string): string {
  const [whole, fraction = ''] = major.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency} ${/^0*$/.test(fraction) ? grouped : `${grouped}.${fraction}`}`;
}

/**
 * What a person typed ("4", "4.5") as an integer count of minor units, or null if it is not a plain amount
 * with at most `minorUnits` decimals. Done on the digits: money never goes through floating point.
 */
export function toMinor(input: string, minorUnits: number): bigint | null {
  const match = /^(\d{1,15})(?:\.(\d*))?$/.exec(input.trim());
  if (!match) return null;
  const fraction = match[2] ?? '';
  if (fraction.length > minorUnits) return null;
  return BigInt(match[1] + fraction.padEnd(minorUnits, '0'));
}

/** Minor units as a major-unit string: (450, 2) -> "4.50". */
export function fromMinor(minor: bigint | string, minorUnits: number): string {
  const value = BigInt(minor);
  const digits = (value < 0n ? -value : value).toString().padStart(minorUnits + 1, '0');
  const whole = digits.slice(0, digits.length - minorUnits);
  return `${value < 0n ? '-' : ''}${whole}${minorUnits > 0 ? `.${digits.slice(-minorUnits)}` : ''}`;
}

export function formatMinor(minor: bigint | string, currency: string, minorUnits: number): string {
  return formatMoney(fromMinor(minor, minorUnits), currency);
}
