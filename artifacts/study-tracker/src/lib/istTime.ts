// Indian Standard Time (IST) = UTC+5:30 = +19800000 ms
// All functions here use IST regardless of the device's local timezone.

const IST_OFFSET_MS = 19800000; // 5.5 * 60 * 60 * 1000

/**
 * Returns a Date whose getUTC* methods reflect the current IST civil time.
 * e.g. if IST is 2026-05-28 10:30 PM, getUTCFullYear/Month/Date returns 2026/4/28
 */
export function nowIST(): Date {
  return new Date(Date.now() + IST_OFFSET_MS);
}

/**
 * Returns today's date string in IST as 'yyyy-MM-dd'.
 * Safe regardless of device timezone.
 */
export function todayIST(): string {
  return toDateStrIST(nowIST());
}

/**
 * Converts an IST-adjusted Date (from nowIST / addDaysIST) to 'yyyy-MM-dd'.
 */
export function toDateStrIST(istDate: Date): string {
  const y = istDate.getUTCFullYear();
  const m = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(istDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Adds `days` calendar days to an IST-adjusted Date.
 */
export function addDaysIST(istBase: Date, days: number): Date {
  return new Date(istBase.getTime() + days * 86400000);
}

/**
 * Display string for today in IST (e.g. "Wednesday, May 28").
 */
export function formatTodayDisplayIST(): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());
}

/**
 * Milliseconds from now until the next IST midnight (00:00:01 IST).
 * Used to schedule the auto-refresh at the correct IST day boundary.
 */
export function msUntilISTMidnight(): number {
  const ist = nowIST();
  // Next day at 00:00:01 IST = subtract IST offset from UTC representation
  const nextMidnightUTC = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate() + 1,
    0, 0, 1, 0,
  ) - IST_OFFSET_MS;
  return Math.max(1000, nextMidnightUTC - Date.now());
}
