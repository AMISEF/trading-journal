/**
 * Jalali (Persian) date helpers.
 *
 * Date math uses a pure, well-tested Jalali↔Gregorian algorithm (jalaali-js) so
 * month lengths are always exact — Farvardin–Shahrivar (1–6) = 31 days,
 * Mehr–Bahman (7–11) = 30, Esfand (12) = 29 (30 in a leap year). dayjs is used
 * only to read the Gregorian Y/M/D/time out of an ISO string.
 * Backend stores ISO (UTC); we display Jalali in the UI.
 */
import dayjs from "dayjs";

/** Persian month names (Jalali). */
export const JALALI_MONTHS = [
  "فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور",
  "مهر","آبان","آذر","دی","بهمن","اسفند",
];

/** Persian weekday names (Saturday-first is the Iranian week; getDay() is Sun=0). */
export const JALALI_WEEKDAYS = [
  "یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه","شنبه",
];

/** Convert Western digits to Persian digits. */
export function toPersianDigits(value: string | number): string {
  const p = ["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"];
  return String(value).replace(/\d/g, (d) => p[Number(d)]);
}

// ─── pure Jalali ↔ Gregorian (jalaali-js) ─────────────────────────────────────
// Truncation toward zero (jalaali-js semantics) — differs from Math.floor for
// negative operands, which is exactly where a floor-based version broke.
const div = (a: number, b: number) => Math.trunc(a / b);
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b;

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097,
    2192, 2262, 2324, 2394, 2456, 3178,
  ];
  const bl = breaks.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jm = 0, jump = 0, n = 0;
  for (let i = 1; i < bl; i += 1) {
    jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): { jy: number; jm: number; jd: number } {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  let jm: number, jd: number;
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

export function toJalali(gy: number, gm: number, gd: number): { jy: number; jm: number; jd: number } {
  return d2j(g2d(gy, gm, gd));
}
export function toGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  return d2g(j2d(jy, jm, jd));
}
/** Jalali leap year (Esfand has 30 days). */
export function isJalaliLeapYear(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

const pad = (n: number) => String(n).padStart(2, "0");

// ─── public API (unchanged signatures) ────────────────────────────────────────

/** Extract Jalali day/month/year parts from an ISO date string. */
export function getJalaliParts(isoDate: string): { day: number; month: number; year: number; monthName: string } | null {
  const d = dayjs(isoDate);
  if (!d.isValid()) return null;
  const { jy, jm, jd } = toJalali(d.year(), d.month() + 1, d.date());
  return { day: jd, month: jm, year: jy, monthName: JALALI_MONTHS[jm - 1] };
}

/** Format an ISO string as Jalali date, e.g. "۱۴۰۴/۰۴/۳۱". */
export function formatJalaliDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = dayjs(iso);
  if (!d.isValid()) return "—";
  const { jy, jm, jd } = toJalali(d.year(), d.month() + 1, d.date());
  return toPersianDigits(`${jy}/${pad(jm)}/${pad(jd)}`);
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

/** Persian weekday name for an ISO date (or Date). */
export function jalaliWeekday(input?: string | Date | null): string {
  const d = input ? dayjs(input) : dayjs();
  if (!d.isValid()) return "";
  return JALALI_WEEKDAYS[d.day()];
}

/** Extract Jalali parts from an ISO string. Falls back to today if invalid. */
export function isoToJalaliParts(iso?: string | null): {
  jy: number; jm: number; jd: number; time: string;
} {
  const base = iso && dayjs(iso).isValid() ? dayjs(iso) : dayjs();
  const { jy, jm, jd } = toJalali(base.year(), base.month() + 1, base.date());
  return { jy, jm, jd, time: base.format("HH:mm") };
}

/** Build an ISO string from Jalali parts + "HH:mm" time. */
export function jalaliToISO(jy: number, jm: number, jd: number, time: string): string {
  const [hh, mm] = time.split(":").map((n) => parseInt(n, 10) || 0);
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  const d = dayjs(`${gy}-${pad(gm)}-${pad(gd)} ${pad(hh)}:${pad(mm)}`);
  return d.isValid() ? d.toISOString() : new Date().toISOString();
}

/** Convert Jalali date to Gregorian ISO date string "YYYY-MM-DD" (noon-safe). */
export function jalaliToGregorianDate(jy: number, jm: number, jd: number): string {
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return `${gy}-${pad(gm)}-${pad(gd)}`;
}

/** Number of days in a Jalali month (exact rule). */
export function jalaliDaysInMonth(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeapYear(jy) ? 30 : 29;
}
