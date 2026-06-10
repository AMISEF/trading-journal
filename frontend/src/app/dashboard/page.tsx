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

// ─── Daily P&L Calendar ──────────────────────────────────────────────────────

const GREGORIAN_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const GREGORIAN_MONTHS_FA = ["ژانویه","فوریه","مارس","آوریل","مه","ژوئن","جولای","اوت","سپتامبر","اکتبر","نوامبر","دسامبر"];

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

  const PROFIT_BG = "bg-green-50 dark:bg-green-950/30";
  const LOSS_BG = "bg-red-50 dark:bg-red-950/30";
  const ZERO_BG = "bg-surface";

  const border = cssVar("--border") || "#ddd";

  return (
    <div className="space-y-3">
      {/* ── Date-range filter bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setPreset("7d")}
          className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition ${
            preset === "7d" ? "border-primary bg-primary text-white" : "border-border bg-surface-2 text-text"
          }`}
        >
          Last 7D
        </button>
        <button
          onClick={() => setPreset("30d")}
          className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition ${
            preset === "30d" ? "border-primary bg-primary text-white" : "border-border bg-surface-2 text-text"
          }`}
        >
          Last 30D
        </button>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted shrink-0">
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <input
            type="date"
            className="w-28 bg-transparent text-sm text-text outline-none"
            value={customFrom}
            onChange={(e) => { setCustomFrom(e.target.value); setPreset("custom"); }}
            placeholder="Start Time"
          />
          <span className="text-muted">→</span>
          <input
            type="date"
            className="w-28 bg-transparent text-sm text-text outline-none"
            value={customTo}
            onChange={(e) => { setCustomTo(e.target.value); setPreset("custom"); }}
            placeholder="End Time"
          />
        </div>
      </div>

      {/* ── Cumulative profit ── */}
      <div className="text-sm" dir="ltr">
        <span className="text-muted">Cum. profit: </span>
        <span className={`font-semibold ${cumPnl >= 0 ? "text-profit" : "text-loss"}`}>
          {cumPnl >= 0 ? "" : ""}{cumPnl.toFixed(4)} USDT
        </span>
        <span className={`ml-1 ${cumPct >= 0 ? "text-profit" : "text-loss"}`}>
          ({cumPct >= 0 ? "+" : ""}{cumPct.toFixed(2)}%)
        </span>
      </div>

      {/* ── Main card ── */}
      <div className="tj-card overflow-hidden">
        {/* Card header */}
        <div className="flex items-start justify-between border-b border-border p-4">
          <div>
            <div className="font-bold">Daily P&L</div>
            {todayPnl !== null && (
              <div className={`mt-0.5 text-sm font-semibold ${todayPnl >= 0 ? "text-profit" : "text-loss"}`} dir="ltr">
                {todayPnl >= 0 ? "" : ""}{todayPnl.toFixed(4)} USDT
              </div>
            )}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setChartType("calendar")}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                chartType === "calendar" ? "border-primary bg-primary text-white" : "border-border bg-surface-2 text-muted hover:text-text"
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" />
              </svg>
              Calendar Chart
            </button>
            <button
              onClick={() => setChartType("bar")}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                chartType === "bar" ? "border-primary bg-primary text-white" : "border-border bg-surface-2 text-muted hover:text-text"
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
              </svg>
              Bar Chart
            </button>
          </div>
        </div>

        {/* Month nav + profit view toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-sm hover:bg-surface"
            >
              ‹
            </button>
            <div className="text-sm font-medium">
              {jalaliInfo && (
                <>
                  <span className="font-semibold">{jalaliInfo.monthName} {toPersianDigits(jalaliInfo.year)}</span>
                  <span className="mx-1 text-muted">/</span>
                  <span className="text-muted">{GREGORIAN_MONTHS[viewMonth - 1]} {viewYear}</span>
                </>
              )}
            </div>
            <button
              onClick={nextMonth}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-sm hover:bg-surface"
            >
              ›
            </button>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setProfitView("daily")}
              className={`rounded-lg border px-3 py-1 text-xs font-medium transition ${
                profitView === "daily" ? "border-primary text-primary" : "border-border text-muted hover:text-text"
              }`}
            >
              Daily Profit
            </button>
            <button
              onClick={() => setProfitView("monthly")}
              className={`rounded-lg border px-3 py-1 text-xs font-medium transition ${
                profitView === "monthly" ? "border-primary text-primary" : "border-border text-muted hover:text-text"
              }`}
            >
              Monthly Profit
            </button>
          </div>
        </div>

        {/* ── Calendar view ── */}
        {chartType === "calendar" && profitView === "daily" && (
          <div className="p-4">
            {/* Week headers */}
            <div className="mb-1 grid grid-cols-7 gap-1">
              {["Mon.", "Tue.", "Wed.", "Thu.", "Fri.", "Sat.", "Sun."].map((d) => (
                <div key={d} className="py-1 text-center text-xs text-muted">{d}</div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((cell, i) => {
                if (!cell.day) return <div key={i} />;
                const bg = cell.pnl > 0 ? PROFIT_BG : cell.pnl < 0 ? LOSS_BG : ZERO_BG;
                const valColor = cell.pnl > 0 ? "text-green-600" : cell.pnl < 0 ? "text-red-500" : "text-muted";
                return (
                  <div
                    key={i}
                    className={`${bg} ${cell.isToday ? "ring-1 ring-primary" : ""} flex min-h-[72px] flex-col rounded-lg p-1.5`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-sm font-bold leading-none text-text">{cell.day}</span>
                      {cell.jalaliDay && (
                        <span className="text-[9px] text-muted leading-none">{toPersianDigits(cell.jalaliDay)}</span>
                      )}
                    </div>
                    <div className={`mt-auto text-[9px] leading-tight font-medium ${valColor}`} dir="ltr">
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
          <div className="divide-y divide-border">
            {monthlyData.length === 0 && (
              <div className="py-10 text-center text-sm text-muted">داده‌ای موجود نیست</div>
            )}
            {monthlyData.map((row) => (
              <div
                key={row.key}
                className={`flex items-center justify-between px-4 py-3 ${
                  row.pnl > 0 ? "bg-green-50 dark:bg-green-950/20" : row.pnl < 0 ? "bg-red-50 dark:bg-red-950/20" : ""
                }`}
              >
                <div>
                  <div className="text-sm font-medium">{row.jalaliLabel}</div>
                  <div className="text-xs text-muted">{row.label}</div>
                </div>
                <div className={`text-sm font-bold ${row.pnl >= 0 ? "text-green-600" : "text-red-500"}`} dir="ltr">
                  {row.pnl >= 0 ? "+" : ""}{row.pnl.toFixed(4)} USDT
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Daily bar chart ── */}
        {chartType === "bar" && profitView === "daily" && (
          <div className="p-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dailyBarData} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke={border} vertical={false} />
                <XAxis dataKey="day" stroke={cssVar("--muted")} fontSize={11} />
                <YAxis stroke={cssVar("--muted")} fontSize={11} tickFormatter={(v) => `${v.toFixed(1)}`} />
                <Tooltip
                  contentStyle={{ background: "var(--surface)", border: `1px solid ${border}`, borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, _: string, props: any) => [
                    `${v.toFixed(4)} USDT`,
                    `Day ${props.payload?.day}${props.payload?.jalaliDay ? ` (${toPersianDigits(props.payload.jalaliDay)})` : ""}`,
                  ]}
                />
                <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                  {dailyBarData.map((c, i) => (
                    <Cell key={i} fill={c.pnl >= 0 ? "#16a34a" : "#dc2626"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Monthly bar chart ── */}
        {chartType === "bar" && profitView === "monthly" && (
          <div className="p-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke={border} vertical={false} />
                <XAxis dataKey="label" stroke={cssVar("--muted")} fontSize={10} />
                <YAxis stroke={cssVar("--muted")} fontSize={11} tickFormatter={(v) => `${v.toFixed(0)}`} />
                <Tooltip
                  contentStyle={{ background: "var(--surface)", border: `1px solid ${border}`, borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, _: string, props: any) => [
                    `${v.toFixed(4)} USDT`,
                    props.payload?.jalaliLabel,
                  ]}
                />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                  {monthlyData.map((row, i) => (
                    <Cell key={i} fill={row.pnl >= 0 ? "#16a34a" : "#dc2626"} />
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

  const profit = cssVar("--profit") || "#16a34a";
  const loss = cssVar("--loss") || "#dc2626";
  const primary = cssVar("--primary") || "#2563eb";
  const border = cssVar("--border") || "#ddd";
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">داشبورد</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="تعداد معاملات" value={faNum(data.tradeCount)} sub={`${faNum(data.closedCount)} بسته‌شده`} />
        <KpiCard label="ضریب سود (PF)" value={formatRatio(data.profitFactor)} />
        <KpiCard label="میانگین ریسک به ریوارد RR" value={formatRatio(data.avgRR)} />
        <KpiCard label="وین ریت" value={formatPct((data.winRate ?? 0) * 100)} />
        <BalanceCard data={data} />
      </div>

      {/* Equity curve + MA */}
      <ChartCard title="منحنی موجودی (Equity) + میانگین متحرک">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={equity}>
            <CartesianGrid stroke={border} strokeDasharray="3 3" />
            <XAxis dataKey="number" stroke={muted} fontSize={12} />
            <YAxis stroke={muted} fontSize={12} width={60} tickFormatter={(v) => `$${v}`} />
            <Tooltip {...tooltipStyle(border)} formatter={(v: number) => [`$${v.toFixed(0)}`, ""]} />
            <Line type="monotone" dataKey="balance" name="موجودی" stroke={primary} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="ma" name="MA(3)" stroke={profit} strokeWidth={2} strokeDasharray="5 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-2 flex justify-center gap-6 text-xs">
          <Legend color={primary} label="موجودی" />
          <Legend color={profit} label="MA(3)" dashed />
        </div>
      </ChartCard>

      {/* ── Daily P&L Calendar (new) ── */}
      <DailyPnLSection pnlByDay={data.pnlByDay} walletMargin={data.currentBalance} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Symbol analysis bar chart */}
        {symbolBars.length > 0 && (
          <ChartCard title="تحلیل نمادها (سود/زیان)">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={symbolBars} layout="vertical">
                <CartesianGrid stroke={border} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" stroke={muted} fontSize={11} tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="symbol" stroke={muted} fontSize={11} width={55} />
                <Tooltip {...tooltipStyle(border)} formatter={(v: number) => [`$${v.toFixed(2)}`, "P&L"]} />
                <Bar dataKey="pnl" name="P&L">
                  {symbolBars.map((s, i) => (
                    <Cell key={i} fill={s.pnl >= 0 ? profit : loss} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Direction split donut */}
        <ChartCard title="تفکیک جهت معاملات">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={[
                  { name: "Long", value: data.directionStats.long },
                  { name: "Short", value: data.directionStats.short },
                ]}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
              >
                <Cell fill={profit} />
                <Cell fill={loss} />
              </Pie>
              <Tooltip {...tooltipStyle(border)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 text-sm">
            <Legend color={profit} label={`Long: ${faNum(data.directionStats.long)}`} />
            <Legend color={loss} label={`Short: ${faNum(data.directionStats.short)}`} />
          </div>
        </ChartCard>

        {/* Checklist discipline gauge */}
        <ChartCard title="انضباط و ریسک — چک‌لیست">
          <div className="flex h-[240px] flex-col items-center justify-center gap-4">
            <div className="relative grid h-40 w-40 place-items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "done", value: (data.checklistDiscipline ?? 0) * 100 },
                      { name: "rest", value: Math.max(0, 100 - (data.checklistDiscipline ?? 0) * 100) },
                    ]}
                    dataKey="value"
                    innerRadius={58}
                    outerRadius={75}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <Cell fill={primary} />
                    <Cell fill={border} />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute text-2xl font-bold">
                {formatPct((data.checklistDiscipline ?? 0) * 100, 0)}
              </div>
            </div>
            <p className="text-sm text-muted">میانگین رعایت چک‌لیست در معاملات</p>
            <div className="grid w-full grid-cols-3 gap-2 text-center text-xs">
              <div className="tj-card p-2">
                <div className="text-muted">وین ریت</div>
                <div className="font-bold text-profit">{formatPct((data.winRate ?? 0) * 100)}</div>
              </div>
              <div className="tj-card p-2">
                <div className="text-muted">PF</div>
                <div className="font-bold">{formatRatio(data.profitFactor)}</div>
              </div>
              <div className="tj-card p-2">
                <div className="text-muted">میانگین ریسک به ریوارد RR</div>
                <div className="font-bold">{formatRatio(data.avgRR)}</div>
              </div>
            </div>
          </div>
        </ChartCard>

        {/* Top symbols table */}
        <ChartCard title="برترین نمادها">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted">
                <tr className="border-b border-border text-center">
                  <th className="py-2 pr-2 text-right">نماد</th>
                  <th className="py-2">تعداد</th>
                  <th className="py-2">P&L</th>
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
                  <tr key={s.symbol} className="border-b border-border/60">
                    <td className="py-2 pr-2 font-medium" dir="ltr">{s.symbol}</td>
                    <td className="py-2 text-center">{faNum(s.count)}</td>
                    <td className={`py-2 text-center ${pnlColorClass(s.pnl)}`} dir="ltr">{formatUsd(s.pnl)}</td>
                    <td className="py-2 text-center text-muted">{formatToman(s.pnl, data.usdtIrt)}</td>
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
      borderRadius: 8,
      color: "var(--text)",
      fontSize: 12,
    },
  };
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="tj-card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function BalanceCard({ data }: { data: DashboardData }) {
  const profit = cssVar("--profit") || "#16a34a";
  return (
    <div className="tj-card col-span-2 p-4 lg:col-span-1">
      <div className="text-xs text-muted">موجودی فعلی</div>
      <div className="mt-1 text-2xl font-bold text-profit" dir="ltr">
        {formatUsd(data.currentBalance)}
      </div>
      <div className="text-xs text-muted">{formatToman(data.currentBalance, data.usdtIrt)}</div>
      <div className="mt-1 h-8">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.equityCurve}>
            <Area type="monotone" dataKey="balance" stroke={profit} fill={profit} fillOpacity={0.15} strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="tj-card p-5">
      <h3 className="mb-4 text-sm font-bold">{title}</h3>
      {children}
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="h-0.5 w-6 rounded"
        style={{
          background: color,
          borderTop: dashed ? `2px dashed ${color}` : undefined,
          display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}
