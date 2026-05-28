// All time functions accept an optional `tz` IANA timezone string.
// When `tz` is provided (e.g. 'Asia/Kolkata'), dates and times are
// interpreted in that timezone. When omitted, the device's local timezone is used.

/** Extract date/time parts in a given timezone (or local if tz is undefined). */
function tzParts(date: Date, tz?: string) {
  if (!tz) {
    return {
      y: date.getFullYear(),
      mo: date.getMonth() + 1,
      d: date.getDate(),
      h: date.getHours(),
      mi: date.getMinutes(),
      s: date.getSeconds(),
    };
  }
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const p: Record<string, number> = {};
  for (const { type, value } of fmt.formatToParts(date)) {
    p[type] = parseInt(value, 10);
  }
  return { y: p.year, mo: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
}

/**
 * Returns a Date whose local getFullYear/Month/Date/Hours/Minutes/Seconds
 * reflect the current wall-clock time in `tz` (or device local if omitted).
 * Use this for date arithmetic — do NOT use .getTime() for UTC comparisons.
 */
export function nowIST(tz?: string): Date {
  const { y, mo, d, h, mi, s } = tzParts(new Date(), tz);
  return new Date(y, mo - 1, d, h, mi, s);
}

/**
 * Returns today's date string 'yyyy-MM-dd' in `tz` (or device local).
 */
export function todayIST(tz?: string): string {
  const { y, mo, d } = tzParts(new Date(), tz);
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Converts a Date to 'yyyy-MM-dd' using local getFullYear/Month/Date.
 * Pass dates from nowIST(tz) so they already carry the correct wall-clock values.
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
 * Display string for today (e.g. "Wednesday, May 28") in `tz` (or device local).
 */
export function formatTodayDisplayIST(tz?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(tz ? { timeZone: tz } : {}),
  }).format(new Date());
}

/**
 * Milliseconds until the next midnight (00:00:01) in `tz` (or device local).
 * Uses wall-clock arithmetic so it works correctly for any timezone.
 */
export function msUntilISTMidnight(tz?: string): number {
  const { y, mo, d, h, mi, s } = tzParts(new Date(), tz);
  const fakeNow      = new Date(y, mo - 1, d,     h,  mi, s, 0);
  const fakeMidnight = new Date(y, mo - 1, d + 1, 0,  0,  1, 0);
  return Math.max(1000, fakeMidnight.getTime() - fakeNow.getTime());
}
