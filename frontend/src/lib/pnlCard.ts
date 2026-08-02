/**
 * «ساخت تصویر برایند» — رندرِ کارتِ برایند روی Canvas 2D.
 *
 * هیچ وابستگیِ بیرونی ندارد؛ همه‌چیز دستی کشیده می‌شود تا خروجی در هر ابعادی
 * تیز (2x)، سبک و کاملاً یکدست باشد. اندازهٔ باکس‌های معیار در همهٔ ابعاد ثابت
 * است و فقط تعدادِ ستون‌های شبکه تغییر می‌کند.
 */
import type { DashboardData } from "./types";
import { getJalaliParts, toPersianDigits } from "./jalali";
import type { Theme } from "./theme";

/* ─── ابعادِ خروجی ────────────────────────────────────────────── */

export type CardAspect = "16x9" | "9x16" | "3x4" | "4x3" | "1x1";

export interface AspectDef {
  id: CardAspect;
  label: string;
  hint: string;
  w: number;
  h: number;
}

export const CARD_ASPECTS: AspectDef[] = [
  { id: "16x9", label: "۱۶:۹ افقی", hint: "یوتیوب / توییتر", w: 1920, h: 1080 },
  { id: "9x16", label: "۱۶:۹ عمودی", hint: "استوری و ریلز", w: 1080, h: 1920 },
  { id: "3x4", label: "۳:۴ عمودی", hint: "پست اینستاگرام", w: 1080, h: 1440 },
  { id: "4x3", label: "۳:۴ افقی", hint: "بنر افقی", w: 1600, h: 1200 },
  { id: "1x1", label: "۱:۱ مربع", hint: "پست مربع", w: 1400, h: 1400 },
];

export const aspectDef = (id: CardAspect): AspectDef =>
  CARD_ASPECTS.find((a) => a.id === id) ?? CARD_ASPECTS[0];

/* ─── بازهٔ برایند ────────────────────────────────────────────── */

export type CardPeriod = "daily" | "weekly" | "monthly" | "all";

export const CARD_PERIODS: { id: CardPeriod; label: string; title: string }[] = [
  { id: "daily", label: "روزانه", title: "بازدهی روزانه" },
  { id: "weekly", label: "هفتگی", title: "بازدهی هفتگی" },
  { id: "monthly", label: "ماهانه", title: "بازدهی ماهانه" },
  { id: "all", label: "کل دوره", title: "بازدهی کل دوره" },
];

/* ─── پالتِ تم‌ها (هم‌نام با تم‌های سایت) ─────────────────────── */

export interface CardPalette {
  id: Theme;
  label: string;
  bg: [string, string, string];
  panel: string;
  panelTop: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  profit: string;
  loss: string;
  grid: string;
  onAccent: string;
  isDark: boolean;
}

export const CARD_PALETTES: Record<Theme, CardPalette> = {
  classic: {
    id: "classic", label: "کلاسیک", bg: ["#04101D", "#0A1622", "#102941"],
    panel: "rgba(255,255,255,0.035)", panelTop: "rgba(255,255,255,0.085)",
    border: "rgba(125,211,252,0.20)", text: "#EAF4FF", muted: "#8FA6BF",
    accent: "#38BDF8", accent2: "#A78BFA", profit: "#34D399", loss: "#F87171",
    grid: "rgba(148,197,255,0.07)", onAccent: "#04121F", isDark: true,
  },
  ocean: {
    id: "ocean", label: "دارک اوشن", bg: ["#0B1D38", "#162F55", "#214E8A"],
    panel: "rgba(255,255,255,0.05)", panelTop: "rgba(255,255,255,0.10)",
    border: "rgba(111,149,200,0.30)", text: "#F3F6F9", muted: "#A9BDD8",
    accent: "#6F95C8", accent2: "#19C3B3", profit: "#4ED9CC", loss: "#FB7185",
    grid: "rgba(191,199,206,0.08)", onAccent: "#0B1D38", isDark: true,
  },
  dark: {
    id: "dark", label: "دارک", bg: ["#191E22", "#2B3136", "#3A444C"],
    panel: "rgba(255,255,255,0.045)", panelTop: "rgba(255,255,255,0.09)",
    border: "rgba(220,226,231,0.16)", text: "#F3F6F9", muted: "#AEB8C1",
    accent: "#19C3B3", accent2: "#A6F0E8", profit: "#34D399", loss: "#F87171",
    grid: "rgba(220,226,231,0.07)", onAccent: "#12181C", isDark: true,
  },
  light: {
    id: "light", label: "روشن", bg: ["#FFFFFF", "#F3F6F9", "#DCE6F2"],
    panel: "rgba(22,47,85,0.045)", panelTop: "rgba(255,255,255,0.85)",
    border: "rgba(22,47,85,0.14)", text: "#16233A", muted: "#5A6B80",
    accent: "#2D63B0", accent2: "#128F84", profit: "#0F9D6B", loss: "#DC2F3F",
    grid: "rgba(22,47,85,0.07)", onAccent: "#FFFFFF", isDark: false,
  },
  soft: {
    id: "soft", label: "روشن ملایم", bg: ["#E7ECF1", "#BFC7CE", "#9FAAB5"],
    panel: "rgba(255,255,255,0.45)", panelTop: "rgba(255,255,255,0.78)",
    border: "rgba(43,49,54,0.16)", text: "#1F262B", muted: "#525C66",
    accent: "#214E8A", accent2: "#128F84", profit: "#0F9D6B", loss: "#D02F3F",
    grid: "rgba(43,49,54,0.08)", onAccent: "#FFFFFF", isDark: false,
  },
  barbie: {
    id: "barbie", label: "باربی گرل", bg: ["#FFF0F7", "#FFC2DF", "#FF8FC4"],
    panel: "rgba(255,255,255,0.48)", panelTop: "rgba(255,255,255,0.82)",
    border: "rgba(228,50,127,0.26)", text: "#5C0F36", muted: "#9C4370",
    accent: "#E4327F", accent2: "#FF6FB0", profit: "#12A37A", loss: "#D81B60",
    grid: "rgba(228,50,127,0.10)", onAccent: "#FFFFFF", isDark: false,
  },
  cinderella: {
    id: "cinderella", label: "سیندرلا", bg: ["#F4EEFF", "#D6C6FF", "#B18CFF"],
    panel: "rgba(255,255,255,0.46)", panelTop: "rgba(255,255,255,0.82)",
    border: "rgba(124,58,237,0.24)", text: "#2E1065", muted: "#6B4CA8",
    accent: "#7C3AED", accent2: "#A78BFA", profit: "#0E9F6E", loss: "#E11D48",
    grid: "rgba(124,58,237,0.10)", onAccent: "#FFFFFF", isDark: false,
  },
};

export const CARD_THEMES: CardPalette[] = [
  CARD_PALETTES.classic,
  CARD_PALETTES.ocean,
  CARD_PALETTES.dark,
  CARD_PALETTES.light,
  CARD_PALETTES.soft,
  CARD_PALETTES.barbie,
  CARD_PALETTES.cinderella,
];

/* ─── آمارِ کارت ─────────────────────────────────────────────── */

export interface CardStats {
  pnlUsd: number;
  pnlPct: number;
  balance: number;
  winRate: number | null;
  avgRr: number;
  profitFactor: number;
  ddUsd: number;
  ddPct: number;
  win: number;
  loss: number;
  be: number;
  avgWin: number | null;
  avgLoss: number | null;
  long: number;
  short: number;
  longWr: number | null;
  shortWr: number | null;
  trades: number;
  closed: number;
  equity: number[];
  periodTitle: string;
  periodLabel: string;
}

const dayKey = (s: string) => s.slice(0, 10);

/** جمعِ سود/زیانِ n روزِ آخر (بر پایهٔ آخرین روزِ دارای معامله). */
function sumLastDays(days: { date: string; pnl: number }[], n: number): number {
  if (!days.length) return 0;
  const last = dayKey(days[days.length - 1].date);
  const end = new Date(`${last}T00:00:00`);
  const start = new Date(end);
  start.setDate(end.getDate() - (n - 1));
  const from = start.toISOString().slice(0, 10);
  return days.reduce((a, d) => (dayKey(d.date) >= from ? a + d.pnl : a), 0);
}

export function buildStats(data: DashboardData, period: CardPeriod): CardStats {
  const days = [...(data.pnlByDay ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const total = days.reduce((a, d) => a + d.pnl, 0);
  const pnlUsd =
    period === "daily" ? sumLastDays(days, 1)
      : period === "weekly" ? sumLastDays(days, 7)
      : period === "monthly" ? sumLastDays(days, 30)
      : total;
  const balance = data.currentBalance ?? 0;
  const base = balance - pnlUsd;
  const pnlPct = base > 0 ? (pnlUsd / base) * 100 : 0;
  const meta = CARD_PERIODS.find((p) => p.id === period) ?? CARD_PERIODS[3];
  const wl = data.winLoss ?? { win: 0, loss: 0, breakeven: 0, avgWin: null, avgLoss: null };
  const ds = data.directionStats ?? { long: 0, short: 0 };
  return {
    pnlUsd,
    pnlPct,
    balance,
    winRate: data.winRate,
    avgRr: data.avgRr ?? 0,
    profitFactor: data.profitFactor ?? 0,
    ddUsd: data.maxDrawdown?.amount ?? 0,
    ddPct: data.maxDrawdown?.percent ?? 0,
    win: wl.win ?? 0,
    loss: wl.loss ?? 0,
    be: wl.breakeven ?? 0,
    avgWin: wl.avgWin ?? null,
    avgLoss: wl.avgLoss ?? null,
    long: ds.long ?? 0,
    short: ds.short ?? 0,
    longWr: ds.longWinRate ?? null,
    shortWr: ds.shortWinRate ?? null,
    trades: data.tradeCount ?? 0,
    closed: data.closedCount ?? 0,
    equity: (data.equityCurve ?? []).map((p) => p.balance),
    periodTitle: meta.title,
    periodLabel: meta.label,
  };
}

/* ─── ابزارهای رسم ───────────────────────────────────────────── */

type Ctx = CanvasRenderingContext2D;

const FONT = '"Vazirmatn","IRANSansX","IRANSans","Segoe UI",system-ui,sans-serif';
const font = (size: number, weight = 700) => `${weight} ${size}px ${FONT}`;

const PAD = 48;
const TILE_W = 300;
const TILE_H = 176;
const GAP = 22;

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

interface TextOpts {
  size?: number;
  weight?: number;
  color?: string;
  align?: CanvasTextAlign;
  ltr?: boolean;
  alpha?: number;
}

function text(ctx: Ctx, s: string, x: number, y: number, o: TextOpts = {}) {
  ctx.save();
  ctx.font = font(o.size ?? 22, o.weight ?? 700);
  ctx.fillStyle = o.color ?? "#fff";
  ctx.textAlign = o.align ?? "right";
  ctx.textBaseline = "alphabetic";
  ctx.direction = o.ltr ? "ltr" : "rtl";
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  ctx.fillText(s, x, y);
  ctx.restore();
}

function panel(ctx: Ctx, p: CardPalette, x: number, y: number, w: number, h: number, accent?: string) {
  ctx.save();
  const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
  g.addColorStop(0, p.panelTop);
  g.addColorStop(1, p.panel);
  rr(ctx, x, y, w, h, 28);
  ctx.fillStyle = g;
  ctx.shadowColor = p.isDark ? "rgba(0,0,0,0.35)" : "rgba(22,47,85,0.14)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 10;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 2;
  ctx.strokeStyle = accent ? hexA(accent, 0.34) : p.border;
  ctx.stroke();
  ctx.restore();
}

function chip(ctx: Ctx, p: CardPalette, label: string, value: string, x: number, y: number, color: string): number {
  ctx.save();
  ctx.font = font(23, 800);
  const vw = ctx.measureText(value).width;
  ctx.font = font(21, 700);
  const lw = ctx.measureText(label).width;
  const w = vw + lw + 46;
  const h = 50;
  rr(ctx, x - w, y, w, h, 16);
  ctx.fillStyle = hexA(color, 0.14);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = hexA(color, 0.3);
  ctx.stroke();
  ctx.restore();
  text(ctx, label, x - 16, y + 33, { size: 21, color: p.muted });
  text(ctx, value, x - lw - 26, y + 33, { size: 23, weight: 800, color, align: "right", ltr: true });
  return w;
}

const usd = (v: number, digits = 2) =>
  `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const signedUsd = (v: number) => `${v > 0 ? "+" : ""}${usd(v)}`;
const pct = (v: number | null, digits = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : `${v.toFixed(digits)}%`;
const signedPct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

/* ─── آیکون‌ها و لوگو ────────────────────────────────────────── */

function telegramIcon(ctx: Ctx, x: number, y: number, size: number, bg: string, fg: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(12, 12, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(5.2, 11.9);
  ctx.lineTo(18.4, 6.3);
  ctx.lineTo(16.2, 18.6);
  ctx.lineTo(12.3, 15.3);
  ctx.lineTo(10.1, 17.6);
  ctx.lineTo(9.9, 13.7);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = bg;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(9.9, 13.7);
  ctx.lineTo(16.6, 8.6);
  ctx.stroke();
  ctx.restore();
}

function globeIcon(ctx: Ctx, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(12, 12, 10.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(1.4, 12);
  ctx.lineTo(22.6, 12);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(12, 12, 4.8, 10.6, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** نشانِ کریپتو اسمارت: شش‌ضلعیِ گرادیانی با فلشِ صعودی. */
function brandMark(ctx: Ctx, p: CardPalette, cx: number, cy: number, r: number) {
  ctx.save();
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, p.accent);
  g.addColorStop(1, p.accent2);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const px = cx + r * Math.cos(a);
    const py = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.shadowColor = hexA(p.accent, 0.55);
  ctx.shadowBlur = 24;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = p.onAccent;
  ctx.lineWidth = r * 0.13;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.44, cy + r * 0.30);
  ctx.lineTo(cx - r * 0.12, cy - r * 0.10);
  ctx.lineTo(cx + r * 0.10, cy + r * 0.14);
  ctx.lineTo(cx + r * 0.46, cy - r * 0.36);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.16, cy - r * 0.36);
  ctx.lineTo(cx + r * 0.46, cy - r * 0.36);
  ctx.lineTo(cx + r * 0.46, cy - r * 0.06);
  ctx.stroke();
  ctx.restore();
}

/* ─── پس‌زمینه ───────────────────────────────────────────────── */

function background(ctx: Ctx, p: CardPalette, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w * 0.75, h);
  g.addColorStop(0, p.bg[0]);
  g.addColorStop(0.55, p.bg[1]);
  g.addColorStop(1, p.bg[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // هاله‌های رنگی
  const blob = (cx: number, cy: number, r: number, color: string, a: number) => {
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, hexA(color, a));
    rg.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  };
  blob(w * 0.86, h * 0.08, Math.max(w, h) * 0.45, p.accent, p.isDark ? 0.3 : 0.22);
  blob(w * 0.06, h * 0.94, Math.max(w, h) * 0.4, p.accent2, p.isDark ? 0.26 : 0.2);

  // شبکهٔ ظریف
  ctx.save();
  ctx.strokeStyle = p.grid;
  ctx.lineWidth = 1;
  const step = 68;
  for (let x = step; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = step; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();

  // قابِ بیرونی
  ctx.save();
  rr(ctx, 14, 14, w - 28, h - 28, 38);
  ctx.strokeStyle = hexA(p.accent, 0.22);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

/* ─── سربرگ ──────────────────────────────────────────────────── */

function header(ctx: Ctx, p: CardPalette, x: number, y: number, w: number, h: number, name: string, username: string, s: CardStats) {
  const right = x + w;
  // آواتار
  const initials = (name || username || "?").trim().charAt(0).toUpperCase();
  const cx = right - 44;
  const cy = y + 52;
  ctx.save();
  const g = ctx.createLinearGradient(cx - 44, cy - 44, cx + 44, cy + 44);
  g.addColorStop(0, p.accent);
  g.addColorStop(1, p.accent2);
  ctx.beginPath();
  ctx.arc(cx, cy, 44, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  text(ctx, initials, cx, cy + 16, { size: 44, weight: 800, color: p.onAccent, align: "center", ltr: true });

  text(ctx, "برایند ژورنال", right - 106, y + 38, { size: 26, weight: 700, color: p.accent });
  text(ctx, name || username, right - 106, y + 88, { size: 48, weight: 800, color: p.text });
  if (username) {
    text(ctx, `@${username}`, right - 106, y + 122, { size: 22, weight: 600, color: p.muted, ltr: true, align: "right" });
  }

  // سمتِ چپ: تاریخ و تعداد معاملات
  const jp = getJalaliParts(new Date().toISOString());
  const date = jp ? `${toPersianDigits(jp.day)} ${jp.monthName} ${toPersianDigits(jp.year)}` : "";
  ctx.save();
  ctx.font = font(23, 700);
  const dw = ctx.measureText(date).width + 40;
  rr(ctx, x, y + 10, dw, 48, 16);
  ctx.fillStyle = hexA(p.accent, 0.12);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = hexA(p.accent, 0.28);
  ctx.stroke();
  ctx.restore();
  text(ctx, date, x + dw - 20, y + 42, { size: 23, weight: 700, color: p.text });

  const info = `${toPersianDigits(s.trades)} معامله · ${toPersianDigits(s.closed)} بسته‌شده`;
  text(ctx, info, x, y + 96, { size: 22, weight: 600, color: p.muted, align: "left" });
}

/* ─── باکس‌ها ────────────────────────────────────────────────── */

function heroTile(ctx: Ctx, p: CardPalette, x: number, y: number, w: number, h: number, s: CardStats, showMargin: boolean) {
  const up = s.pnlUsd >= 0;
  const color = up ? p.profit : p.loss;
  panel(ctx, p, x, y, w, h, color);
  ctx.save();
  rr(ctx, x, y, w, h, 28);
  ctx.clip();
  const g = ctx.createLinearGradient(x + w, y, x, y + h);
  g.addColorStop(0, hexA(color, 0.22));
  g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  const right = x + w - 28;
  text(ctx, s.periodTitle, right, y + 48, { size: 25, weight: 700, color: p.muted });
  text(ctx, `${up ? "▲" : "▼"} ${signedPct(s.pnlPct)}`, right, y + 116, { size: 66, weight: 800, color, ltr: true, align: "right" });
  text(ctx, signedUsd(s.pnlUsd), right, y + 156, { size: 30, weight: 800, color: p.text, ltr: true, align: "right" });

  if (showMargin) {
    chip(ctx, p, "مارجین", usd(s.balance), x + w - 24, y + h - 76, p.accent);
  }
}

interface MetricArgs {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: string;
}

function metricTile(ctx: Ctx, p: CardPalette, x: number, y: number, w: number, h: number, m: MetricArgs) {
  panel(ctx, p, x, y, w, h, m.color);
  ctx.save();
  rr(ctx, x + 24, y + 24, 54, 54, 18);
  ctx.fillStyle = hexA(m.color, 0.16);
  ctx.fill();
  ctx.restore();
  text(ctx, m.icon, x + 51, y + 62, { size: 27, align: "center", color: m.color });
  const right = x + w - 26;
  text(ctx, m.label, right, y + 58, { size: 24, weight: 700, color: p.muted });
  text(ctx, m.value, right, y + 122, { size: 50, weight: 800, color: m.color, ltr: true, align: "right" });
  if (m.sub) text(ctx, m.sub, right, y + 152, { size: 21, weight: 600, color: p.muted });
}

function winLossTile(ctx: Ctx, p: CardPalette, x: number, y: number, w: number, h: number, s: CardStats) {
  panel(ctx, p, x, y, w, h, p.accent);
  const right = x + w - 26;
  text(ctx, "توزیع سود و زیان", right, y + 50, { size: 25, weight: 800, color: p.text });

  const total = Math.max(1, s.win + s.loss + s.be);
  const barX = x + 26;
  const barW = w - 52;
  const barY = y + 74;
  const barH = 30;
  ctx.save();
  rr(ctx, barX, barY, barW, barH, 15);
  ctx.fillStyle = hexA(p.muted, 0.16);
  ctx.fill();
  ctx.clip();
  let cursor = barX + barW;
  const seg = (n: number, color: string) => {
    const sw = (n / total) * barW;
    if (sw <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(cursor - sw, barY, sw, barH);
    cursor -= sw;
  };
  seg(s.win, p.profit);
  seg(s.be, hexA(p.muted, 0.7));
  seg(s.loss, p.loss);
  ctx.restore();

  const legend = [
    { t: "سودده", n: s.win, c: p.profit },
    { t: "سربه‌سر", n: s.be, c: p.muted },
    { t: "زیان‌ده", n: s.loss, c: p.loss },
  ];
  const colW = (w - 52) / 3;
  legend.forEach((l, i) => {
    const cxRight = x + w - 26 - i * colW;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cxRight - 9, y + 138, 8, 0, Math.PI * 2);
    ctx.fillStyle = l.c;
    ctx.fill();
    ctx.restore();
    text(ctx, l.t, cxRight - 26, y + 146, { size: 21, weight: 700, color: p.muted });
    text(ctx, `${toPersianDigits(l.n)} (${toPersianDigits(Math.round((l.n / total) * 100))}٪)`, cxRight, y + 182, { size: 26, weight: 800, color: l.c });
  });

  if (h > 200) {
    text(ctx, `میانگین سود ${usd(s.avgWin ?? 0)} · میانگین زیان ${usd(s.avgLoss ?? 0)}`, x + w - 26, y + h - 24, { size: 20, weight: 600, color: p.muted });
  }
}

function directionTile(ctx: Ctx, p: CardPalette, x: number, y: number, w: number, h: number, s: CardStats) {
  panel(ctx, p, x, y, w, h, p.accent2);
  const right = x + w - 26;
  text(ctx, "تفکیک جهت معاملات", right, y + 50, { size: 25, weight: 800, color: p.text });
  const total = Math.max(1, s.long + s.short);
  const rows = [
    { t: "لانگ", n: s.long, wr: s.longWr, c: p.profit, icon: "▲" },
    { t: "شورت", n: s.short, wr: s.shortWr, c: p.loss, icon: "▼" },
  ];
  rows.forEach((r, i) => {
    const ry = y + 82 + i * 52;
    text(ctx, `${r.icon} ${r.t}`, right, ry + 22, { size: 23, weight: 800, color: r.c });
    const barX = x + 26;
    const barW = w - 200;
    ctx.save();
    rr(ctx, barX, ry + 4, barW, 22, 11);
    ctx.fillStyle = hexA(p.muted, 0.16);
    ctx.fill();
    const fw = Math.max(6, (r.n / total) * barW);
    rr(ctx, barX + barW - fw, ry + 4, fw, 22, 11);
    ctx.fillStyle = hexA(r.c, 0.85);
    ctx.fill();
    ctx.restore();
    text(ctx, `${toPersianDigits(r.n)} · وین‌ریت ${r.wr === null || r.wr === undefined ? "—" : toPersianDigits(Math.round(r.wr))+"٪"}`, right - 120, ry + 22, { size: 21, weight: 700, color: p.muted });
  });
}

function equityTile(ctx: Ctx, p: CardPalette, x: number, y: number, w: number, h: number, s: CardStats) {
  panel(ctx, p, x, y, w, h, p.accent);
  const right = x + w - 28;
  text(ctx, "منحنی سرمایه و میانگین متحرک", right, y + 46, { size: 26, weight: 800, color: p.text });
  text(ctx, "Equity Curve + MA", x + 28, y + 46, { size: 20, weight: 600, color: p.muted, align: "left", ltr: true });

  const pts = s.equity.length >= 2 ? s.equity : [s.balance, s.balance];
  const win = Math.max(3, Math.min(20, Math.round(pts.length / 6)));
  const ma = pts.map((_, i) => {
    const from = Math.max(0, i - win + 1);
    const slice = pts.slice(from, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });

  const gx = x + 34;
  const gy = y + 70;
  const gw = w - 68;
  const gh = h - 118;
  const min = Math.min(...pts, ...ma);
  const max = Math.max(...pts, ...ma);
  const span = max - min || 1;
  const px = (i: number) => gx + gw - (i / (pts.length - 1 || 1)) * gw; // RTL: قدیمی‌ترین سمت راست
  const py = (v: number) => gy + gh - ((v - min) / span) * gh;

  // خطوط افقی
  ctx.save();
  ctx.strokeStyle = hexA(p.muted, 0.16);
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 8]);
  for (let i = 0; i <= 3; i++) {
    const yy = gy + (gh / 3) * i;
    ctx.beginPath();
    ctx.moveTo(gx, yy);
    ctx.lineTo(gx + gw, yy);
    ctx.stroke();
  }
  ctx.restore();

  const up = pts[pts.length - 1] >= pts[0];
  const line = up ? p.profit : p.loss;

  // ناحیهٔ زیرِ نمودار
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(px(0), gy + gh);
  pts.forEach((v, i) => ctx.lineTo(px(i), py(v)));
  ctx.lineTo(px(pts.length - 1), gy + gh);
  ctx.closePath();
  const ag = ctx.createLinearGradient(0, gy, 0, gy + gh);
  ag.addColorStop(0, hexA(line, 0.38));
  ag.addColorStop(1, hexA(line, 0));
  ctx.fillStyle = ag;
  ctx.fill();
  ctx.restore();

  // خطِ سرمایه
  ctx.save();
  ctx.beginPath();
  pts.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
  ctx.strokeStyle = line;
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.shadowColor = hexA(line, 0.6);
  ctx.shadowBlur = 16;
  ctx.stroke();
  ctx.restore();

  // میانگین متحرک
  ctx.save();
  ctx.beginPath();
  ma.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
  ctx.strokeStyle = hexA(p.accent2, 0.95);
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 9]);
  ctx.stroke();
  ctx.restore();

  // نقطهٔ پایانی
  ctx.save();
  ctx.beginPath();
  ctx.arc(px(pts.length - 1), py(pts[pts.length - 1]), 8, 0, Math.PI * 2);
  ctx.fillStyle = line;
  ctx.shadowColor = hexA(line, 0.9);
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.restore();

  // راهنما
  text(ctx, `سرمایه ${usd(pts[pts.length - 1])}`, right, y + h - 22, { size: 21, weight: 700, color: line });
  text(ctx, `MA(${toPersianDigits(win)})`, x + 34, y + h - 22, { size: 21, weight: 700, color: p.accent2, align: "left" });
}

/* ─── پانویس ─────────────────────────────────────────────────── */

const SLOGAN = "برایندت رو بساز، نه ادعا! ژورنالِ حرفه‌ای + تحلیل هوش مصنوعی + لیگ تریدرها — همین حالا در الگو هاب رایگان شروع کن 🚀";

function footer(ctx: Ctx, p: CardPalette, x: number, y: number, w: number, h: number) {
  // جملهٔ تبلیغاتی
  ctx.save();
  rr(ctx, x, y, w, 62, 20);
  const sg = ctx.createLinearGradient(x, y, x + w, y);
  sg.addColorStop(0, hexA(p.accent, 0.18));
  sg.addColorStop(1, hexA(p.accent2, 0.18));
  ctx.fillStyle = sg;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = hexA(p.accent, 0.28);
  ctx.stroke();
  ctx.restore();
  text(ctx, SLOGAN, x + w / 2, y + 40, { size: 24, weight: 700, color: p.text, align: "center" });

  const by = y + 86;
  // برند سمت راست
  brandMark(ctx, p, x + w - 40, by + 34, 34);
  text(ctx, "ALGO HUB", x + w - 88, by + 30, { size: 34, weight: 800, color: p.text, align: "right", ltr: true });
  text(ctx, "CRYPTO SMART", x + w - 88, by + 58, { size: 19, weight: 700, color: p.muted, align: "right", ltr: true });

  // تماس سمت چپ
  telegramIcon(ctx, x, by + 6, 34, p.accent, p.onAccent);
  text(ctx, "@ALGOHUB_ORG", x + 44, by + 30, { size: 25, weight: 800, color: p.text, align: "left", ltr: true });
  globeIcon(ctx, x, by + 40, 32, p.accent2);
  text(ctx, "algohub.cryptosmart.site", x + 44, by + 64, { size: 23, weight: 700, color: p.muted, align: "left", ltr: true });
}

/* ─── رندرِ اصلی ─────────────────────────────────────────────── */

export interface CardOptions {
  aspect: CardAspect;
  theme: Theme;
  period: CardPeriod;
  showMargin: boolean;
  name: string;
  username: string;
  /** ضریبِ کیفیت (پیش‌فرض ۲ برابر). */
  scale?: number;
}

interface Tile {
  cols: number;
  draw: (x: number, y: number, w: number, h: number) => void;
}

export function renderPnlCard(canvas: HTMLCanvasElement, data: DashboardData, opts: CardOptions) {
  const def = aspectDef(opts.aspect);
  const p = CARD_PALETTES[opts.theme] ?? CARD_PALETTES.classic;
  const s = buildStats(data, opts.period);
  const scale = opts.scale ?? 2;
  const W = def.w;
  const H = def.h;

  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";

  background(ctx, p, W, H);

  const contentX = PAD;
  const contentW = W - PAD * 2;

  // سربرگ
  const headerH = 132;
  header(ctx, p, contentX, PAD, contentW, headerH, opts.name, opts.username, s);

  // شبکهٔ باکس‌ها (اندازهٔ باکس‌ها در همهٔ ابعاد ثابت است)
  const cols = Math.max(2, Math.floor((contentW + GAP) / (TILE_W + GAP)));
  const gridW = cols * TILE_W + (cols - 1) * GAP;
  const gridX = contentX + (contentW - gridW) / 2;

  const tiles: Tile[] = [
    { cols: 2, draw: (x, y, w, h) => heroTile(ctx, p, x, y, w, h, s, opts.showMargin) },
    {
      cols: 1,
      draw: (x, y, w, h) =>
        metricTile(ctx, p, x, y, w, h, {
          label: "وین‌ریت", icon: "🎯", color: p.accent,
          value: s.winRate === null ? "—" : pct(s.winRate, 1),
          sub: `${toPersianDigits(s.win)} برد از ${toPersianDigits(s.win + s.loss)}`,
        }),
    },
    {
      cols: 1,
      draw: (x, y, w, h) =>
        metricTile(ctx, p, x, y, w, h, {
          label: "میانگین R:R", icon: "⚖️", color: p.accent2,
          value: s.avgRr.toFixed(2), sub: "ریسک به ریوارد",
        }),
    },
    {
      cols: 1,
      draw: (x, y, w, h) =>
        metricTile(ctx, p, x, y, w, h, {
          label: "ضریب سود", icon: "💹",
          color: s.profitFactor >= 1 ? p.profit : p.loss,
          value: s.profitFactor.toFixed(2), sub: "Profit Factor",
        }),
    },
    {
      cols: 1,
      draw: (x, y, w, h) =>
        metricTile(ctx, p, x, y, w, h, {
          label: "حداکثر دراوداون", icon: "🛡", color: p.loss,
          value: pct(-Math.abs(s.ddPct), 1), sub: usd(-Math.abs(s.ddUsd)),
        }),
    },
    { cols: 2, draw: (x, y, w, h) => winLossTile(ctx, p, x, y, w, h, s) },
    { cols: 2, draw: (x, y, w, h) => directionTile(ctx, p, x, y, w, h, s) },
  ];

  // چیدنِ ردیف‌ها
  const rows: Tile[][] = [];
  let row: Tile[] = [];
  let used = 0;
  tiles.forEach((t) => {
    if (used + t.cols > cols) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push(t);
    used += t.cols;
  });
  if (row.length) rows.push(row);

  const unit = (n: number) => n * TILE_W + (n - 1) * GAP;
  const gridTop = PAD + headerH + 20;
  let ty = gridTop;
  rows.forEach((r) => {
    const totalCols = r.reduce((a, t) => a + t.cols, 0);
    let tx = gridX + gridW; // از راست به چپ
    r.forEach((t, i) => {
      const isLast = i === r.length - 1;
      const spanCols = isLast ? t.cols + (cols - totalCols) : t.cols;
      const tw = unit(spanCols);
      tx -= tw;
      t.draw(tx, ty, tw, TILE_H);
      tx -= GAP;
    });
    ty += TILE_H + GAP;
  });

  // پانویس در پایین، نمودار در فضای باقی‌مانده
  const footerH = 158;
  const footerY = H - PAD - footerH;
  const chartTop = ty + 4;
  const available = footerY - 18 - chartTop;
  const chartH = Math.max(170, Math.min(available, 560));
  const chartY = chartTop + Math.max(0, (available - chartH) / 2);
  equityTile(ctx, p, gridX, chartY, gridW, chartH, s);

  footer(ctx, p, gridX, footerY, gridW, footerH);
}

/** متنِ آمادهٔ اشتراک‌گذاری (کپشن). */
export function shareCaption(data: DashboardData, period: CardPeriod, name: string): string {
  const s = buildStats(data, period);
  return [
    `📊 ${s.periodTitle} ژورنالِ ${name || "من"}`,
    `${s.pnlPct >= 0 ? "🟢" : "🔴"} بازدهی: ${signedPct(s.pnlPct)} (${signedUsd(s.pnlUsd)})`,
    `🎯 وین‌ریت: ${pct(s.winRate, 1)} | ⚖️ میانگین R:R: ${s.avgRr.toFixed(2)} | 💹 ضریب سود: ${s.profitFactor.toFixed(2)}`,
    "",
    SLOGAN,
    "🌐 algohub.cryptosmart.site",
    "✈️ @ALGOHUB_ORG",
    "",
    "#الگوهاب #AlgoHub #CryptoSmart #ژورنال_معاملاتی #تریدینگ #کریپتو",
  ].join("\n");
}

export const SHARE_SLOGAN = SLOGAN;
export const SITE_URL = "https://algohub.cryptosmart.site";
export const TELEGRAM_ID = "ALGOHUB_ORG";
