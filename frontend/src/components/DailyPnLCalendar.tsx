"use client";

/**
 * Combined daily P&L calendar (Jalali) — the same calendar/bar view used on the
 * authenticated dashboard, styled for the dark landing showcase. Takes a
 * pnlByDay series and a base capital (for the % figures).
 *
 * Optional `trades` enables day-click detail: tapping a day shows that day's
 * trades with per-trade and total PnL.
 */
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { JALALI_MONTHS, formatJalaliDate, getJalaliParts, jalaliDaysInMonth, jalaliToGregorianDate, toPersianDigits } from "@/lib/jalali";
import { buildMonthlyData, buildWeeklyData } from "@/lib/pnl";
import { formatSignedUsd, pnlColorClass } from "@/lib/format";

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

/** Minimal trade shape for day-detail panel (anonymous public journal). */
export interface DayTradeItem {
  id: string;
  symbol: string;
  direction: string;
  status: string;
  openDate: string | null;
  closeDate: string | null;
  pnl: number | null;
  source?: string | null;
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

/** Compact PnL for narrow calendar cells (mobile-first). Avoids "12.345678 USDT" overflow. */
function fmtCompactPnl(v: number): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  let body: string;
  if (abs >= 100) body = abs.toFixed(0);
  else if (abs >= 10) body = abs.toFixed(1);
  else if (abs >= 1) body = abs.toFixed(2);
  else body = abs.toFixed(2);
  return `${v < 0 ? "-" : "+"}${body}`;
}

function fmtPctCompact(v: number, base: number): string {
  if (base <= 0 || v === 0) return "";
  const pct = (v / base) * 100;
  const abs = Math.abs(pct);
  const body = abs >= 10 ? abs.toFixed(0) : abs >= 1 ? abs.toFixed(1) : abs.toFixed(2);
  return `${pct >= 0 ? "+" : "-"}${body}٪`;
}

const WEEKDAYS_SHORT = ["د", "س", "چ", "پ", "ج", "ش", "ی"] as const;
const WEEKDAYS_FULL = ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه", "یکشنبه"] as const;

/** Day key used for PnL attribution (close date, else open date) — matches backend. */
function tradeDayKey(t: DayTradeItem): string | null {
  const raw = t.closeDate || t.openDate;
  return raw ? raw.slice(0, 10) : null;
}

export function DailyPnLCalendar({
  pnlByDay,
  walletMargin,
  trades,
}: {
  pnlByDay: { date: string; pnl: number }[];
  walletMargin: number;
  trades?: DayTradeItem[];
}) {
  const today = new Date();
  const todayJp = getJalaliParts(today.toISOString().slice(0, 10));
  const [jViewYear, setJViewYear] = useState(todayJp?.year ?? 1404);
  const [jViewMonth, setJViewMonth] = useState(todayJp?.month ?? 1);
  const [chartType, setChartType] = useState<"calendar" | "bar">("calendar");
  const [profitView, setProfitView] = useState<"daily" | "weekly" | "monthly">("daily");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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

  const dayTrades = useMemo(() => {
    if (!selectedDate || !trades) return [];
    return trades.filter((t) => tradeDayKey(t) === selectedDate);
  }, [selectedDate, trades]);

  const dayTradesPnl = useMemo(
    () => dayTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0),
    [dayTrades],
  );

  const prevMonth = () => {
    if (jViewMonth === 1) { setJViewYear((y) => y - 1); setJViewMonth(12); }
    else setJViewMonth((m) => m - 1);
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (jViewMonth === 12) { setJViewYear((y) => y + 1); setJViewMonth(1); }
    else setJViewMonth((m) => m + 1);
    setSelectedDate(null);
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

  const onDayClick = (date: string | null) => {
    if (!trades || !date) return;
    setSelectedDate((prev) => (prev === date ? null : date));
  };

  const selectedJp = selectedDate ? getJalaliParts(selectedDate) : null;
  const selectedDayPnl = selectedDate ? (pnlMap.get(selectedDate) ?? dayTradesPnl) : 0;
  const selectedRgb = selectedDayPnl > 0 ? TINTS.green : selectedDayPnl < 0 ? TINTS.red : TINTS.sky;

  return (
    <div className="overflow-hidden rounded-3xl" style={{ background: GLASS_BG, border: `1px solid ${GLASS_BORDER}` }}>
      {/* Card header */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 p-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full animate-pulse-dot" style={{ background: `rgb(${TINTS.mint})` }} />
            <span className="text-base font-bold">سود و زیان روزانه</span>
          </div>
          {todayPnl !== null && (
            <div className="mt-1 text-sm font-semibold" style={{ color: `rgb(${todayPnl >= 0 ? TINTS.green : TINTS.red})` }} dir="ltr">
              Today: {todayPnl >= 0 ? "+" : ""}{todayPnl.toFixed(4)} USDT
            </div>
          )}
          {trades && chartType === "calendar" && profitView === "daily" && (
            <p className="mt-1 text-[11px] text-white/45">برای دیدن معاملات هر روز، روی آن روز کلیک کنید</p>
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

      {/* Calendar view (daily) — mobile-first: compact numbers, no overflow */}
      {chartType === "calendar" && profitView === "daily" && (
        <div className="p-2 sm:p-4 md:p-5">
          <div className="mb-1.5 grid grid-cols-7 gap-0.5 sm:mb-2 sm:gap-1.5">
            {WEEKDAYS_FULL.map((d, idx) => (
              <div key={d} className="min-w-0 py-1 text-center text-[9px] font-medium text-white/55 sm:text-[10px]">
                <span className="sm:hidden">{WEEKDAYS_SHORT[idx]}</span>
                <span className="hidden sm:inline">{d}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1.5">
            {calendarCells.map((cell, i) => {
              if (!cell.day) return <div key={i} className="min-w-0" />;
              const rgb = cell.pnl > 0 ? TINTS.green : cell.pnl < 0 ? TINTS.red : null;
              const isSelected = selectedDate === cell.date;
              const clickable = !!trades;
              const cellStyle: React.CSSProperties = rgb
                ? { background: `linear-gradient(150deg, rgba(${rgb},0.22), rgba(${rgb},0.06))`, border: `1px solid rgba(${rgb},${isSelected ? 0.7 : 0.3})` }
                : { background: GLASS_BG, border: `1px solid ${isSelected ? `rgba(${TINTS.mint},0.7)` : GLASS_BORDER}` };
              const pctLabel = walletMargin > 0 && cell.pnl !== 0 ? fmtPctCompact(cell.pnl, walletMargin) : "";
              return (
                <div
                  key={i}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={() => onDayClick(cell.date)}
                  onKeyDown={(e) => {
                    if (clickable && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onDayClick(cell.date);
                    }
                  }}
                  title={cell.pnl !== 0 ? `${cell.pnl >= 0 ? "+" : ""}${cell.pnl.toFixed(4)} USDT${pctLabel ? ` (${pctLabel})` : ""}` : undefined}
                  className={`flex min-h-[58px] min-w-0 flex-col overflow-hidden rounded-lg p-1 transition-all duration-300 sm:min-h-[72px] sm:rounded-2xl sm:p-1.5 md:min-h-[78px] md:p-2 ${clickable ? "cursor-pointer hover:-translate-y-0.5" : ""} ${isSelected ? "ring-2 ring-offset-0" : ""}`}
                  style={{
                    ...cellStyle,
                    ...(cell.isToday && !isSelected ? { boxShadow: `0 0 0 1.5px rgb(${TINTS.mint}), 0 8px 18px -10px rgba(${TINTS.mint},0.6)` } : {}),
                    ...(isSelected ? { boxShadow: `0 0 0 2px rgb(${TINTS.violet}), 0 12px 28px -10px rgba(${TINTS.violet},0.7)` } : {}),
                  }}
                >
                  <div className="flex shrink-0 items-start justify-between gap-0.5">
                    <span className="text-[11px] font-bold leading-none text-white sm:text-sm">
                      {cell.day !== null ? toPersianDigits(cell.day) : ""}
                    </span>
                    {cell.jalaliDay != null && (
                      <span className="hidden text-[9px] leading-none text-white/45 sm:inline">{cell.jalaliDay}</span>
                    )}
                  </div>
                  <div
                    className="mt-auto min-w-0 w-full overflow-hidden pt-0.5"
                    style={{ color: rgb ? `rgb(${rgb})` : "rgba(255,255,255,0.5)" }}
                  >
                    <div
                      className="truncate text-center text-[8px] font-bold leading-tight tabular-nums sm:text-[9px] md:text-[10px]"
                      dir="ltr"
                    >
                      {fmtCompactPnl(cell.pnl)}
                    </div>
                    {pctLabel && (
                      <div
                        className="truncate text-center text-[7px] font-semibold leading-tight opacity-75 tabular-nums sm:text-[8px] md:text-[9px]"
                        dir="ltr"
                      >
                        {pctLabel}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Day detail panel */}
          {selectedDate && trades && (
            <div
              className="mt-5 overflow-hidden rounded-2xl"
              style={{
                background: `linear-gradient(150deg, rgba(${selectedRgb},0.12), rgba(255,255,255,0.03))`,
                border: `1px solid rgba(${selectedRgb},0.28)`,
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div>
                  <div className="text-sm font-bold">
                    معاملات{" "}
                    {selectedJp
                      ? `${toPersianDigits(selectedJp.day)} ${selectedJp.monthName} ${toPersianDigits(selectedJp.year)}`
                      : formatJalaliDate(selectedDate)}
                  </div>
                  <div className="mt-0.5 text-xs text-white/50" dir="ltr">{selectedDate}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-left">
                    <div className="text-[11px] text-white/55">مجموع روز</div>
                    <div className="text-base font-extrabold" style={{ color: `rgb(${selectedRgb})` }} dir="ltr">
                      {selectedDayPnl >= 0 ? "+" : ""}{selectedDayPnl.toFixed(4)} USDT
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedDate(null)}
                    className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
                    style={{ border: `1px solid ${GLASS_BORDER}` }}
                  >
                    بستن
                  </button>
                </div>
              </div>

              {dayTrades.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-white/50">معامله‌ای برای این روز ثبت نشده است.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-white/55">
                      <tr className="border-b border-white/10 text-center">
                        <th className="p-3 text-right text-xs font-semibold">نماد</th>
                        <th className="p-3 text-xs font-semibold">جهت</th>
                        <th className="p-3 text-xs font-semibold">تاریخ</th>
                        <th className="p-3 text-xs font-semibold">نتیجه</th>
                        <th className="p-3 text-xs font-semibold">وضعیت</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayTrades.map((t) => {
                        const up = (t.pnl ?? 0) >= 0;
                        const drgb = t.direction === "LONG" ? TINTS.green : TINTS.red;
                        return (
                          <tr key={t.id} className="border-b border-white/5">
                            <td className="p-3 text-right font-medium" dir="ltr">
                              {t.symbol || "—"}
                              {t.source === "toobit" && (
                                <span className="ml-1 inline-block rounded-md border border-sky-400/40 bg-sky-400/15 px-1.5 py-0.5 align-middle text-[9px] font-bold text-sky-300">toobit</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: `rgba(${drgb},0.16)`, color: `rgb(${drgb})` }}>
                                {t.direction === "LONG" ? "Long" : "Short"}
                              </span>
                            </td>
                            <td className="p-3 text-center text-white/70">{formatJalaliDate(t.closeDate || t.openDate)}</td>
                            <td className="p-3 text-center" dir="ltr">
                              <span className={pnlColorClass(t.pnl)}>{formatSignedUsd(t.pnl)}</span>
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className="rounded-full px-2.5 py-1 text-xs font-semibold"
                                style={{
                                  background: `rgba(${t.status === "CLOSED" ? (up ? TINTS.green : TINTS.red) : TINTS.sky},0.16)`,
                                  color: `rgb(${t.status === "CLOSED" ? (up ? TINTS.green : TINTS.red) : TINTS.sky})`,
                                }}
                              >
                                {t.status === "CLOSED" ? "بسته‌شده" : t.status === "OPEN" ? "باز" : "برنامه‌ریزی"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
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
