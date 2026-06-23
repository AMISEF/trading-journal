/**
 * Jalali (Persian) date helpers.
 * - Reading/formatting: dayjs + jalaliday (.calendar("jalali") on instances).
 * - Creating Jalali dates: dayjs(str, { jalali: true }) — the correct jalaliday API.
 * Backend stores ISO (UTC); we display Jalali in the UI.
 */
import dayjs from "dayjs";
import jalaliday from "jalaliday";

dayjs.extend(jalaliday);

/** Persian month names (Jalali). */
export const JALALI_MONTHS = [
  "فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور",
  "مهر","آبان","آذر","دی","بهمن","اسفند",
];

/** Convert Western digits to Persian digits. */
export function toPersianDigits(value: string | number): string {
  const p = ["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"];
  return String(value).replace(/\d/g, (d) => p[Number(d)]);
}

/** Extract Jalali day/month/year parts from an ISO date string. */
export function getJalaliParts(isoDate: string): { day: number; month: number; year: number; monthName: string } | null {
  try {
    const d = dayjs(isoDate);
    if (!d.isValid()) return null;
    const j = (d as any).calendar("jalali");
    const m = j.month(); // 0-indexed
    return { day: j.date(), month: m + 1, year: j.year(), monthName: JALALI_MONTHS[m] };
  } catch { return null; }
}

/** Format an ISO string as Jalali date, e.g. "۱۴۰۳/۰۵/۱۲". */
export function formatJalaliDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = dayjs(iso);
  if (!d.isValid()) return "—";
  return toPersianDigits((d as any).calendar("jalali").format("YYYY/MM/DD"));
}

/** Format ISO as time only, e.g. "۱۴:۳۰". */
export function formatTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = dayjs(iso);
  if (!d.isValid()) return "—";
  return toPersianDigits(d.format("HH:mm"));
}

/** Full Jalali date + time. */
export function formatJalaliDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return `${formatJalaliDate(iso)} ${formatTime(iso)}`;
}

/** Extract Jalali parts from an ISO string. Falls back to today if invalid. */
export function isoToJalaliParts(iso?: string | null): {
  jy: number; jm: number; jd: number; time: string;
} {
  const base = iso && dayjs(iso).isValid() ? dayjs(iso) : dayjs();
  const j = (base as any).calendar("jalali");
  return {
    jy: j.year(),
    jm: j.month() + 1,
    jd: j.date(),
    time: base.format("HH:mm"),
  };
}

/** Build an ISO string from Jalali parts + "HH:mm" time. */
export function jalaliToISO(jy: number, jm: number, jd: number, time: string): string {
  try {
    const [hh, mm] = time.split(":").map((n) => parseInt(n, 10) || 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${jy}-${pad(jm)}-${pad(jd)} ${pad(hh)}:${pad(mm)}`;
    // jalaliday: pass { jalali: true } to parse as Jalali calendar
    const d = dayjs(dateStr, { jalali: true } as any);
    if (d.isValid()) return d.toISOString();
    // fallback: try manual Jalali→Gregorian conversion
    const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd);
    return dayjs(`${gy}-${pad(gm)}-${pad(gd)} ${pad(hh)}:${pad(mm)}`).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/** Convert Jalali date to Gregorian ISO date string "YYYY-MM-DD". */
export function jalaliToGregorianDate(jy: number, jm: number, jd: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  try {
    // Use noon to avoid any UTC-offset date shift
    const d = dayjs(`${jy}-${pad(jm)}-${pad(jd)} 12:00`, { jalali: true } as any);
    if (d.isValid()) return d.format("YYYY-MM-DD");
  } catch {}
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd);
  return `${gy}-${pad(gm)}-${pad(gd)}`;
}

/** Number of days in a Jalali month. */
export function jalaliDaysInMonth(jy: number, jm: number): number {
  try {
    const pad = (n: number) => String(n).padStart(2, "0");
    const d = dayjs(`${jy}-${pad(jm)}-01`, { jalali: true } as any);
    if (d.isValid()) return d.daysInMonth();
  } catch {}
  // Fallback: Jalali months 1-6 have 31 days, 7-11 have 30, 12 has 29 (or 30 in leap)
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeapYear(jy) ? 30 : 29;
}

/** Check Jalali leap year. */
function isJalaliLeapYear(jy: number): boolean {
  const breaks = [1,5,9,13,17,22,26,30];
  const bl = breaks.length;
  jy -= 979;
  const jp = Math.floor(jy / 2820);
  jy = jy % 2820;
  let jump = 0;
  for (let i = 0; i < bl - 1; i++) {
    jump += breaks[i];
    if (jy < jump) { break; }
  }
  return (jy * 8 + 29) % 33 < 8;
}

/** Pure Jalali → Gregorian conversion (no dayjs dependency). */
function jalaliToGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  jy += 1595;
  const days =
    -355779 +
    365 * jy +
    Math.floor(jy / 33) * 8 +
    Math.floor(((jy % 33) + 3) / 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  let rem = days % 146097;
  if (rem > 36524) {
    gy += 100 * Math.floor(--rem / 36524);
    rem %= 36524;
    if (rem >= 365) rem++;
  }
  gy += 4 * Math.floor(rem / 1461);
  rem %= 1461;
  if (rem > 364) {
    gy += Math.floor((rem - 1) / 365);
    rem = (rem - 1) % 365;
  }
  const mdays = [29, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0, gd = rem + 1;
  for (let i = 0; i < 12; i++) {
    const leap = i === 1 && (gy % 4 === 0 && (gy % 100 !== 0 || gy % 400 === 0)) ? 1 : 0;
    const dim = mdays[i] + leap;
    if (gd <= dim) { gm = i + 1; break; }
    gd -= dim;
  }
  return { gy, gm, gd };
}
