/**
 * Formats an amount the API already converted to major units ("65000.00") for display: "ETB 65,000".
 * Works on the digits themselves, so large amounts keep full precision.
 */
export function formatMoney(major: string, currency: string): string {
  const [whole, fraction = ''] = major.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency} ${/^0*$/.test(fraction) ? grouped : `${grouped}.${fraction}`}`;
}
