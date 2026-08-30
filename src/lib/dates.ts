/**
 * Dates are plain "YYYY-MM-DD" strings and months are "YYYY-MM" keys.
 *
 * Nothing here goes through the Date constructor's local-time parsing, so a
 * user in Dhaka (UTC+6) and a judge in another zone see the same month
 * boundaries for the same data.
 */

export type ISODate = string; // YYYY-MM-DD
export type MonthKey = string; // YYYY-MM

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function parseISO(d: ISODate): { y: number; m: number; day: number } {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day };
}

export function monthKeyOf(d: ISODate): MonthKey {
  return d.slice(0, 7);
}

export function dayOfMonth(d: ISODate): number {
  return parseISO(d).day;
}

export function daysInMonthKey(mk: MonthKey): number {
  const [y, m] = mk.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(mk: MonthKey, n: number): MonthKey {
  const [y, m] = mk.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}`;
}

export function monthsBetween(a: MonthKey, b: MonthKey): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return by * 12 + bm - (ay * 12 + am);
}

export function lastDayOf(mk: MonthKey): ISODate {
  return `${mk}-${String(daysInMonthKey(mk)).padStart(2, "0")}`;
}

export function monthLabel(mk: MonthKey, style: "long" | "short" = "long"): string {
  const [y, m] = mk.split("-").map(Number);
  const name = style === "long" ? MONTH_NAMES[m - 1] : MONTH_SHORT[m - 1];
  return `${name} ${y}`;
}

/** "April" — no year, for sentences that already establish the year. */
export function monthName(mk: MonthKey, style: "long" | "short" = "long"): string {
  const m = Number(mk.split("-")[1]);
  return style === "long" ? MONTH_NAMES[m - 1] : MONTH_SHORT[m - 1];
}

export function formatDate(d: ISODate, style: "long" | "short" = "short"): string {
  const { y, m, day } = parseISO(d);
  return style === "long"
    ? `${day} ${MONTH_NAMES[m - 1]} ${y}`
    : `${day} ${MONTH_SHORT[m - 1]}`;
}

/** Today in the user's own calendar, as a plain date string. */
export function realToday(): ISODate {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

export function clampDayToMonth(mk: MonthKey, day: number): ISODate {
  const d = Math.min(Math.max(day, 1), daysInMonthKey(mk));
  return `${mk}-${String(d).padStart(2, "0")}`;
}
