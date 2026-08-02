/**
 * «ساخت تصویر برایند» — رندرِ کارت روی Canvas 2D.
 *
 * همهٔ متن‌ها پیش از رسم اندازه‌گیری و در صورت نیاز کوچک می‌شوند تا هرگز
 * از کادرِ خود بیرون نزنند.
 */
import type { DashboardData } from "./types";
import { getJalaliParts, toPersianDigits } from "./jalali";
import type { Theme } from "./theme";
import {
  CARD_PALETTES,
  aspectDef,
  buildStats,
  pctText,
  signedPct,
  signedUsd,
  usd,
  SHARE_SLOGAN,
  SITE_LABEL,
  TELEGRAM_ID,
  type CardAspect,
  type CardPalette,
  type CardPeriod,
  type CardStats,
} from "./pnlCardTheme";

export * from "./pnlCardTheme";

type Ctx = CanvasRenderingContext2D;

const FONT = '"Vazirmatn","IRANSansX","IRANSans","Segoe UI",system-ui,sans-serif';
const font = (size: number, weight = 700) => `${weight} ${size}px ${FONT}`;

const PAD = 48;
const TILE_W = 300;
const TILE_H = 176;
const GAP = 22;

/* ابزارهای پایه */

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

function widthOf(ctx: Ctx, s: string, size: number, weight = 700): number {
  ctx.save();
  ctx.font = font(size, weight);
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

/** بزرگ‌ترین اندازه‌ای که متن در عرضِ داده‌شده جا می‌شود. */
function fitSize(ctx: Ctx, s: string, size: number, weight: number, max?: number, min = 11): number {
  if (!max || max <= 0) return size;
  let cur = size;
  while (cur > min && widthOf(ctx, s, cur, weight) > max) cur -= 1;
  return cur;
}

interface TextOpts {
  size?: number;
  weight?: number;
  color?: string;
  align?: CanvasTextAlign;
  ltr?: boolean;
  alpha?: number;
  /** عرضِ مجاز؛ متن خودکار کوچک می‌شود. */
  max?: number;
  min?: number;
}

/** رسمِ متن با کوچک‌سازیِ خودکار؛ عرضِ نهایی را برمی‌گرداند. */
function text(ctx: Ctx, s: string, x: number, y: number, o: TextOpts = {}): number {
  const weight = o.weight ?? 700;
  const size = fitSize(ctx, s, o.size ?? 22, weight, o.max, o.min ?? 11);
  ctx.save();
  ctx.font = font(size, weight);
  ctx.fillStyle = o.color ?? "#fff";
  ctx.textAlign = o.align ?? "right";
  ctx.textBaseline = "alphabetic";
  ctx.direction = o.ltr ? "ltr" : "rtl";
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  if (o.max) ctx.fillText(s, x, y, o.max);
  else ctx.fillText(s, x, y);
  ctx.restore();
  return Math.min(widthOf(ctx, s, size, weight), o.max ?? Number.MAX_SAFE_INTEGER);
}

function wrapLines(ctx: Ctx, s: string, size: number, weight: number, maxW: number, maxLines: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  words.forEach((w) => {
    const candidate = cur ? `${cur} ${w}` : w;
    if (!cur || widthOf(ctx, candidate, size, weight) <= maxW) cur = candidate;
    else {
      lines.push(cur);
      cur = w;
    }
  });
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const head = lines.slice(0, maxLines - 1);
  head.push(lines.slice(maxLines - 1).join(" "));
  return head;
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

/** چیپِ چپ‌چین؛ عرضه را برمی‌گرداند. */
function chipAt(ctx: Ctx, p: CardPalette, label: string, value: string, x: number, y: number, color: string, maxW: number): number {
  const labelSize = 19;
  const valueSize = 21;
  const lw = widthOf(ctx, label, labelSize, 700);
  const vw = widthOf(ctx, value, valueSize, 800);
  const w = Math.min(maxW, lw + vw + 44);
  const h = 44;
  ctx.save();
  rr(ctx, x, y, w, h, 14);
  ctx.fillStyle = hexA(color, 0.14);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = hexA(color, 0.3);
  ctx.stroke();
  ctx.restore();
  text(ctx, label, x + w - 14, y + 29, { size: labelSize, color: p.muted, max: w * 0.5 });
  text(ctx, value, x + 14, y + 29, { size: valueSize, weight: 800, color, align: "left", ltr: true, max: w * 0.55 });
  return w;
}

/* آیکون‌ها و لوگو */

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

/* لوگوی رسمی کریپتو اسمارت (frontend/public) */

let logoPromise: Promise<HTMLImageElement | null> | null = null;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** لوگو را یک‌بار بارگذاری و کش می‌کند. */
export function loadBrandLogo(): Promise<HTMLImageElement | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!logoPromise) {
    logoPromise = (async () => {
      const prefix = window.location.pathname.startsWith("/journal") ? "/journal" : "";
      const candidates = [
        `${prefix}/logo-icon.png`,
        "/logo-icon.png",
        "/journal/logo-icon.png",
        `${prefix}/crypto-smart-logo.png`,
        "/crypto-smart-logo.png",
      ];
      for (const src of candidates) {
        const img = await loadImage(src);
        if (img) return img;
      }
      return null;
    })();
  }
  return logoPromise;
}

/** نشانِ جایگزین وقتی لوگو بارگذاری نشده باشد. */
function fallbackMark(ctx: Ctx, p: CardPalette, cx: number, cy: number, r: number) {
  ctx.save();
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, p.accent);
  g.addColorStop(1, p.accent2);
  rr(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.42);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = p.onAccent;
  ctx.lineWidth = r * 0.16;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.44, cy + r * 0.3);
  ctx.lineTo(cx - r * 0.1, cy - r * 0.12);
  ctx.lineTo(cx + r * 0.12, cy + r * 0.14);
  ctx.lineTo(cx + r * 0.46, cy - r * 0.34);
  ctx.stroke();
  ctx.restore();
}

function drawLogo(ctx: Ctx, p: CardPalette, logo: HTMLImageElement | null | undefined, cx: number, cy: number, size: number) {
  if (!logo) {
    fallbackMark(ctx, p, cx, cy, size / 2);
    return;
  }
  ctx.save();
  rr(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.24);
  ctx.clip();
  ctx.drawImage(logo, cx - size / 2, cy - size / 2, size, size);
  ctx.restore();
}

/* پس‌زمینه */

function background(ctx: Ctx, p: CardPalette, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w * 0.75, h);
  g.addColorStop(0, p.bg[0]);
  g.addColorStop(0.55, p.bg[1]);
  g.addColorStop(1, p.bg[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const blob = (cx: number, cy: number, r: number, color: string, a: number) => {
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, hexA(color, a));
    rg.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  };
  blob(w * 0.86, h * 0.08, Math.max(w, h) * 0.45, p.accent, p.isDark ? 0.3 : 0.22);
  blob(w * 0.06, h * 0.94, Math.max(w, h) * 0.4, p.accent2, p.isDark ? 0.26 : 0.2);

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

  ctx.save();
  rr(ctx, 14, 14, w - 28, h - 28, 38);
  ctx.strokeStyle = hexA(p.accent, 0.22);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

/* سربرگ */

function header(ctx: Ctx, p: CardPalette, x: number, y: number, w: number, name: string, username: string, s: CardStats) {
  const right = x + w;
  const initials = (name || username || "?").trim().charAt(0).toUpperCase();
  const cx = right - 44;
  const cy = y + 50;
  ctx.save();
  const g = ctx.createLinearGradient(cx - 44, cy - 44, cx + 44, cy + 44);
  g.addColorStop(0, p.accent);
  g.addColorStop(1, p.accent2);
  ctx.beginPath();
  ctx.arc(cx, cy, 42, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  text(ctx, initials, cx, cy + 15, { size: 40, weight: 800, color: p.onAccent, align: "center", ltr: true });

  const textRight = right - 104;
  const nameMax = w * 0.58;
  text(ctx, "برایند ژورنال", textRight, y + 32, { size: 24, weight: 700, color: p.accent, max: nameMax });
  text(ctx, name || username || "تریدر", textRight, y + 78, { size: 44, weight: 800, color: p.text, max: nameMax });
  if (username) {
    text(ctx, `@${username}`, textRight, y + 110, { size: 21, weight: 600, color: p.muted, ltr: true, max: nameMax });
  }

  const jp = getJalaliParts(new Date().toISOString());
  const date = jp ? `${toPersianDigits(jp.day)} ${jp.monthName} ${toPersianDigits(jp.year)}` : "";
  if (date) {
    const dw = Math.min(w * 0.32, widthOf(ctx, date, 21, 700) + 36);
    ctx.save();
    rr(ctx, x, y + 8, dw, 44, 14);
    ctx.fillStyle = hexA(p.accent, 0.12);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = hexA(p.accent, 0.28);
    ctx.stroke();
    ctx.restore();
    text(ctx, date, x + dw - 18, y + 37, { size: 21, weight: 700, color: p.text, max: dw - 30 });
  }

  const info = `${toPersianDigits(s.trades)} معامله · ${toPersianDigits(s.closed)} بسته‌شده`;
  text(ctx, info, x, y + 86, { size: 20, weight: 600, color: p.muted, align: "left", max: w * 0.34 });
}

/* باکس‌ها */

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

  const right = x + w - 26;
  const chipW = showMargin ? chipAt(ctx, p, "مارجین", usd(s.balance), x + 24, y + 20, p.accent, w * 0.42) : 0;
  const titleMax = w - 76 - (chipW ? chipW + 20 : 0);
  text(ctx, s.periodTitle, right, y + 46, { size: 23, weight: 700, color: p.muted, max: titleMax });
  text(ctx, `${up ? "▲" : "▼"} ${signedPct(s.pnlPct)}`, right, y + 112, {
    size: 58, weight: 800, color, ltr: true, max: w - 60,
  });
  text(ctx, signedUsd(s.pnlUsd), right, y + 152, { size: 27, weight: 800, color: p.text, ltr: true, max: w - 60 });
}

interface MetricArgs {
  label: string;
  value: string;
  sub?: string;
  subLtr?: boolean;
  color: string;
  icon: string;
}

function metricTile(ctx: Ctx, p: CardPalette, x: number, y: number, w: number, h: number, m: MetricArgs) {
  panel(ctx, p, x, y, w, h, m.color);
  ctx.save();
  rr(ctx, x + 22, y + 22, 50, 50, 16);
  ctx.fillStyle = hexA(m.color, 0.16);
  ctx.fill();
  ctx.restore();
  text(ctx, m.icon, x + 47, y + 57, { size: 25, align: "center", color: m.color });
  const right = x + w - 24;
  text(ctx, m.label, right, y + 54, { size: 22, weight: 700, color: p.muted, max: w - 100 });
  text(ctx, m.value, right, y + 116, { size: 44, weight: 800, color: m.color, ltr: true, max: w - 52 });
  if (m.sub) {
    text(ctx, m.sub, right, y + 148, { size: 19, weight: 600, color: p.muted, ltr: m.subLtr, max: w - 52 });
  }
}

function winLossTile(ctx: Ctx, p: CardPalette, x: number, y: number, w: number, h: number, s: CardStats) {
  panel(ctx, p, x, y, w, h, p.accent);
  text(ctx, "توزیع سود و زیان", x + w - 26, y + 44, { size: 23, weight: 800, color: p.text, max: w - 60 });

  const total = Math.max(1, s.win + s.loss + s.be);
  const barX = x + 26;
  const barW = w - 52;
  const barY = y + 62;
  const barH = 26;
  ctx.save();
  rr(ctx, barX, barY, barW, barH, 13);
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
  const colW = barW / 3;
  legend.forEach((l, i) => {
    const cRight = barX + barW - i * colW;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cRight - 8, y + 114, 7, 0, Math.PI * 2);
    ctx.fillStyle = l.c;
    ctx.fill();
    ctx.restore();
    text(ctx, l.t, cRight - 24, y + 121, { size: 19, weight: 700, color: p.muted, max: colW - 40 });
    const share = toPersianDigits(Math.round((l.n / total) * 100));
    text(ctx, `${toPersianDigits(l.n)} — ${share}٪`, cRight, y + 154, {
      size: 23, weight: 800, color: l.c, max: colW - 16,
    });
  });
}

function directionTile(ctx: Ctx, p: CardPalette, x: number, y: number, w: number, h: number, s: CardStats) {
  panel(ctx, p, x, y, w, h, p.accent2);
  text(ctx, "تفکیک جهت معاملات", x + w - 26, y + 44, { size: 23, weight: 800, color: p.text, max: w - 60 });

  const total = Math.max(1, s.long + s.short);
  const rows = [
    { t: "لانگ", n: s.long, wr: s.longWr, c: p.profit, icon: "▲" },
    { t: "شورت", n: s.short, wr: s.shortWr, c: p.loss, icon: "▼" },
  ];

  const labelRight = x + w - 26;
  const labelW = 96;
  const countRight = labelRight - labelW - 12;
  const countW = 118;
  const wrLeft = x + 26;
  const wrW = 128;
  const barX = wrLeft + wrW + 14;
  const barW = Math.max(60, countRight - countW - 16 - barX);

  rows.forEach((r, i) => {
    const ry = y + 70 + i * 48;
    text(ctx, `${r.icon} ${r.t}`, labelRight, ry + 26, { size: 22, weight: 800, color: r.c, max: labelW });
    text(ctx, `${toPersianDigits(r.n)} معامله`, countRight, ry + 26, {
      size: 19, weight: 700, color: p.muted, max: countW,
    });

    ctx.save();
    rr(ctx, barX, ry + 10, barW, 20, 10);
    ctx.fillStyle = hexA(p.muted, 0.16);
    ctx.fill();
    const fw = Math.max(6, (r.n / total) * barW);
    rr(ctx, barX + barW - fw, ry + 10, fw, 20, 10);
    ctx.fillStyle = hexA(r.c, 0.85);
    ctx.fill();
    ctx.restore();

    const wrValue = r.wr === null || r.wr === undefined ? "—" : `${Math.round(r.wr)}%`;
    const vw = text(ctx, wrValue, wrLeft, ry + 26, { size: 22, weight: 800, color: r.c, align: "left", ltr: true, max: 64 });
    text(ctx, "وین‌ریت", wrLeft + vw + 8, ry + 26, {
      size: 17, weight: 600, color: p.muted, align: "left", max: wrW - vw - 10,
    });
  });
}

function equityTile(ctx: Ctx, p: CardPalette, x: number, y: number, w: number, h: number, s: CardStats) {
  panel(ctx, p, x, y, w, h, p.accent);
  const right = x + w - 28;
  text(ctx, "منحنی سرمایه و میانگین متحرک", right, y + 44, { size: 24, weight: 800, color: p.text, max: w * 0.6 });
  text(ctx, "Equity Curve + MA", x + 28, y + 44, { size: 19, weight: 600, color: p.muted, align: "left", ltr: true, max: w * 0.3 });

  const pts = s.equity.length >= 2 ? s.equity : [s.balance, s.balance];
  const win = Math.max(3, Math.min(20, Math.round(pts.length / 6)));
  const ma = pts.map((_, i) => {
    const from = Math.max(0, i - win + 1);
    const slice = pts.slice(from, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });

  const gx = x + 34;
  const gy = y + 66;
  const gw = w - 68;
  const gh = h - 112;
  const min = Math.min(...pts, ...ma);
  const max = Math.max(...pts, ...ma);
  const span = max - min || 1;
  const px = (i: number) => gx + gw - (i / (pts.length - 1 || 1)) * gw;
  const py = (v: number) => gy + gh - ((v - min) / span) * gh;

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

  ctx.save();
  ctx.beginPath();
  ma.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
  ctx.strokeStyle = hexA(p.accent2, 0.95);
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 9]);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(px(pts.length - 1), py(pts[pts.length - 1]), 8, 0, Math.PI * 2);
  ctx.fillStyle = line;
  ctx.shadowColor = hexA(line, 0.9);
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.restore();

  const legendY = y + h - 22;
  const vw = text(ctx, usd(pts[pts.length - 1]), right, legendY, {
    size: 21, weight: 800, color: line, ltr: true, align: "right", max: w * 0.3,
  });
  text(ctx, "سرمایه", right - vw - 10, legendY, { size: 19, weight: 700, color: p.muted, max: w * 0.2 });
  text(ctx, `MA(${win})`, x + 34, legendY, { size: 19, weight: 700, color: p.accent2, align: "left", ltr: true, max: w * 0.2 });
}

/* پانویس */

function footer(ctx: Ctx, p: CardPalette, x: number, y: number, w: number, h: number, logo?: HTMLImageElement | null) {
  const boxH = 66;
  ctx.save();
  rr(ctx, x, y, w, boxH, 20);
  const sg = ctx.createLinearGradient(x, y, x + w, y);
  sg.addColorStop(0, hexA(p.accent, 0.18));
  sg.addColorStop(1, hexA(p.accent2, 0.18));
  ctx.fillStyle = sg;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = hexA(p.accent, 0.28);
  ctx.stroke();
  ctx.restore();

  const sloganMax = w - 44;
  const lines = wrapLines(ctx, SHARE_SLOGAN, 22, 700, sloganMax, 2);
  if (lines.length === 1) {
    text(ctx, lines[0], x + w / 2, y + 42, { size: 22, weight: 700, color: p.text, align: "center", max: sloganMax });
  } else {
    text(ctx, lines[0], x + w / 2, y + 30, { size: 19, weight: 700, color: p.text, align: "center", max: sloganMax });
    text(ctx, lines[1], x + w / 2, y + 55, { size: 19, weight: 700, color: p.text, align: "center", max: sloganMax });
  }

  const by = y + boxH + 14;
  const logoSize = 62;
  drawLogo(ctx, p, logo, x + w - logoSize / 2, by + 34, logoSize);
  const brandRight = x + w - logoSize - 16;
  text(ctx, "ALGO HUB", brandRight, by + 30, { size: 32, weight: 800, color: p.text, align: "right", ltr: true, max: w * 0.3 });
  text(ctx, "CRYPTO SMART", brandRight, by + 56, { size: 17, weight: 700, color: p.muted, align: "right", ltr: true, max: w * 0.3 });

  telegramIcon(ctx, x, by + 4, 32, p.accent, p.onAccent);
  text(ctx, `@${TELEGRAM_ID}`, x + 42, by + 28, { size: 23, weight: 800, color: p.text, align: "left", ltr: true, max: w * 0.34 });
  globeIcon(ctx, x, by + 38, 30, p.accent2);
  text(ctx, SITE_LABEL, x + 42, by + 61, { size: 21, weight: 700, color: p.muted, align: "left", ltr: true, max: w * 0.34 });
}

/* رندرِ اصلی */

export interface CardOptions {
  aspect: CardAspect;
  theme: Theme;
  period: CardPeriod;
  showMargin: boolean;
  name: string;
  username: string;
  /** ضریبِ کیفیت (پیش‌فرض ۲ برابر). */
  scale?: number;
  /** لوگوی بارگذاری‌شده (loadBrandLogo). */
  logo?: HTMLImageElement | null;
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
  const headerH = 124;
  header(ctx, p, contentX, PAD, contentW, opts.name, opts.username, s);

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
          value: pctText(s.winRate, 1),
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
          value: s.profitFactor.toFixed(2), sub: "Profit Factor", subLtr: true,
        }),
    },
    {
      cols: 1,
      draw: (x, y, w, h) =>
        metricTile(ctx, p, x, y, w, h, {
          label: "حداکثر دراوداون", icon: "🛡", color: p.loss,
          value: `-${s.ddPct.toFixed(1)}%`, sub: usd(-s.ddUsd), subLtr: true,
        }),
    },
    { cols: 2, draw: (x, y, w, h) => winLossTile(ctx, p, x, y, w, h, s) },
    { cols: 2, draw: (x, y, w, h) => directionTile(ctx, p, x, y, w, h, s) },
  ];

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
  let ty = PAD + headerH + 18;
  rows.forEach((r) => {
    const totalCols = r.reduce((a, t) => a + t.cols, 0);
    let tx = gridX + gridW;
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

  const footerH = 172;
  const footerY = H - PAD - footerH;
  const chartTop = ty + 4;
  const chartH = Math.max(180, footerY - 20 - chartTop);
  equityTile(ctx, p, gridX, chartTop, gridW, chartH, s);

  footer(ctx, p, gridX, footerY, gridW, footerH, opts.logo);
}
