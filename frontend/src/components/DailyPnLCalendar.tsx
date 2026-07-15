"use client";

/**
 * Combined daily P&L calendar (Jalali) — the same calendar/bar view used on the
 * authenticated dashboard, styled for the dark landing showcase. Takes a
 * pnlByDay series and a base capital (for the % figures).
 */
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { JALALI_MONTHS, getJalaliParts, jalaliDaysInMonth, jalaliToGregorianDate, toPersianDigits } from "@/lib/jalali";
import { buildMonthlyData, buildWeeklyData } from "@/lib/pnl";

const TINTS = {
  mint: "94,234,212",
  violet: "167,139,250",
  sky: "125,211,252",
  green: "52,211,153",
  red: "251,146,160",
} as const;

const GLASS_BG = "rgba(255,255,255,0.04)";
const GLASS_BORDER = "rgba(255,255,255,0.12)";
const CHART_BG = "#0b1e3d";
const border = "rgba(255,255,255,0.12)";

interface CalCell {
  day: number | null;
  date: string | null;
  pnl: number;
  jalaliDay: number | null;
  isToday: boolean;
}

function buildJalaliMonthGrid(jy: number, jm: number, pnlMap: Map<string, number>): CalCell[] {
  const todayIso = new Date().toISOString().slice(0, 10);
  const totalDays = jalaliDaysInMonth(jy, jm);
  const firstIso = jalaliToGregorianDate(jy, jm, 1);
  const firstDow = new Date(`${firstIso}T12:00:00`).getDay();
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;

  const cells: CalCell[] = [];
  for (let i = 0; i < startOffset; i++) {
    cells.push({ day: null, date: null, pnl: 0, jalaliDay: null, isToday: false });
  }
  for (let jd = 1; jd <= totalDays; jd++) {
    const isoDate = jalaliToGregorianDate(jy, jm, jd);
    const pnl = pnlMap.get(isoDate) ?? 0;
    const gregDay = parseInt(isoDate.split("-")[2], 10);
    cells.push({ day: jd, date: isoDate, pnl, jalaliDay: gregDay, isToday: isoDate === todayIso });
  }
  return cells;
}

function fmtUsdt(v: number): string {
  if (v === 0) return "0";
  return `${v.toFixed(6)} USDT`;
}

export function DailyPnLCalendar({ pnlByDay, walletMargin }: { pnlByDay: { date: string; pnl: number }[]; walletMargin: number }) {
  const today = new Date();
  const todayJp = getJalaliParts(today.toISOString().slice(0, 10));
  const [jViewYear, setJViewYear] = useState(todayJp?.year ?? 1404);
  const [jViewMonth, setJViewMonth] = useState(todayJp?.month ?? 1);
  const [chartType, setChartType] = useState<"calendar" | "bar">("calendar");
  const [profitView, setProfitView] = useState<"daily" | "weekly" | "monthly">("daily");

  const pnlMap = useMemo(() => {
    const m = new Map<string, number>();
    pnlByDay.forEach(({ date, pnl }) => m.set(date.slice(0, 10), pnl));
    return m;
  }, [pnlByDay]);

  const todayStr = today.toISOString().slice(0, 10);
  const todayPnl = pnlMap.get(todayStr) ?? null;

  const calendarCells = useMemo(() => buildJalaliMonthGrid(jViewYear, jViewMonth, pnlMap), [jViewYear, jViewMonth, pnlMap]);
  const monthlyData = useMemo(() => buildMonthlyData(pnlByDay), [pnlByDay]);
  const weeklyData = useMemo(() => buildWeeklyData(pnlByDay), [pnlByDay]);

  const prevMonth = () => {
    if (jViewMonth === 1) { setJViewYear((y) => y - 1); setJViewMonth(12); }
    else setJViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (jViewMonth === 12) { setJViewYear((y) => y + 1); setJViewMonth(1); }
    else setJViewMonth((m) => m + 1);
  };

  const dailyBarData = calendarCells.filter((c) => c.day !== null).map((c) => ({ day: c.day, jalaliDay: c.jalaliDay, pnl: c.pnl }));

  const pill = (active: boolean, rgb: string = TINTS.mint): React.CSSProperties =>
    active
      ? {
          background: `linear-gradient(135deg, rgba(${rgb},0.9), rgba(${rgb},0.6))`,
          border: `1px solid rgba(${rgb},0.5)`,
          color: "#0a1622",
          boxShadow: `0 8px 22px -8px rgba(${rgb},0.6)`,
        }
      : { background: GLASS_BG, border: `1px solid ${GLASS_BORDER}`, color: "rgba(255,255,255,0.6)" };

  const tooltipContent = { background: CHART_BG, border: `1px solid ${border}`, borderRadius: 12, fontSize: 12, color: "#fff" };

  return (
    <div className="overflow-hidden rounded-3xl" style={{ background: GLASS_BG, border: `1px solid ${GLASS_BORDER}` }}>
      {/* Card header */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 p-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full animate-pulse-dot" style={{ background: `rgb(${TINTS.mint})` }} />
            <span className="text-base font-bold">سود و زیان روزانه (ترکیبی)</span>
          </div>
          {todayPnl !== null && (
            <div className="mt-1 text-sm font-semibold" style={{ color: `rgb(${todayPnl >= 0 ? TINTS.green : TINTS.red})` }} dir="ltr">
              Today: {todayPnl >= 0 ? "+" : ""}{todayPnl.toFixed(4)} USDT
            </div>
          )}
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setChartType("calendar")} className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all duration-300" style={pill(chartType === "calendar", TINTS.violet)}>
            تقویم
          </button>
          <button onClick={() => setChartType("bar")} className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all duration-300" style={pill(chartType === "bar", TINTS.violet)}>
            نمودار میله‌ای
          </button>
        </div>
      </div>

      {/* Month nav + profit view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="flex h-8 w-8 items-center justify-center rounded-full text-sm transition hover:-translate-y-0.5" style={{ background: GLASS_BG, border: `1px solid ${GLASS_BORDER}` }}>‹</button>
          <div className="text-sm font-medium">
            <span className="font-bold" style={{ color: `rgb(${TINTS.mint})` }}>{JALALI_MONTHS[jViewMonth - 1]} {toPersianDigits(jViewYear)}</span>
          </div>
          <button onClick={nextMonth} className="flex h-8 w-8 items-center justify-center rounded-full text-sm transition hover:-translate-y-0.5" style={{ background: GLASS_BG, border: `1px solid ${GLASS_BORDER}` }}>›</button>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setProfitView("daily")} className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition" style={pill(profitView === "daily", TINTS.sky)}>روزانه</button>
          <button onClick={() => setProfitView("weekly")} className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition" style={pill(profitView === "weekly", TINTS.sky)}>هفتگی</button>
          <button onClick={() => setProfitView("monthly")} className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition" style={pill(profitView === "monthly", TINTS.sky)}>ماهانه</button>
        </div>
      </div>

      {/* Calendar view (daily) */}
      {chartType === "calendar" && profitView === "daily" && (
        <div className="p-5">
          <div className="mb-2 grid grid-cols-7 gap-1.5">
            {["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه", "یکشنبه"].map((d) => (
              <div key={d} className="py-1 text-center text-[10px] font-medium text-white/55">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {calendarCells.map((cell, i) => {
              if (!cell.day) return <div key={i} />;
              const rgb = cell.pnl > 0 ? TINTS.green : cell.pnl < 0 ? TINTS.red : null;
              const cellStyle: React.CSSProperties = rgb
                ? { background: `linear-gradient(150deg, rgba(${rgb},0.22), rgba(${rgb},0.06))`, border: `1px solid rgba(${rgb},0.3)` }
                : { background: GLASS_BG, border: `1px solid ${GLASS_BORDER}` };
              return (
                <div
                  key={i}
                  className="flex min-h-[78px] flex-col rounded-2xl p-2 transition-all duration-300 hover:-translate-y-0.5"
                  style={{ ...cellStyle, ...(cell.isToday ? { boxShadow: `0 0 0 2px rgb(${TINTS.mint}), 0 10px 24px -10px rgba(${TINTS.mint},0.6)` } : {}) }}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-sm font-bold leading-none text-white">{cell.day !== null ? toPersianDigits(cell.day) : ""}</span>
                    {cell.jalaliDay && <span className="text-[9px] leading-none text-white/45">{cell.jalaliDay}</span>}
                  </div>
                  <div className="mt-auto text-[9px] font-semibold leading-tight" style={{ color: rgb ? `rgb(${rgb})` : "rgba(255,255,255,0.5)" }} dir="ltr">
                    {fmtUsdt(cell.pnl)}
                    {walletMargin > 0 && cell.pnl !== 0 && (
                      <div className="opacity-75">({cell.pnl >= 0 ? "+" : ""}{((cell.pnl / walletMargin) * 100).toFixed(2)}٪)</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Monthly list */}
      {chartType === "calendar" && profitView === "monthly" && (
        <div className="space-y-2 p-5">
          {monthlyData.length === 0 && <div className="py-10 text-center text-sm text-white/50">داده‌ای موجود نیست</div>}
          {monthlyData.map((row) => {
            const rgb = row.pnl >= 0 ? TINTS.green : TINTS.red;
            return (
              <div key={row.key} className="flex items-center justify-between rounded-2xl px-4 py-3 transition hover:-translate-y-0.5" style={{ background: `linear-gradient(135deg, rgba(${rgb},0.14), rgba(${rgb},0.03))`, border: `1px solid rgba(${rgb},0.22)` }}>
                <div className="text-sm font-bold">{row.jalaliLabel}</div>
                <div className="text-left">
                  <div className="text-base font-extrabold" style={{ color: `rgb(${rgb})` }} dir="ltr">{row.pnl >= 0 ? "+" : ""}{row.pnl.toFixed(4)} USDT</div>
                  {walletMargin > 0 && <div className="text-xs font-semibold opacity-75" style={{ color: `rgb(${rgb})` }} dir="ltr">({row.pnl >= 0 ? "+" : ""}{((row.pnl / walletMargin) * 100).toFixed(2)}٪)</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Weekly list */}
      {chartType === "calendar" && profitView === "weekly" && (
        <div className="space-y-2 p-5">
          {weeklyData.length === 0 && <div className="py-10 text-center text-sm text-white/50">داده‌ای موجود نیست</div>}
          {[...weeklyData].reverse().map((row) => {
            const rgb = row.pnl >= 0 ? TINTS.green : TINTS.red;
            return (
              <div key={row.key} className="flex items-center justify-between rounded-2xl px-4 py-3 transition hover:-translate-y-0.5" style={{ background: `linear-gradient(135deg, rgba(${rgb},0.14), rgba(${rgb},0.03))`, border: `1px solid rgba(${rgb},0.22)` }}>
                <div>
                  <div className="text-sm font-bold">{row.jalaliLabel}</div>
                  <div className="text-xs text-white/55" dir="ltr">{row.label}</div>
                </div>
                <div className="text-left">
                  <div className="text-base font-extrabold" style={{ color: `rgb(${rgb})` }} dir="ltr">{row.pnl >= 0 ? "+" : ""}{row.pnl.toFixed(4)} USDT</div>
                  {walletMargin > 0 && <div className="text-xs font-semibold opacity-75" style={{ color: `rgb(${rgb})` }} dir="ltr">({row.pnl >= 0 ? "+" : ""}{((row.pnl / walletMargin) * 100).toFixed(2)}٪)</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bar charts */}
      {chartType === "bar" && (
        <div className="p-5">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={profitView === "daily" ? dailyBarData : profitView === "weekly" ? weeklyData : monthlyData}
              barSize={profitView === "daily" ? 14 : profitView === "weekly" ? 24 : 30}
            >
              <defs>
                <linearGradient id="cal-bar-up" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={`rgb(${TINTS.mint})`} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={`rgb(${TINTS.green})`} stopOpacity={0.5} />
                </linearGradient>
                <linearGradient id="cal-bar-down" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={`rgb(${TINTS.red})`} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={`rgb(${TINTS.red})`} stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={border} vertical={false} />
              <XAxis
                dataKey={profitView === "daily" ? "day" : profitView === "weekly" ? "key" : "label"}
                stroke="rgba(255,255,255,0.5)"
                fontSize={profitView === "daily" ? 11 : 10}
                tickFormatter={(v) => (profitView === "daily" ? toPersianDigits(v) : v)}
              />
              <YAxis stroke="rgba(255,255,255,0.5)" fontSize={11} tickFormatter={(v) => `${v.toFixed(profitView === "daily" ? 1 : 0)}`} />
              <Tooltip
                contentStyle={tooltipContent}
                cursor={{ fill: "rgba(255,255,255,0.06)" }}
                formatter={(v: number, _n: string, props: any) => [
                  walletMargin > 0 ? `${v.toFixed(4)} USDT (${v >= 0 ? "+" : ""}${((v / walletMargin) * 100).toFixed(2)}٪)` : `${v.toFixed(4)} USDT`,
                  props.payload?.jalaliLabel ?? (props.payload?.day != null ? `روز ${toPersianDigits(props.payload.day)}` : ""),
                ]}
              />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                {(profitView === "daily" ? dailyBarData : profitView === "weekly" ? weeklyData : monthlyData).map((row: any, i: number) => (
                  <Cell key={i} fill={row.pnl >= 0 ? "url(#cal-bar-up)" : "url(#cal-bar-down)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
