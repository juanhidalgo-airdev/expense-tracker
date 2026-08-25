/**
 * Dates.
 *
 * Two different concepts, deliberately stored differently:
 *
 *   - WHEN IT HAPPENED  — `expenseDate`, a calendar date as YYYY-MM-DD.
 *     A calendar date has no timezone. Storing it as an instant makes a Tokyo
 *     dinner appear on the previous day for a London approver.
 *   - WHEN IT WAS RECORDED — epoch milliseconds, UTC, formatted in the
 *     viewer's locale.
 */

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE.test(value)) {
    return false;
  }
  // Rejects 2026-02-31: round-tripping through Date normalises impossible
  // days, so a mismatch means the input was not a real date.
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Today in the viewer's local timezone, as YYYY-MM-DD. */
export function todayCalendarDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * An expense cannot be incurred in the future.
 *
 * Compared as strings against the viewer's own "today": YYYY-MM-DD sorts
 * lexicographically, and comparing calendar dates as dates would drag a
 * timezone back into a decision that has none.
 */
export function isFutureCalendarDate(value: string, now: Date = new Date()): boolean {
  return value > todayCalendarDate(now);
}

/** Formats a calendar date for display without letting it shift a day. */
export function formatCalendarDate(value: string, locale?: string): string {
  if (!isCalendarDate(value)) {
    return value;
  }
  const [year, month, day] = value.split("-").map(Number);
  // Formatted in UTC, matching how it was constructed, so the rendered day
  // always equals the stored day regardless of where the viewer is.
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** Formats an epoch-ms timestamp — a real instant — in the viewer's zone. */
export function formatTimestamp(ms: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}
