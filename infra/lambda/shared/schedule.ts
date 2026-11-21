// Pure date arithmetic for recurring items. Dates are "YYYY-MM-DD" strings
// handled in UTC so no timezone or DST shift can move an occurrence by a
// day; "today" in the user's timezone is computed by the caller.

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface Schedule {
  frequency: Frequency;
  interval: number;
  /** 0 = Sunday … 6 = Saturday. WEEKLY only. */
  weekday?: number | null;
  /** 1–31, clamped to the month's length. MONTHLY only. */
  dayOfMonth?: number | null;
  startDate: string;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isValidDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toDay(value: string): number {
  return Math.floor(Date.parse(`${value}T00:00:00Z`) / DAY_MS);
}

function fromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  return fromDay(toDay(value) + days);
}

export function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

export function validateSchedule(s: Schedule): void {
  if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(s.frequency)) throw new Error('Invalid frequency.');
  if (!Number.isInteger(s.interval) || s.interval < 1 || s.interval > 52) {
    throw new Error('Interval must be a whole number between 1 and 52.');
  }
  if (!isValidDate(s.startDate)) throw new Error('Start date must be YYYY-MM-DD.');
  if (s.frequency === 'WEEKLY') {
    if (!Number.isInteger(s.weekday) || s.weekday! < 0 || s.weekday! > 6) {
      throw new Error('Weekly schedules need a weekday (0–6).');
    }
  }
  if (s.frequency === 'MONTHLY') {
    if (!Number.isInteger(s.dayOfMonth) || s.dayOfMonth! < 1 || s.dayOfMonth! > 31) {
      throw new Error('Monthly schedules need a day of month (1–31).');
    }
  }
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/**
 * The first occurrence of the schedule on or after `onOrAfter` (and never
 * before `startDate`). Occurrences are anchored on `startDate`, so
 * "every 2 weeks" keeps its rhythm no matter when it is evaluated.
 */
export function nextOccurrence(s: Schedule, onOrAfter: string): string {
  const from = maxDate(onOrAfter, s.startDate);
  const n = s.interval;

  if (s.frequency === 'DAILY') {
    const start = toDay(s.startDate);
    const steps = Math.ceil((toDay(from) - start) / n);
    return fromDay(start + steps * n);
  }

  if (s.frequency === 'WEEKLY') {
    const startDay = toDay(s.startDate);
    const startWeekday = new Date(startDay * DAY_MS).getUTCDay();
    // First `weekday` on or after startDate is the anchor.
    const anchor = startDay + ((s.weekday! - startWeekday + 7) % 7);
    const period = 7 * n;
    const fromDayNum = toDay(from);
    if (fromDayNum <= anchor) return fromDay(anchor);
    return fromDay(anchor + Math.ceil((fromDayNum - anchor) / period) * period);
  }

  // MONTHLY: month index counted from startDate's month, every n months.
  const [sy, sm] = s.startDate.split('-').map(Number);
  const startIndex = sy * 12 + (sm - 1);
  const occurrence = (k: number): string => {
    const idx = startIndex + k * n;
    const year = Math.floor(idx / 12);
    const month0 = idx % 12;
    const day = Math.min(s.dayOfMonth!, daysInMonth(year, month0));
    return `${String(year).padStart(4, '0')}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  const [fy, fm] = from.split('-').map(Number);
  let k = Math.max(0, Math.floor((fy * 12 + (fm - 1) - startIndex) / n) - 1);
  // The estimate is at most a step or two early; walk forward to the real one.
  for (;;) {
    const candidate = occurrence(k);
    if (candidate >= from && candidate >= s.startDate) return candidate;
    k++;
  }
}

/** Today's date (YYYY-MM-DD) in an IANA timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
