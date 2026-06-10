/**
 * Number / currency formatting helpers.
 * The app's color language: green = profit, red = loss, blue = neutral.
 */
import { toPersianDigits } from "./jalali";

/** Format a USD amount, e.g. "$1,234.50". Returns "—" for null/undefined. */
export function formatUsd(value?: number | null, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const fixed = value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `$${fixed}`;
}

/** Format a USD amount with an explicit +/- sign (for P&L). */
export function formatSignedUsd(value?: number | null, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatUsd(value, digits)}`;
}

/** Format a percentage, e.g. "+12.34%". */
export function formatPct(value?: number | null, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

/** Format a ratio like R:R, e.g. "2.50". */
export function formatRatio(value?: number | null, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

/** Convert a $ amount to Toman using the USDT/IRT rate and format with Persian digits. */
export function formatToman(usd?: number | null, usdtIrt?: number | null): string {
  if (
    usd === null ||
    usd === undefined ||
    Number.isNaN(usd) ||
    !usdtIrt ||
    Number.isNaN(usdtIrt)
  ) {
    return "—";
  }
  const toman = Math.round(usd * usdtIrt);
  return `${toPersianDigits(toman.toLocaleString("en-US"))} تومان`;
}

/** Tailwind text-color class based on sign (profit/loss/neutral). */
export function pnlColorClass(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value) || value === 0)
    return "text-muted";
  return value > 0 ? "text-profit" : "text-loss";
}

/** Round a price to the nearest tick size (keeps decimals consistent). */
export function roundToTick(price: number, tickSize: number): number {
  if (!tickSize || tickSize <= 0) return price;
  const decimals = Math.max(0, Math.round(-Math.log10(tickSize)));
  const snapped = Math.round(price / tickSize) * tickSize;
  return Number(snapped.toFixed(decimals));
}

/** Number of decimal places implied by a tick size (e.g. 0.01 -> 2). */
export function decimalsForTick(tickSize?: number | null): number {
  if (!tickSize || tickSize <= 0) return 2;
  return Math.max(0, Math.round(-Math.log10(tickSize)));
}

/** Persian-digit integer formatting. */
export function faNum(value: number | string): string {
  return toPersianDigits(value);
}
