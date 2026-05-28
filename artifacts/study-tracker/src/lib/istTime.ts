// All time functions use the device's local timezone automatically.
// No hardcoded timezone — works correctly whether accessed from India,
// Bangladesh, or any other country.

/**
 * Returns the current local Date.
 */
export function nowIST(): Date {
  return new Date();
}

/**
 * Returns today's date string as 'yyyy-MM-dd' in the device's local timezone.
 */
export function todayIST(): string {
  return toDateStrIST(new Date());
}

/**
 * Converts a Date to 'yyyy-MM-dd' using the device's local timezone.
 */
export function toDateStrIST(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Adds `days` calendar days to a Date (DST-safe via setDate).
 */
export function addDaysIST(base: Date, days: number): Date {
  const result = new Date(base);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Display string for today in the device's local timezone (e.g. "Wednesday, May 28").
 */
export function formatTodayDisplayIST(): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

/**
 * Milliseconds from now until the next local midnight (00:00:01 local time).
 * Used to schedule the auto-refresh at the correct local day boundary.
 */
export function msUntilISTMidnight(): number {
  const now = new Date();
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0, 0, 1, 0,
  );
  return Math.max(1000, nextMidnight.getTime() - now.getTime());
}
