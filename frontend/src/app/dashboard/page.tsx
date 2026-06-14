"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/ui";
import { dashboardApi } from "@/lib/api";
import type { DashboardData } from "@/lib/types";
import {
  faNum,
  formatPct,
  formatRatio,
  formatToman,
  formatUsd,
  pnlColorClass,
} from "@/lib/format";
import { getJalaliParts, toPersianDigits } from "@/lib/jalali";

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardInner />
    </AppShell>
  );
}

function cssVar(name: string): string {
  if (typeof window === "undefined") return "#888";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ─── Pastel design tokens ─────────────────────────────────────────────────────
// Each tint is an "R,G,B" string so it composes cleanly inside rgba(...).
const TINTS = {
  mint: "94,234,212", // #5eead4
  violet: "167,139,250", // #a78bfa
  sky: "125,211,252", // #7dd3fc
  amber: "251,191,36", // #fbbf24
  rose: "244,114,182", // #f472b6
  green: "52,211,153", // #34d399
  red: "251,146,160", // #fb92a0
} as const;

/** Frosted glass card with a soft pastel wash of the given tint. */
function glassTint(rgb: string): React.CSSProperties {
  return {
    background: `linear-gradient(150deg, rgba(${rgb},0.18) 0%, rgba(${rgb},0.05) 48%, var(--glass-bg) 100%)`,
    border: `1px solid rgba(${rgb},0.24)`,
    backdropFilter: "blur(20px) saturate(155%)",
    WebkitBackdropFilter: "blur(20px) saturate(155%)",
    boxShadow: `0 16px 48px -20px rgba(${rgb},0.42), inset 0 1px 0 rgba(255,255,255,0.10)`,
  };
}

// ─── Daily P&L Calendar ──────────────────────────────────────────────────────

const GREGORIAN_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface CalCell {
  day: number | null;
  date: string | null;
  pnl: number;
  jalaliDay: number | null;
  isToday: boolean;
}

function buildMonthGrid(year: number, month: number, pnlMap: Map<string, number>): CalCell[] {
  const today = new Date().toISOString().slice(0, 10);
  const totalDays = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Mon=0

  const cells: CalCell[] = [];
  for (let i = 0; i < startOffset; i++) {
    cells.push({ day: null, date: null, pnl: 0, jalaliDay: null, isToday: false });
  }
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const pnl = pnlMap.get(dateStr) ?? 0;
    const jp = getJalaliParts(dateStr);
    cells.push({ day: d, date: dateStr, pnl, jalaliDay: jp?.day ?? null, isToday: dateStr === today });
  }
  return cells;
}

function buildMonthlyData(pnlByDay: { date: string; pnl: number }[]) {
  const byMonth = new Map<string, number>();
  pnlByDay.forEach(({ date, pnl }) => {
    const key = date.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + pnl);
  });
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, pnl]) => {
      const [y, m] = key.split("-").map(Number);
      const jp = getJalaliParts(`${y}-${String(m).padStart(2, "0")}-15`);
      return {
        key,
        label: `${GREGORIAN_MONTHS[m - 1]} ${y}`,
        jalaliLabel: jp ? `${jp.monthName} ${jp.year}` : "",
        pnl,
      };
    });
}

function fmtUsdt(v: number): string {
  if (v === 0) return "0";
  return `${v.toFixed(6)} USDT`;
}

function DailyPnLSection({ pnlByDay, walletMargin }: { pnlByDay: { date: string; pnl: number }[]; walletMargin: number }) {
  const today = new Date();
  const [preset, setPreset] = useState<"7d" | "30d" | "custom">("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
  const [chartType, setChartType] = useState<"calendar" | "bar">("calendar");
  const [profitView, setProfitView] = useState<"daily" | "monthly">("daily");

  const pnlMap = useMemo(() => {
    const m = new Map<string, number>();
    pnlByDay.forEach(({ date, pnl }) => m.set(date.slice(0, 10), pnl));
    return m;
  }, [pnlByDay]);

  // Date range for cumulative profit
  const { rangeFrom, rangeTo } = useMemo(() => {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (preset === "7d") {
      const f = new Date(now); f.setDate(f.getDate() - 6);
      return { rangeFrom: fmt(f), rangeTo: fmt(now) };
    }
    if (preset === "30d") {
      const f = new Date(now); f.setDate(f.getDate() - 29);
      return { rangeFrom: fmt(f), rangeTo: fmt(now) };
    }
    return { rangeFrom: customFrom, rangeTo: customTo };
  }, [preset, customFrom, customTo]);

  const { cumPnl, cumPct } = useMemo(() => {
    if (!rangeFrom || !rangeTo) return { cumPnl: 0, cumPct: 0 };
    let total = 0;
    pnlByDay.forEach(({ date, pnl }) => {
      const d = date.slice(0, 10);
      if (d >= rangeFrom && d <= rangeTo) total += pnl;
    });
    const pct = walletMargin > 0 ? (total / walletMargin) * 100 : 0;
    return { cumPnl: total, cumPct: pct };
  }, [pnlByDay, rangeFrom, rangeTo, walletMargin]);

  const todayStr = today.toISOString().slice(0, 10);
  const todayPnl = pnlMap.get(todayStr) ?? null;

  const calendarCells = useMemo(
    () => buildMonthGrid(viewYear, viewMonth, pnlMap),
    [viewYear, viewMonth, pnlMap]
  );

  const monthlyData = useMemo(() => buildMonthlyData(pnlByDay), [pnlByDay]);

  // Month navigation
  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1); }
    else setViewMonth(m => m + 1);
  };

  const jalaliInfo = getJalaliParts(`${viewYear}-${String(viewMonth).padStart(2, "0")}-15`);

  // Daily bar chart data (only non-null cells)
  const dailyBarData = calendarCells
    .filter((c) => c.day !== null)
    .map((c) => ({ day: c.day, jalaliDay: c.jalaliDay, pnl: c.pnl }));

  const border = "rgba(148,163,184,0.18)";

  // Pill button styling helper
  const pill = (active: boolean, rgb: string = TINTS.mint) =>
    active
      ? {
          background: `linear-gradient(135deg, rgba(${rgb},0.9), rgba(${rgb},0.6))`,
          border: `1px solid rgba(${rgb},0.5)`,
          color: "#0a1622",
          boxShadow: `0 8px 22px -8px rgba(${rgb},0.6)`,
        }
      : {
          background: "var(--glass-bg)",
          border: "1px solid var(--glass-border)",
          color: "var(--muted)",
        };

  return (
    <div className="space-y-4">
      {/* ── Date-range filter bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setPreset("7d")}
          className="rounded-full px-5 py-2 text-sm font-semibold backdrop-blur transition-all duration-300 hover:-translate-y-0.5"
          style={pill(preset === "7d", TINTS.mint)}
        >
          ۷ روز اخیر
        </button>
        <button
          onClick={() => setPreset("30d")}
          className="rounded-full px-5 py-2 text-sm font-semibold backdrop-blur transition-all duration-300 hover:-translate-y-0.5"
          style={pill(preset === "30d", TINTS.mint)}
        >
          ۳۰ روز اخیر
        </button>
        <div
          className="flex items-center gap-2 rounded-full px-4 py-2 text-sm backdrop-blur"
          style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0" style={{ color: `rgb(${TINTS.sky})` }}>
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <input
            type="date"
            className="w-28 bg-transparent text-sm text-text outline-none"
            value={customFrom}
            onChange={(e) => { setCustomFrom(e.target.value); setPreset("custom"); }}
          />
          <span className="text-muted">→</span>
          <input
            type="date"
            className="w-28 bg-transparent text-sm text-text outline-none"
            value={customTo}
            onChange={(e) => { setCustomTo(e.target.value); setPreset("custom"); }}
          />
        </div>
      </div>

      {/* ── Cumulative profit ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-5"
        style={glassTint(cumPnl >= 0 ? TINTS.mint : TINTS.rose)}
      >
        <div
          className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full opacity-70 blur-3xl"
          style={{ background: `rgba(${cumPnl >= 0 ? TINTS.mint : TINTS.rose},0.3)` }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-muted">سود تجمعی در بازه انتخابی</div>
            <div className="mt-1 flex items-baseline gap-2" dir="ltr">
              <span
                className="text-3xl font-extrabold tracking-tight"
                style={{ color: `rgb(${cumPnl >= 0 ? TINTS.green : TINTS.red})` }}
              >
                {cumPnl >= 0 ? "+" : ""}{cumPnl.toFixed(2)}
              </span>
              <span className="text-sm font-medium text-muted">USDT</span>
            </div>
          </div>
          <div
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold"
            style={{
              background: `rgba(${cumPnl >= 0 ? TINTS.green : TINTS.red},0.16)`,
              color: `rgb(${cumPnl >= 0 ? TINTS.green : TINTS.red})`,
            }}
            dir="ltr"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transform: cumPnl >= 0 ? "none" : "rotate(180deg)" }}>
              <path d="M2 8L6 4L10 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {cumPct >= 0 ? "+" : ""}{cumPct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* ── Main card ── */}
      <div className="glass overflow-hidden">
        {/* Card header */}
        <div className="flex items-start justify-between border-b border-white/5 p-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full animate-pulse-dot" style={{ background: `rgb(${TINTS.mint})` }} />
              <span className="text-base font-bold">تحلیل سود و زیان روزانه</span>
            </div>
            {todayPnl !== null && (
              <div
                className="mt-1 text-sm font-semibold"
                style={{ color: `rgb(${todayPnl >= 0 ? TINTS.green : TINTS.red})` }}
                dir="ltr"
              >
                Today: {todayPnl >= 0 ? "+" : ""}{todayPnl.toFixed(4)} USDT
              </div>
            )}
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setChartType("calendar")}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold backdrop-blur transition-all duration-300"
              style={pill(chartType === "calendar", TINTS.violet)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" />
              </svg>
              تقویم
            </button>
            <button
              onClick={() => setChartType("bar")}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold backdrop-blur transition-all duration-300"
              style={pill(chartType === "bar", TINTS.violet)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
              </svg>
              نمودار میله‌ای
            </button>
          </div>
        </div>

        {/* Month nav + profit view toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-5 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-full text-sm transition hover:-translate-y-0.5"
              style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}
            >
              ‹
            </button>
            <div className="text-sm font-medium">
              {jalaliInfo && (
                <>
                  <span className="font-bold" style={{ color: `rgb(${TINTS.mint})` }}>{jalaliInfo.monthName} {toPersianDigits(jalaliInfo.year)}</span>
                  <span className="mx-1.5 text-muted">/</span>
                  <span className="text-muted">{GREGORIAN_MONTHS[viewMonth - 1]} {viewYear}</span>
                </>
              )}
            </div>
            <button
              onClick={nextMonth}
              className="flex h-8 w-8 items-center justify-center rounded-full text-sm transition hover:-translate-y-0.5"
              style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}
            >
              ›
            </button>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setProfitView("daily")}
              className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
              style={pill(profitView === "daily", TINTS.sky)}
            >
              روزانه
            </button>
            <button
              onClick={() => setProfitView("monthly")}
              className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
              style={pill(profitView === "monthly", TINTS.sky)}
            >
              ماهانه
            </button>
          </div>
        </div>

        {/* ── Calendar view ── */}
        {chartType === "calendar" && profitView === "daily" && (
          <div className="p-5">
            {/* Week headers */}
            <div className="mb-2 grid grid-cols-7 gap-1.5">
              {["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه", "یکشنبه"].map((d) => (
                <div key={d} className="py-1 text-center text-[10px] font-medium text-muted">{d}</div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1.5">
              {calendarCells.map((cell, i) => {
                if (!cell.day) return <div key={i} />;
                const rgb = cell.pnl > 0 ? TINTS.green : cell.pnl < 0 ? TINTS.red : null;
                const cellStyle: React.CSSProperties = rgb
                  ? {
                      background: `linear-gradient(150deg, rgba(${rgb},0.22), rgba(${rgb},0.06))`,
                      border: `1px solid rgba(${rgb},0.3)`,
                    }
                  : { background: "var(--glass-bg)", border: "1px solid var(--glass-border)" };
                return (
                  <div
                    key={i}
                    className="flex min-h-[78px] flex-col rounded-2xl p-2 backdrop-blur transition-all duration-300 hover:-translate-y-0.5"
                    style={{
                      ...cellStyle,
                      ...(cell.isToday ? { boxShadow: `0 0 0 2px rgb(${TINTS.mint}), 0 10px 24px -10px rgba(${TINTS.mint},0.6)` } : {}),
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-sm font-bold leading-none text-text">{cell.day}</span>
                      {cell.jalaliDay && (
                        <span className="text-[9px] leading-none text-muted">{toPersianDigits(cell.jalaliDay)}</span>
                      )}
                    </div>
                    <div
                      className="mt-auto text-[9px] font-semibold leading-tight"
                      style={{ color: rgb ? `rgb(${rgb})` : "var(--muted)" }}
                      dir="ltr"
                    >
                      {fmtUsdt(cell.pnl)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Monthly calendar view ── */}
        {chartType === "calendar" && profitView === "monthly" && (
          <div className="space-y-2 p-5">
            {monthlyData.length === 0 && (
              <div className="py-10 text-center text-sm text-muted">داده‌ای موجود نیست</div>
            )}
            {monthlyData.map((row) => {
              const rgb = row.pnl >= 0 ? TINTS.green : TINTS.red;
              return (
                <div
                  key={row.key}
                  className="flex items-center justify-between rounded-2xl px-4 py-3 backdrop-blur transition hover:-translate-y-0.5"
                  style={{
                    background: `linear-gradient(135deg, rgba(${rgb},0.14), rgba(${rgb},0.03))`,
                    border: `1px solid rgba(${rgb},0.22)`,
                  }}
                >
                  <div>
                    <div className="text-sm font-bold">{row.jalaliLabel}</div>
                    <div className="text-xs text-muted">{row.label}</div>
                  </div>
                  <div className="text-base font-extrabold" style={{ color: `rgb(${rgb})` }} dir="ltr">
                    {row.pnl >= 0 ? "+" : ""}{row.pnl.toFixed(4)} USDT
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Daily bar chart ── */}
        {chartType === "bar" && profitView === "daily" && (
          <div className="p-5">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailyBarData} barSize={14}>
                <defs>
                  <linearGradient id="bar-up" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`rgb(${TINTS.mint})`} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={`rgb(${TINTS.green})`} stopOpacity={0.5} />
                  </linearGradient>
                  <linearGradient id="bar-down" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`rgb(${TINTS.rose})`} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={`rgb(${TINTS.red})`} stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={border} vertical={false} />
                <XAxis dataKey="day" stroke={cssVar("--muted")} fontSize={11} />
                <YAxis stroke={cssVar("--muted")} fontSize={11} tickFormatter={(v) => `${v.toFixed(1)}`} />
                <Tooltip
                  contentStyle={{ background: "var(--surface)", border: `1px solid ${border}`, borderRadius: 12, fontSize: 12 }}
                  cursor={{ fill: "rgba(148,163,184,0.08)" }}
                  formatter={(v: number, _: string, props: any) => [
                    `${v.toFixed(4)} USDT`,
                    `Day ${props.payload?.day}${props.payload?.jalaliDay ? ` (${toPersianDigits(props.payload.jalaliDay)})` : ""}`,
                  ]}
                />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                  {dailyBarData.map((c, i) => (
                    <Cell key={i} fill={c.pnl >= 0 ? "url(#bar-up)" : "url(#bar-down)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Monthly bar chart ── */}
        {chartType === "bar" && profitView === "monthly" && (
          <div className="p-5">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData} barSize={30}>
                <defs>
                  <linearGradient id="mbar-up" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`rgb(${TINTS.mint})`} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={`rgb(${TINTS.green})`} stopOpacity={0.5} />
                  </linearGradient>
                  <linearGradient id="mbar-down" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`rgb(${TINTS.rose})`} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={`rgb(${TINTS.red})`} stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={border} vertical={false} />
                <XAxis dataKey="label" stroke={cssVar("--muted")} fontSize={10} />
                <YAxis stroke={cssVar("--muted")} fontSize={11} tickFormatter={(v) => `${v.toFixed(0)}`} />
                <Tooltip
                  contentStyle={{ background: "var(--surface)", border: `1px solid ${border}`, borderRadius: 12, fontSize: 12 }}
                  cursor={{ fill: "rgba(148,163,184,0.08)" }}
                  formatter={(v: number, _: string, props: any) => [
                    `${v.toFixed(4)} USDT`,
                    props.payload?.jalaliLabel,
                  ]}
                />
                <Bar dataKey="pnl" radius={[6, 6, 0, 0]}>
                  {monthlyData.map((row, i) => (
                    <Cell key={i} fill={row.pnl >= 0 ? "url(#mbar-up)" : "url(#mbar-down)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

function DashboardInner() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    dashboardApi
      .get()
      .then(setData)
      .catch(() => setError("بارگذاری داشبورد با خطا مواجه شد."));
  }, []);

  if (error) return <p className="text-loss">{error}</p>;
  if (!data) return <Spinner label="در حال بارگذاری داشبورد…" />;

  const border = "rgba(148,163,184,0.18)";
  const muted = cssVar("--muted") || "#888";

  // Moving average (window 3) over the equity curve.
  const equity = data.equityCurve.map((p, i, arr) => {
    const start = Math.max(0, i - 2);
    const slice = arr.slice(start, i + 1);
    const ma = slice.reduce((s, x) => s + x.balance, 0) / slice.length;
    return { ...p, ma };
  });

  const symbolBars = [...data.topSymbols].sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, 8);

  return (
    <div className="relative space-y-7">
      {/* ── Ambient pastel glow backdrop ── */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="animate-blob absolute -right-32 top-0 h-[480px] w-[480px] rounded-full blur-[120px]" style={{ background: `rgba(${TINTS.mint},0.16)` }} />
        <div className="animate-blob-slow absolute -left-32 top-1/3 h-[440px] w-[440px] rounded-full blur-[120px]" style={{ background: `rgba(${TINTS.violet},0.14)` }} />
        <div className="animate-blob absolute bottom-0 right-1/4 h-[400px] w-[400px] rounded-full blur-[120px]" style={{ background: `rgba(${TINTS.sky},0.12)` }} />
      </div>

      {/* ── Title ── */}
      <div className="flex items-center gap-3">
        <h1
          className="text-3xl font-extrabold tracking-tight"
          style={{
            backgroundImage: `linear-gradient(120deg, rgb(${TINTS.mint}), rgb(${TINTS.sky}), rgb(${TINTS.violet}))`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          داشبورد
        </h1>
        <span className="h-2.5 w-2.5 rounded-full animate-pulse-dot" style={{ background: `rgb(${TINTS.mint})` }} />
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard
          label="تعداد معاملات"
          value={faNum(data.tradeCount)}
          sub={`${faNum(data.closedCount)} بسته‌شده`}
          tint={TINTS.sky}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            </svg>
          }
        />
        <KpiCard
          label="ضریب سود (PF)"
          value={formatRatio(data.profitFactor)}
          tint={TINTS.violet}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
            </svg>
          }
        />
        <KpiCard
          label="میانگین ریسک به ریوارد RR"
          value={formatRatio(data.avgRR)}
          tint={TINTS.mint}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.5" fill="currentColor" />
            </svg>
          }
        />
        <KpiCard
          label="وین ریت"
          value={formatPct((data.winRate ?? 0) * 100)}
          tint={TINTS.amber}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
          }
        />
        <BalanceCard data={data} />
      </div>

      {/* ── Equity curve + MA ── */}
      <ChartCard title="منحنی موجودی (Equity) + میانگین متحرک" dot={TINTS.sky}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={equity}>
            <defs>
              <linearGradient id="equity-line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={`rgb(${TINTS.sky})`} />
                <stop offset="50%" stopColor={`rgb(${TINTS.mint})`} />
                <stop offset="100%" stopColor={`rgb(${TINTS.violet})`} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={border} strokeDasharray="3 3" />
            <XAxis dataKey="number" stroke={muted} fontSize={12} />
            <YAxis stroke={muted} fontSize={12} width={60} tickFormatter={(v) => `$${v}`} />
            <Tooltip {...tooltipStyle(border)} formatter={(v: number) => [`$${v.toFixed(0)}`, ""]} />
            <Line type="monotone" dataKey="balance" name="موجودی" stroke="url(#equity-line)" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="ma" name="MA(3)" stroke={`rgb(${TINTS.amber})`} strokeWidth={2} strokeDasharray="5 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-3 flex justify-center gap-6 text-xs">
          <Legend color={`rgb(${TINTS.mint})`} label="موجودی" />
          <Legend color={`rgb(${TINTS.amber})`} label="MA(3)" dashed />
        </div>
      </ChartCard>

      {/* ── Daily P&L Calendar ── */}
      <DailyPnLSection pnlByDay={data.pnlByDay} walletMargin={data.currentBalance} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Symbol analysis bar chart */}
        {symbolBars.length > 0 && (
          <ChartCard title="تحلیل نمادها (سود/زیان)" dot={TINTS.violet}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={symbolBars} layout="vertical">
                <defs>
                  <linearGradient id="sym-up" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={`rgb(${TINTS.green})`} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={`rgb(${TINTS.mint})`} stopOpacity={0.95} />
                  </linearGradient>
                  <linearGradient id="sym-down" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={`rgb(${TINTS.red})`} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={`rgb(${TINTS.rose})`} stopOpacity={0.95} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={border} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" stroke={muted} fontSize={11} tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="symbol" stroke={muted} fontSize={11} width={55} />
                <Tooltip {...tooltipStyle(border)} cursor={{ fill: "rgba(148,163,184,0.08)" }} formatter={(v: number) => [`$${v.toFixed(2)}`, "P&L"]} />
                <Bar dataKey="pnl" name="P&L" radius={[0, 6, 6, 0]}>
                  {symbolBars.map((s, i) => (
                    <Cell key={i} fill={s.pnl >= 0 ? "url(#sym-up)" : "url(#sym-down)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Direction split donut */}
        <ChartCard title="تفکیک جهت معاملات" dot={TINTS.mint}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={[
                  { name: "Long", value: data.directionStats.long },
                  { name: "Short", value: data.directionStats.short },
                ]}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={95}
                paddingAngle={4}
                cornerRadius={8}
              >
                <Cell fill={`rgb(${TINTS.mint})`} />
                <Cell fill={`rgb(${TINTS.rose})`} />
              </Pie>
              <Tooltip {...tooltipStyle(border)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 text-sm">
            <Legend color={`rgb(${TINTS.mint})`} label={`Long: ${faNum(data.directionStats.long)}`} />
            <Legend color={`rgb(${TINTS.rose})`} label={`Short: ${faNum(data.directionStats.short)}`} />
          </div>
        </ChartCard>

        {/* Checklist discipline gauge */}
        <ChartCard title="انضباط و ریسک — چک‌لیست" dot={TINTS.amber}>
          <div className="flex h-[260px] flex-col items-center justify-center gap-4">
            <div className="relative grid h-40 w-40 place-items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <defs>
                    <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={`rgb(${TINTS.mint})`} />
                      <stop offset="100%" stopColor={`rgb(${TINTS.sky})`} />
                    </linearGradient>
                  </defs>
                  <Pie
                    data={[
                      { name: "done", value: (data.checklistDiscipline ?? 0) * 100 },
                      { name: "rest", value: Math.max(0, 100 - (data.checklistDiscipline ?? 0) * 100) },
                    ]}
                    dataKey="value"
                    innerRadius={60}
                    outerRadius={76}
                    startAngle={90}
                    endAngle={-270}
                    cornerRadius={8}
                  >
                    <Cell fill="url(#gauge-grad)" />
                    <Cell fill="rgba(148,163,184,0.14)" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute text-2xl font-extrabold" style={{ color: `rgb(${TINTS.mint})` }}>
                {formatPct((data.checklistDiscipline ?? 0) * 100, 0)}
              </div>
            </div>
            <p className="text-sm text-muted">میانگین رعایت چک‌لیست در معاملات</p>
            <div className="grid w-full grid-cols-3 gap-2 text-center text-xs">
              <MiniStat label="وین ریت" value={formatPct((data.winRate ?? 0) * 100)} tint={TINTS.green} />
              <MiniStat label="PF" value={formatRatio(data.profitFactor)} tint={TINTS.violet} />
              <MiniStat label="میانگین RR" value={formatRatio(data.avgRR)} tint={TINTS.mint} />
            </div>
          </div>
        </ChartCard>

        {/* Top symbols table */}
        <ChartCard title="برترین نمادها" dot={TINTS.rose}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted">
                <tr className="border-b border-white/5 text-center">
                  <th className="py-2 pr-2 text-right">نماد</th>
                  <th className="py-2">تعداد</th>
                  <th className="py-2">P&amp;L</th>
                  <th className="py-2">معادل تومانی</th>
                </tr>
              </thead>
              <tbody>
                {data.topSymbols.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted">داده‌ای موجود نیست</td>
                  </tr>
                )}
                {data.topSymbols.map((s) => (
                  <tr key={s.symbol} className="border-b border-white/5 transition hover:bg-white/5">
                    <td className="py-2.5 pr-2 font-bold" dir="ltr">{s.symbol}</td>
                    <td className="py-2.5 text-center">{faNum(s.count)}</td>
                    <td className={`py-2.5 text-center font-semibold ${pnlColorClass(s.pnl)}`} dir="ltr">{formatUsd(s.pnl)}</td>
                    <td className="py-2.5 text-center text-muted">{formatToman(s.pnl, data.usdtIrt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function tooltipStyle(border: string) {
  return {
    contentStyle: {
      background: "var(--surface)",
      border: `1px solid ${border}`,
      borderRadius: 12,
      color: "var(--text)",
      fontSize: 12,
    },
  };
}

function KpiCard({
  label,
  value,
  sub,
  tint,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tint: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="group relative overflow-hidden rounded-3xl p-5 transition-all duration-300 hover:-translate-y-1.5"
      style={glassTint(tint)}
    >
      {/* top sheen */}
      <div
        className="absolute inset-x-6 top-0 h-px animate-sheen"
        style={{ background: `linear-gradient(90deg, transparent, rgba(${tint},0.8), transparent)` }}
      />
      {/* corner glow */}
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-70 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `rgba(${tint},0.3)` }}
      />
      <div className="relative flex items-center justify-between">
        <div className="text-xs font-medium text-muted">{label}</div>
        {icon && (
          <div
            className="grid h-9 w-9 place-items-center rounded-2xl"
            style={{ background: `rgba(${tint},0.16)`, color: `rgb(${tint})`, border: `1px solid rgba(${tint},0.25)` }}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="relative mt-3 text-3xl font-extrabold tracking-tight" style={{ color: `rgb(${tint})` }} dir="ltr">
        {value}
      </div>
      {sub && <div className="relative mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function BalanceCard({ data }: { data: DashboardData }) {
  const tint = TINTS.rose;
  return (
    <div
      className="group relative col-span-2 overflow-hidden rounded-3xl p-5 transition-all duration-300 hover:-translate-y-1.5 lg:col-span-1"
      style={glassTint(tint)}
    >
      <div
        className="absolute inset-x-6 top-0 h-px animate-sheen"
        style={{ background: `linear-gradient(90deg, transparent, rgba(${tint},0.8), transparent)` }}
      />
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-70 blur-2xl"
        style={{ background: `rgba(${tint},0.3)` }}
      />
      <div className="relative flex items-center justify-between">
        <div className="text-xs font-medium text-muted">موجودی فعلی</div>
        <div
          className="grid h-9 w-9 place-items-center rounded-2xl"
          style={{ background: `rgba(${tint},0.16)`, color: `rgb(${tint})`, border: `1px solid rgba(${tint},0.25)` }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
          </svg>
        </div>
      </div>
      <div className="relative mt-3 text-2xl font-extrabold tracking-tight" style={{ color: `rgb(${TINTS.green})` }} dir="ltr">
        {formatUsd(data.currentBalance)}
      </div>
      <div className="relative text-xs text-muted">{formatToman(data.currentBalance, data.usdtIrt)}</div>
      <div className="relative mt-1 h-9">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.equityCurve}>
            <defs>
              <linearGradient id="bal-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`rgb(${TINTS.rose})`} stopOpacity={0.35} />
                <stop offset="100%" stopColor={`rgb(${TINTS.rose})`} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="balance" stroke={`rgb(${TINTS.rose})`} fill="url(#bal-area)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <div
      className="rounded-2xl p-2.5 backdrop-blur"
      style={{ background: `rgba(${tint},0.1)`, border: `1px solid rgba(${tint},0.2)` }}
    >
      <div className="text-muted">{label}</div>
      <div className="mt-0.5 font-bold" style={{ color: `rgb(${tint})` }}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children, dot }: { title: string; children: React.ReactNode; dot?: string }) {
  return (
    <div className="glass relative overflow-hidden p-6">
      <div className="mb-4 flex items-center gap-2">
        {dot && <span className="h-2 w-2 rounded-full" style={{ background: `rgb(${dot})`, boxShadow: `0 0 8px rgb(${dot})` }} />}
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="inline-block h-0.5 w-6 rounded"
        style={{
          background: color,
          borderTop: dashed ? `2px dashed ${color}` : undefined,
        }}
      />
      {label}
    </span>
  );
}
