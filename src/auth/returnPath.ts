/** Where to return after signing in; only paths inside this site are accepted. */
export function returnPath(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !from.includes('\\')
    ? from
    : '/';
}
