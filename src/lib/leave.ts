/** Sends the browser to another site. In its own file so tests can stand in for it. */
export function leaveTo(address: string): void {
  window.location.assign(address);
}
