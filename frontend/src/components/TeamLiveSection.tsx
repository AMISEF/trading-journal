"use client";

/**
 * برایند معاملات ربات الگو اسمارت — public landing-page showcase.
 *
 * Shows a *combined, anonymous* live view of the algo-bot accounts:
 *   • داشبورد معاملات  — one aggregated dashboard (each bot normalised to $1000)
 *   • لیست ژورنال      — one merged journal list of all the bots' trades
 *   • تحلیل معاملات با هوش مصنوعی — the two combined team AI analyses
 *
 * Reading is public; generating the AI analyses is admin-only (the analyze
 * button only appears for a logged-in admin, and disappears once generated).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  authApi,
  getToken,
  publicApi,
  type TeamAIData,
  type TeamSummary,
} from "@/lib/api";
import type { ChecklistTemplate, DashboardData, Trade } from "@/lib/types";
import { faNum, formatPct, formatRatio, formatSignedUsd, formatUsd, pnlColorClass } from "@/lib/format";
import { formatJalaliDate, formatJalaliDateTime, getJalaliParts, toPersianDigits } from "@/lib/jalali";
import { buildMonthlyData, buildWeeklyData } from "@/lib/pnl";
import { useLiveRefresh } from "@/lib/hooks";
import { Markdown } from "@/components/Markdown";
import { DailyPnLCalendar, type DayTradeItem } from "@/components/DailyPnLCalendar";
import { TradeTabs } from "@/components/editor/TradeTabs";
import { useTrade } from "@/store/trade";
import { Badge, StatusDot } from "@/components/ui";

/** How often public team dashboards/journals re-fetch. Toobit sync is ~60s; 15s keeps UI snappy. */
const LIVE_POLL_MS = 15_000;

const T = {
  accent: "25,195,179",
  mint: "94,234,212",
  violet: "167,139,250",
  sky: "125,211,252",
  rose: "244,114,182",
  green: "52,211,153",
  red: "251,146,160",
  amber: "251,191,36",
} as const;

const CHART_BG = "#0b1e3d";
const border = "rgba(255,255,255,0.12)";

function glass(): React.CSSProperties {
  return {
    background: "linear-gradient(155deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
    border: "1px solid rgba(255,255,255,0.10)",
    backdropFilter: "blur(20px) saturate(150%)",
    WebkitBackdropFilter: "blur(20px) saturate(150%)",
  };
}

function glassTint(rgb: string): React.CSSProperties {
  return {
    background: `linear-gradient(150deg, rgba(${rgb},0.18) 0%, rgba(${rgb},0.05) 48%, rgba(255,255,255,0.02) 100%)`,
    border: `1px solid rgba(${rgb},0.24)`,
    backdropFilter: "blur(18px) saturate(150%)",
    WebkitBackdropFilter: "blur(18px) saturate(150%)",
    boxShadow: `0 16px 48px -20px rgba(${rgb},0.4)`,
  };
}

const tooltipStyle = {
  contentStyle: { background: CHART_BG, border: `1px solid ${border}`, borderRadius: 12, fontSize: 12, color: "#fff" },
} as const;

type Tab = "dashboard" | "journal" | "ai" | "live";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "dashboard", label: "داشبورد معاملات", icon: <path d="M3 3v18h18M7 15l4-4 3 3 5-6" /> },
  {
    key: "journal",
    label: "لیست ژورنال",
    icon: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />,
  },
  {
    key: "ai",
    label: "تحلیل معاملات با هوش مصنوعی",
    icon: (
      <>
        <path d="M12 2a5 5 0 0 0-5 5c0 1.2.5 2.3 1.3 3.1L8 12l-1 3h10l-1-3-.3-1.9A5 5 0 0 0 17 7a5 5 0 0 0-5-5z" />
        <path d="M9 21h6M10 17.5v2M14 17.5v2" />
      </>
    ),
  },
  {
    key: "live",
    label: "برایند لایو ترید",
    icon: (
      <>
        <circle cx="12" cy="12" r="2" />
        <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" />
      </>
    ),
  },
];

export function TeamLiveSection({ showAiTab = true }: { showAiTab?: boolean } = {}) {
  const [summary, setSummary] = useState<TeamSummary | null>(null);
  const [hidden, setHidden] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [isAdmin, setIsAdmin] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const visibleTabs = useMemo(
    () => (showAiTab ? TABS : TABS.filter((t) => t.key !== "ai")),
    [showAiTab],
  );

  const refreshSummary = useCallback(async () => {
    try {
      const s = await publicApi.teamSummary();
      if (s.count === 0) {
        setHidden(true);
        setSummary(null);
      } else {
        setHidden(false);
        setSummary(s);
      }
    } catch {
      // First failure with no data yet: hide the section. Later failures keep the last snapshot.
      setSummary((prev) => {
        if (!prev) setHidden(true);
        return prev;
      });
    }
  }, []);

  useLiveRefresh(refreshSummary, LIVE_POLL_MS);

  useEffect(() => {
    // Detect admin (for the AI analyze button) without blocking the section.
    if (showAiTab && getToken()) {
      authApi.me().then((u) => setIsAdmin(u.role === "ADMIN")).catch(() => setIsAdmin(false));
    }
  }, [showAiTab]);

  const onDataTick = useCallback(() => setLastUpdated(new Date()), []);

  if (hidden) return null;
  if (!summary) {
    return (
      <section id="live" className="relative mx-auto max-w-7xl scroll-mt-24 px-5 py-16 md:px-8 md:py-24">
        <PanelSpinner />
      </section>
    );
  }

  return (
    <section id="live" className="relative mx-auto max-w-7xl scroll-mt-24 px-5 py-16 md:px-8 md:py-24">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-3xl text-center"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-red-400/40 bg-red-500/10 px-4 py-1.5 text-xs font-bold text-red-300">
          <LiveDot />
          LIVE
        </span>
        <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">برایند معاملات ربات الگو اسمارت</h2>
      </motion.div>

      <div className="mt-9 flex flex-wrap items-center justify-center gap-2.5">
        {visibleTabs.map((tb) => {
          const active = tab === tb.key;
          return (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition-all duration-300 hover:-translate-y-0.5"
              style={
                active
                  ? { background: `linear-gradient(120deg, rgba(${T.accent},0.95), rgba(${T.sky},0.75))`, color: "#06121f", boxShadow: `0 14px 34px -14px rgba(${T.accent},0.9)` }
                  : { ...glass(), color: "rgba(255,255,255,0.85)" }
              }
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                {tb.icon}
              </svg>
              {tb.label}
            </button>
          );
        })}
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="mt-8">
        {tab === "dashboard" && <DashboardPanel summary={summary} onUpdated={onDataTick} />}
        {tab === "journal" && <JournalPanel onUpdated={onDataTick} />}
        {tab === "ai" && <AIPanel isAdmin={isAdmin} onUpdated={onDataTick} />}
        {tab === "live" && <LiveTradePanel onUpdated={onDataTick} />}
      </motion.div>
    </section>
  );
}

function LiveDot() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
    </span>
  );
}

function PanelSpinner() {
  return (
    <div className="flex items-center justify-center gap-3 rounded-3xl p-12 text-sm text-white/60" style={glass()}>
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-transparent" />
      در حال بارگذاری…
    </div>
  );
}

function PanelEmpty({ text }: { text: string }) {
  return <div className="rounded-3xl p-12 text-center text-sm text-white/60" style={glass()}>{text}</div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard panel
// ═══════════════════════════════════════════════════════════════════════════
function toDayTrades(rows: Trade[]): DayTradeItem[] {
  return rows.map((t) => ({
    id: t.id,
    symbol: t.symbol || "",
    direction: t.direction,
    status: t.status,
    openDate: t.openDate,
    closeDate: t.closeDate,
    pnl: pnlOf(t),
    source: t.source ?? null,
  }));
}

function DashboardPanel({
  summary,
  onUpdated,
  dashboardFn = publicApi.teamDashboard,
  tradesFn = publicApi.teamTrades,
}: {
  summary: TeamSummary;
  onUpdated?: () => void;
  dashboardFn?: () => Promise<DashboardData>;
  tradesFn?: () => Promise<Trade[]>;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [dayTrades, setDayTrades] = useState<DayTradeItem[] | undefined>(undefined);
  const [error, setError] = useState(false);
  const hasData = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [dash, trades] = await Promise.all([dashboardFn(), tradesFn()]);
      setData(dash);
      setDayTrades(toDayTrades(trades));
      setError(false);
      hasData.current = true;
      onUpdated?.();
    } catch {
      // Keep previous snapshot if we already rendered once.
      if (!hasData.current) setError(true);
    }
  }, [onUpdated, dashboardFn, tradesFn]);

  useLiveRefresh(refresh, LIVE_POLL_MS);

  if (error) return <PanelEmpty text="بارگذاری داشبورد ممکن نشد." />;
  if (!data) return <PanelSpinner />;

  const equity = data.equityCurve.map((p) => ({ ...p, dateLabel: shortDate(p.date) }));
  const total = data.directionStats.long + data.directionStats.short;
  const wl = data.winLoss;
  const wlTotal = wl.win + wl.loss + wl.breakeven;
  const dirData = [
    { name: "Long", value: data.directionStats.long, rgb: T.mint },
    { name: "Short", value: data.directionStats.short, rgb: T.rose },
  ].filter((d) => d.value > 0);
  const wlData = [
    { name: "سودآور", value: wl.win, rgb: T.green },
    { name: "زیان‌ده", value: wl.loss, rgb: T.red },
    { name: "سربه‌سر", value: wl.breakeven, rgb: T.sky },
  ].filter((d) => d.value > 0);

  const base = summary.totalInitialCapital || 1000;
  const growth = data.currentBalance - base;
  const growthPct = base > 0 ? (growth / base) * 100 : 0;
  const monthly = buildMonthlyData(data.pnlByDay);
  const weekly = buildWeeklyData(data.pnlByDay);
  const curMonth = monthly.length ? monthly[monthly.length - 1] : null;
  const curWeek = weekly.length ? weekly[weekly.length - 1] : null;

  return (
    <div className="space-y-5">
      {/* Combined capital / growth box */}
      <CapitalBox base={base} current={data.currentBalance} growth={growth} growthPct={growthPct} weekPnl={curWeek?.pnl ?? null} monthPnl={curMonth?.pnl ?? null} />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="تعداد معاملات" value={faNum(data.tradeCount)} sub={`${faNum(data.closedCount)} بسته‌شده`} rgb={T.sky} />
        <Kpi label="ضریب سود (PF)" value={formatRatio(data.profitFactor)} rgb={T.violet} />
        <Kpi label="میانگین R:R" value={formatRatio(data.avgRr)} rgb={T.mint} />
        <Kpi label="وین‌ریت" value={formatPct((data.winRate ?? 0) * 100)} rgb={T.amber} />
      </div>

      {/* Equity curve */}
      <div className="relative overflow-hidden rounded-3xl p-5" style={glass()}>
        <div className="mb-4 flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full animate-pulse-dot" style={{ background: `rgb(${T.sky})` }} />
          <h3 className="text-sm font-bold">منحنی سرمایهٔ ترکیبی (شروع از {formatUsd(summary.totalInitialCapital, 0)})</h3>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={equity} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="team-equity" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`rgb(${T.sky})`} stopOpacity={0.4} />
                <stop offset="60%" stopColor={`rgb(${T.sky})`} stopOpacity={0.12} />
                <stop offset="100%" stopColor={`rgb(${T.sky})`} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={border} strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="dateLabel" stroke="rgba(255,255,255,0.5)" fontSize={11} tickLine={false} axisLine={false} minTickGap={28} tickMargin={8} />
            <YAxis stroke="rgba(255,255,255,0.5)" fontSize={11} width={64} tickLine={false} axisLine={false} domain={["auto", "auto"]} tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${v.toFixed(2)}`, "سرمایه"]} labelFormatter={(l) => String(l)} />
            <Area type="monotone" dataKey="balance" stroke={`rgb(${T.sky})`} strokeWidth={2.5} fill="url(#team-equity)" dot={false} animationDuration={1200} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-3xl p-5" style={glass()}>
          <h3 className="mb-3 text-sm font-bold">توزیع سود و زیان</h3>
          <Donut data={wlData} centerTop={formatPct((data.winRate ?? 0) * 100)} centerBottom="وین‌ریت" total={wlTotal} />
        </div>
        <div className="rounded-3xl p-5" style={glass()}>
          <h3 className="mb-3 text-sm font-bold">تفکیک جهت معاملات</h3>
          <Donut data={dirData} centerTop={faNum(total)} centerBottom="معامله" total={total} />
        </div>
      </div>

      {/* Daily PnL — Jalali calendar; day-click shows that day's trades */}
      <DailyPnLCalendar
        pnlByDay={data.pnlByDay}
        walletMargin={summary.totalInitialCapital}
        trades={dayTrades}
      />

      {/* Top symbols */}
      <div className="rounded-3xl p-5" style={glass()}>
        <h3 className="mb-3 text-sm font-bold">برترین نمادها بر اساس سود/زیان</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-center text-white/60">
                <th className="py-2.5 pr-2 text-right text-xs font-semibold">نماد</th>
                <th className="py-2.5 text-xs font-semibold">تعداد</th>
                <th className="py-2.5 text-xs font-semibold">P&amp;L (USDT)</th>
              </tr>
            </thead>
            <tbody>
              {data.topSymbols.length === 0 && <tr><td colSpan={3} className="py-8 text-center text-white/50">داده‌ای موجود نیست</td></tr>}
              {data.topSymbols.map((s, i) => (
                <tr key={s.symbol} className="border-b border-white/5">
                  <td className="py-3 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-xl text-[10px] font-black" style={{ background: `rgba(${s.pnl >= 0 ? T.mint : T.rose},0.15)`, color: `rgb(${s.pnl >= 0 ? T.mint : T.rose})` }}>{i + 1}</span>
                      <span className="font-bold" dir="ltr">{s.symbol}</span>
                    </div>
                  </td>
                  <td className="py-3 text-center text-white/60">{faNum(s.count)}</td>
                  <td className="py-3 text-center font-semibold" style={{ color: `rgb(${s.pnl >= 0 ? T.green : T.red})` }} dir="ltr">{s.pnl >= 0 ? "+" : ""}{s.pnl.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CapitalBox({
  base, current, growth, growthPct, weekPnl, monthPnl,
}: {
  base: number; current: number; growth: number; growthPct: number; weekPnl: number | null; monthPnl: number | null;
}) {
  const up = growth >= 0;
  const mainRgb = up ? T.green : T.red;
  return (
    <div className="relative overflow-hidden rounded-3xl p-6" style={glassTint(T.accent)}>
      <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full opacity-40 blur-3xl" style={{ background: `rgba(${mainRgb},0.4)` }} />
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        {/* Growth headline */}
        <div>
          <div className="text-xs font-medium text-white/60">سرمایهٔ فعلی (رشد نسبت به ۱۰۰۰ دلار)</div>
          <div className="mt-1 flex items-baseline gap-2" dir="ltr">
            <span className="text-4xl font-black tracking-tight" style={{ color: `rgb(${mainRgb})` }}>{formatUsd(current, 2)}</span>
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold" style={{ background: `rgba(${mainRgb},0.16)`, color: `rgb(${mainRgb})` }}>
              {up ? "+" : ""}{growthPct.toFixed(2)}%
            </span>
          </div>
          <div className="mt-1.5 text-sm text-white/70" dir="ltr">
            سرمایه اولیه: <b className="text-white">$1000</b>
            <span className="mx-2 text-white/30">|</span>
            <span style={{ color: `rgb(${mainRgb})` }}>{up ? "+" : ""}{formatUsd(growth, 2)} رشد</span>
          </div>
        </div>

        {/* Weekly / monthly PnL */}
        <div className="flex gap-3">
          <PnlChip label="PnL هفتگی" pnl={weekPnl} base={base} />
          <PnlChip label="PnL ماهانه (شمسی)" pnl={monthPnl} base={base} />
        </div>
      </div>
    </div>
  );
}

function PnlChip({ label, pnl, base }: { label: string; pnl: number | null; base: number }) {
  const has = pnl != null;
  const up = (pnl ?? 0) >= 0;
  const rgb = up ? T.green : T.red;
  const pct = has && base > 0 ? (pnl! / base) * 100 : 0;
  return (
    <div className="min-w-[130px] rounded-2xl px-4 py-3 text-center" style={{ background: `rgba(${has ? rgb : "148,163,184"},0.1)`, border: `1px solid rgba(${has ? rgb : "148,163,184"},0.24)` }}>
      <div className="text-[11px] font-medium text-white/60">{label}</div>
      {has ? (
        <>
          <div className="mt-1 text-lg font-extrabold" style={{ color: `rgb(${rgb})` }} dir="ltr">{up ? "+" : ""}{pnl!.toFixed(2)} <span className="text-xs font-medium">USDT</span></div>
          <div className="text-xs font-semibold" style={{ color: `rgb(${rgb})` }} dir="ltr">({up ? "+" : ""}{pct.toFixed(2)}%)</div>
        </>
      ) : (
        <div className="mt-1 text-sm text-white/50">—</div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, rgb, ltr }: { label: string; value: string; sub?: string; rgb: string; ltr?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-4" style={glassTint(rgb)}>
      <div className="text-[11px] font-medium text-white/60">{label}</div>
      <div className="mt-1.5 text-xl font-extrabold tracking-tight" style={{ color: `rgb(${rgb})` }} dir={ltr ? "ltr" : undefined}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-white/50">{sub}</div>}
    </div>
  );
}

function Donut({ data, centerTop, centerBottom, total }: { data: { name: string; value: number; rgb: string }[]; centerTop: string; centerBottom: string; total: number }) {
  if (total === 0) return <p className="py-10 text-center text-sm text-white/50">داده‌ای موجود نیست</p>;
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 220, height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={72} outerRadius={104} paddingAngle={data.length > 1 ? 3 : 0} cornerRadius={10} startAngle={90} endAngle={-270} animationDuration={1000}>
              {data.map((d, i) => (<Cell key={i} fill={`rgb(${d.rgb})`} stroke={`rgba(${d.rgb},0.3)`} strokeWidth={1} />))}
            </Pie>
            <Tooltip {...tooltipStyle} formatter={(v: number, n: string) => [faNum(v), n]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-extrabold" style={{ color: `rgb(${T.accent})` }} dir="ltr">{centerTop}</div>
          <div className="text-xs text-white/55">{centerBottom}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-4 text-sm">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: `rgb(${d.rgb})` }} />
            <span className="font-semibold" style={{ color: `rgb(${d.rgb})` }}>{d.name}</span>
            <span className="text-white/55">{faNum(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Journal panel (anonymous — merged bot trades)
// ═══════════════════════════════════════════════════════════════════════════
function pnlOf(t: Trade): number | null {
  if (t.source === "toobit" && t.realizedPnl != null) return t.realizedPnl;
  return t.calc?.realizedPnl ?? t.realizedPnl ?? null;
}

const PAGE_SIZE = 10;

function JournalPanel({
  onUpdated,
  tradesFn = publicApi.teamTrades,
}: {
  onUpdated?: () => void;
  tradesFn?: () => Promise<Trade[]>;
}) {
  const [rows, setRows] = useState<Trade[] | null>(null);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Trade | null>(null);
  const hasData = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const data = await tradesFn();
      setRows(data);
      setError(false);
      hasData.current = true;
      onUpdated?.();
    } catch {
      if (!hasData.current) setError(true);
    }
  }, [onUpdated, tradesFn]);

  useLiveRefresh(refresh, LIVE_POLL_MS);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((t) => statusFilter === "ALL" || t.status === statusFilter);
  }, [rows, statusFilter]);

  // Reset to the first page whenever the filter changes.
  useEffect(() => { setPage(1); }, [statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (error) return <PanelEmpty text="بارگذاری ژورنال‌ها ممکن نشد." />;
  if (!rows) return <PanelSpinner />;
  if (rows.length === 0) return <PanelEmpty text="هنوز معامله‌ای ثبت نشده است." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-3xl p-4" style={glass()}>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/60">وضعیت:</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl bg-white/5 px-3 py-2 text-sm text-white outline-none" style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
            <option value="ALL" className="bg-[#0b1e3d]">همه</option>
            <option value="PLANNED" className="bg-[#0b1e3d]">برنامه‌ریزی‌شده</option>
            <option value="OPEN" className="bg-[#0b1e3d]">باز</option>
            <option value="CLOSED" className="bg-[#0b1e3d]">بسته‌شده</option>
          </select>
        </div>
        <span className="ml-auto text-xs text-white/50">{faNum(filtered.length)} معامله</span>
      </div>

      <p className="px-1 text-[11px] text-white/45">برای مشاهدهٔ جزئیات کاملِ هر معامله روی آن کلیک کنید</p>

      <div className="overflow-x-auto rounded-3xl" style={glass()}>
        <table className="w-full text-sm">
          <thead className="text-white/60">
            <tr className="border-b border-white/10 text-center">
              <th className="p-3 text-right">نماد</th>
              <th className="p-3">جهت</th>
              <th className="p-3">VOL</th>
              <th className="p-3">تاریخ</th>
              <th className="p-3">R:R کسب</th>
              <th className="p-3">نتیجه</th>
              <th className="p-3">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((t) => {
              const pnl = pnlOf(t);
              return (
                <tr
                  key={t.id}
                  onClick={() => setDetail(t)}
                  className={`cursor-pointer border-b border-white/5 transition-colors ${t.source === "toobit" ? "bg-sky-400/10 hover:bg-sky-400/20" : "hover:bg-white/5"}`}
                >
                  <td className="p-3 text-right font-medium" dir="ltr">
                    {t.symbol || "—"}
                    {t.source === "toobit" && (
                      <span className="ml-1 inline-block rounded-md border border-sky-400/40 bg-sky-400/15 px-1.5 py-0.5 align-middle text-[9px] font-bold text-sky-300">toobit</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: `rgba(${t.direction === "LONG" ? T.green : T.red},0.16)`, color: `rgb(${t.direction === "LONG" ? T.green : T.red})` }}>
                      {t.direction === "LONG" ? "Long" : "Short"}
                    </span>
                  </td>
                  <td className="p-3 text-center text-white/80" dir="ltr">{formatUsd(t.calc?.positionSize, 0)}</td>
                  <td className="p-3 text-center text-white/70">{formatJalaliDate(t.openDate)}</td>
                  <td className="p-3 text-center text-white/80" dir="ltr">{formatRatio(t.calc?.rrAchieved ?? t.rrAchieved)}</td>
                  <td className="p-3 text-center" dir="ltr"><span className={pnlColorClass(pnl)}>{formatSignedUsd(pnl)}</span></td>
                  <td className="p-3 text-center"><StatusPill status={t.status} pnl={pnl} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{ ...glass(), color: "rgba(255,255,255,0.85)" }}
          >
            قبلی
          </button>
          <span className="px-2 text-sm text-white/70">صفحهٔ {faNum(safePage)} از {faNum(totalPages)}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{ ...glass(), color: "rgba(255,255,255,0.85)" }}
          >
            بعدی
          </button>
        </div>
      )}

      {detail && <PublicTradeDetailModal trade={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

/** Read-only full-detail viewer for a public trade — reuses the editor tabs
 *  (all tabs, complete details) with no editing and no authed API calls. */
function PublicTradeDetailModal({ trade, onClose }: { trade: Trade; onClose: () => void }) {
  const setTrade = useTrade((s) => s.setTrade);
  const reset = useTrade((s) => s.reset);
  // Empty array (not undefined) keeps ChecklistTab from calling the authed
  // endpoint; the fetched owner templates let it render the ticked items.
  const [checklists, setChecklists] = useState<ChecklistTemplate[]>([]);

  useEffect(() => {
    setTrade(trade);
    return () => reset();
  }, [trade, setTrade, reset]);

  useEffect(() => {
    publicApi.teamChecklists(trade.userId).then(setChecklists).catch(() => setChecklists([]));
  }, [trade.userId]);

  const pnl = pnlOf(trade);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      dir="rtl"
    >
      <div className="tj-card my-6 w-full max-w-3xl space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <StatusDot status={trade.status} pnl={pnl} exitType={trade.exitType} />
            <div className="font-bold">
              معامله #{faNum(trade.number)} <span dir="ltr" className="text-muted">{trade.symbol || ""}</span>
            </div>
            <Badge tone="muted">حالت فقط‌خواندنی</Badge>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:bg-surface-2"
          >
            بستن ✕
          </button>
        </div>
        <TradeTabs readOnly checklistTemplates={checklists} />
      </div>
    </div>
  );
}

function StatusPill({ status, pnl }: { status: string; pnl: number | null }) {
  if (status === "CLOSED") {
    const win = (pnl ?? 0) >= 0;
    const rgb = win ? T.green : T.red;
    return <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: `rgba(${rgb},0.16)`, color: `rgb(${rgb})` }}>بسته‌شده</span>;
  }
  const label = status === "OPEN" ? "باز" : "برنامه‌ریزی";
  const rgb = status === "OPEN" ? T.sky : T.violet;
  return <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: `rgba(${rgb},0.16)`, color: `rgb(${rgb})` }}>{label}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Live-trade panel — one live trader's results (dashboard + calendar + journal)
// ═══════════════════════════════════════════════════════════════════════════
function LiveTradePanel({ onUpdated }: { onUpdated?: () => void }) {
  const [summary, setSummary] = useState<TeamSummary | null>(null);
  const [hidden, setHidden] = useState(false);
  const hasData = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const s = await publicApi.liveSummary();
      if (s.count === 0) {
        setHidden(true);
        setSummary(null);
      } else {
        setHidden(false);
        setSummary(s);
        hasData.current = true;
      }
    } catch {
      if (!hasData.current) setHidden(true);
    }
  }, []);

  useLiveRefresh(refresh, LIVE_POLL_MS);

  if (hidden) return <PanelEmpty text="هنوز کاربری برای «لایو ترید» انتخاب نشده است." />;
  if (!summary) return <PanelSpinner />;

  return (
    <div className="space-y-8">
      {/* Full dashboard (KPIs, equity curve, donuts, Jalali calendar with clickable days) */}
      <DashboardPanel
        summary={summary}
        onUpdated={onUpdated}
        dashboardFn={publicApi.liveDashboard}
        tradesFn={publicApi.liveTrades}
      />

      {/* Journal list — click any row for the full read-only detail */}
      <div>
        <div className="mb-4 flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full animate-pulse-dot" style={{ background: `rgb(${T.sky})` }} />
          <h3 className="text-lg font-bold">ژورنال معاملاتِ لایو ترید</h3>
        </div>
        <JournalPanel onUpdated={onUpdated} tradesFn={publicApi.liveTrades} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AI panel — combined team analyses (overall + institutional)
// ═══════════════════════════════════════════════════════════════════════════
function AIPanel({ isAdmin, onUpdated }: { isAdmin: boolean; onUpdated?: () => void }) {
  const [data, setData] = useState<TeamAIData | null>(null);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const hasData = useRef(false);

  const load = useCallback(
    () =>
      publicApi.teamAi().then((d) => {
        if (mounted.current) {
          setData(d);
          hasData.current = true;
          setError(false);
          onUpdated?.();
        }
        return d;
      }),
    [onUpdated],
  );

  // Steady background refresh + faster poll while an analysis is generating.
  useLiveRefresh(
    async () => {
      try {
        await load();
      } catch {
        if (!hasData.current) setError(true);
      }
    },
    LIVE_POLL_MS,
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Poll while either analysis is running.
  useEffect(() => {
    if (!data) return;
    const pending = data.overallStatus === "PENDING" || data.reportStatus === "PENDING";
    if (pending) {
      timer.current = setTimeout(() => load().catch(() => {}), 4000);
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [data, load]);

  const generate = async (kind: "overall" | "report") => {
    try {
      const res = kind === "overall" ? await publicApi.generateTeamOverall() : await publicApi.generateTeamReport();
      if (mounted.current) setData(res);
    } catch (e: any) {
      if (mounted.current) setData((prev) => prev ? { ...prev, [`${kind}Error`]: e?.response?.data?.detail ?? "خطا در شروع تحلیل" } as TeamAIData : prev);
    }
  };

  if (error) return <PanelEmpty text="بارگذاری تحلیل‌ها ممکن نشد." />;
  if (!data) return <PanelSpinner />;

  const nothing = !data.overall && !data.report && data.overallStatus !== "PENDING" && data.reportStatus !== "PENDING";
  if (nothing && !isAdmin) {
    return <PanelEmpty text="تحلیل هوش مصنوعیِ ترکیبی به‌زودی منتشر می‌شود." />;
  }

  return (
    <div className="space-y-5">
      <p className="text-center text-sm text-white/60">
        تحلیل هوش مصنوعیِ مربیِ الگو اسمارت روی مجموعِ معاملات واقعیِ کل تیم (سرمایهٔ اولیهٔ هر حساب ۱۰۰۰ دلار).
      </p>

      {isAdmin && !data.enabled && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-300">
          تحلیل هوش مصنوعی روی سرور فعال نشده است (کلید API تنظیم نشده).
        </div>
      )}

      <AISection
        title="تحلیل کلی معاملات با هوش مصنوعی"
        rgb={T.violet}
        content={data.overall}
        at={data.overallAt}
        status={data.overallStatus}
        errorMsg={data.overallError}
        isAdmin={isAdmin}
        enabled={data.enabled}
        onGenerate={() => generate("overall")}
      />
      <AISection
        title="گزارش نهادی (Institutional) با هوش مصنوعی"
        rgb={T.sky}
        content={data.report}
        at={data.reportAt}
        status={data.reportStatus}
        errorMsg={data.reportError}
        isAdmin={isAdmin}
        enabled={data.enabled}
        onGenerate={() => generate("report")}
      />
    </div>
  );
}

function AISection({
  title, rgb, content, at, status, errorMsg, isAdmin, enabled, onGenerate,
}: {
  title: string; rgb: string; content: string | null; at: string | null;
  status: string | null; errorMsg: string | null; isAdmin: boolean; enabled: boolean; onGenerate: () => void;
}) {
  const pending = status === "PENDING";
  // The analyze button only appears for an admin, and only until an analysis
  // exists — once generated it is removed for everyone.
  const showButton = isAdmin && !content && !pending;

  return (
    <div className="space-y-3 rounded-3xl p-5" style={glass()}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl text-lg" style={{ background: `rgba(${rgb},0.18)` }}>🤖</span>
          <h3 className="text-base font-bold" style={{ color: `rgb(${rgb})` }}>{title}</h3>
        </div>
        {showButton && (
          <button
            onClick={onGenerate}
            disabled={!enabled}
            className="rounded-xl px-4 py-2 text-sm font-bold text-[#06121f] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: `linear-gradient(120deg, rgba(${rgb},0.95), rgba(${T.accent},0.8))`, boxShadow: `0 12px 30px -12px rgba(${rgb},0.8)` }}
          >
            تحلیل کن
          </button>
        )}
      </div>

      {pending && (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/70">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-300 border-t-transparent" />
          در حال تحلیلِ کلِ تیم… نتیجه به‌صورت خودکار نمایش داده می‌شود (ممکن است تا یک دقیقه طول بکشد).
        </div>
      )}

      {status === "ERROR" && errorMsg && !content && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{errorMsg}</div>
      )}

      {content ? (
        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(${rgb},0.2)` }}>
          <div className="max-h-[26rem] overflow-y-auto pr-1 text-white/90">
            <Markdown content={content} />
          </div>
          {at && <p className="pt-2 text-xs text-white/45">آخرین تحلیل: {formatJalaliDateTime(at)}</p>}
        </div>
      ) : (
        !pending && <p className="text-sm text-white/50">{isAdmin ? "برای تولید تحلیلِ کل تیم، روی «تحلیل کن» بزنید." : "به‌زودی…"}</p>
      )}
    </div>
  );
}

// ── shared ────────────────────────────────────────────────────────────────────
function shortDate(iso: string | null): string {
  if (!iso) return "";
  const jp = getJalaliParts(iso);
  if (!jp) return iso;
  return `${toPersianDigits(jp.day)} ${jp.monthName}`;
}
