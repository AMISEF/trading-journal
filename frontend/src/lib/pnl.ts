/**
 * Helpers to aggregate a per-day PnL series into weekly / monthly buckets.
 * Shared by the user dashboard and the admin per-user dashboard view.
 *
 * The Persian (Jalali) week starts on Saturday, so weekly buckets are
 * anchored to the most recent Saturday.
 */
import { getJalaliParts, toPersianDigits } from "./jalali";

export const GREGORIAN_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface PnlByDay {
  date: string;
  pnl: number;
}

export interface PnlPeriodRow {
  key: string;
  /** Gregorian / latin sub-label. */
  label: string;
  /** Persian (Jalali) headline label. */
  jalaliLabel: string;
  pnl: number;
}

export const JALALI_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

/** Group the daily series by Jalali calendar month. */
export function buildMonthlyData(pnlByDay: PnlByDay[]): PnlPeriodRow[] {
  const byMonth = new Map<string, { pnl: number; jalaliYear: number; jalaliMonth: number }>();
  pnlByDay.forEach(({ date, pnl }) => {
    const jp = getJalaliParts(date.slice(0, 10));
    if (!jp) return;
    const key = `${jp.year}-${String(jp.month).padStart(2, "0")}`;
    const existing = byMonth.get(key) ?? { pnl: 0, jalaliYear: jp.year, jalaliMonth: jp.month };
    byMonth.set(key, { pnl: existing.pnl + pnl, jalaliYear: jp.year, jalaliMonth: jp.month });
  });
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { pnl, jalaliYear, jalaliMonth }]) => ({
      key,
      label: `${JALALI_MONTHS[jalaliMonth - 1]} ${jalaliYear}`,
      jalaliLabel: `${JALALI_MONTHS[jalaliMonth - 1]} ${toPersianDigits(jalaliYear)}`,
      pnl,
    }));
}

/** Group the daily series into Saturday-anchored weeks. */
export function buildWeeklyData(pnlByDay: PnlByDay[]): PnlPeriodRow[] {
  const byWeek = new Map<string, number>();
  pnlByDay.forEach(({ date, pnl }) => {
    const d = new Date(`${date.slice(0, 10)}T00:00:00`);
    const dow = d.getDay(); // 0=Sun … 6=Sat
    const offset = (dow + 1) % 7; // days since last Saturday
    const start = new Date(d);
    start.setDate(d.getDate() - offset);
    const key = start.toISOString().slice(0, 10);
    byWeek.set(key, (byWeek.get(key) ?? 0) + pnl);
  });
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, pnl]) => {
      const start = new Date(`${key}T00:00:00`);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const endStr = end.toISOString().slice(0, 10);
      const js = getJalaliParts(key);
      const je = getJalaliParts(endStr);
      const jalaliLabel =
        js && je
          ? `${toPersianDigits(js.day)} ${js.monthName} – ${toPersianDigits(je.day)} ${je.monthName}`
          : `${key} → ${endStr}`;
      return {
        key,
        label: `${key} → ${endStr}`,
        jalaliLabel,
        pnl,
      };
    });
}

/** Build a most-recent-first daily list (for compact breakdown tables). */
export function buildDailyData(pnlByDay: PnlByDay[]): PnlPeriodRow[] {
  return [...pnlByDay]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(({ date, pnl }) => {
      const day = date.slice(0, 10);
      const jp = getJalaliParts(day);
      return {
        key: day,
        label: day,
        jalaliLabel: jp
          ? `${toPersianDigits(jp.day)} ${jp.monthName} ${toPersianDigits(jp.year)}`
          : day,
        pnl,
      };
    });
}
