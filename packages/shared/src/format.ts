/** Money is always integer cents. Display whole dollars unless cents are non-zero. */
export function formatPrice(cents: number, currency = 'USD'): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

/** Percentage off, rounded down so we never overstate a discount. Null when there is no saving. */
export function percentOff(priceCents: number, referenceCents: number): number | null {
  if (referenceCents <= 0 || priceCents >= referenceCents) return null;
  return Math.floor(((referenceCents - priceCents) / referenceCents) * 100);
}

export function formatPercentOff(pct: number): string {
  return `−${pct}%`;
}

const METERS_PER_MILE = 1609.344;

/**
 * Listing distances come from approximate (~1 km) public points (D2), so they are always
 * shown as approximate and rounded: 0.5 mi steps under 5 mi, whole miles above.
 */
export function formatApproxDistance(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles < 1) return '< 1 mi';
  const rounded = miles < 5 ? Math.round(miles * 2) / 2 : Math.round(miles);
  return `~${rounded} mi`;
}

/** "just now", "4m ago", "2h ago", "3d ago" — for "Checked …" and "verified …" labels. */
export function formatAgo(from: Date | string, now: Date = new Date()): string {
  const s = Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** "Ends in 3h", "Ends in 2 days", "Ends today" for promo expiry. */
export function formatEndsIn(at: Date | string, now: Date = new Date()): string {
  const h = (new Date(at).getTime() - now.getTime()) / 3_600_000;
  if (h <= 0) return 'Ended';
  if (h < 1) return 'Ends within the hour';
  if (h < 24) return `Ends in ${Math.floor(h)}h`;
  const d = Math.floor(h / 24);
  return `Ends in ${d} ${d === 1 ? 'day' : 'days'}`;
}
