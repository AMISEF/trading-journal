"use client";

/**
 * لایو معاملات ربات الگو اسمارت — public landing-page showcase.
 *
 * Shows a *combined* live view of every Cryptosmart Team member:
 *   • داشبورد معاملات  — one aggregated dashboard (sum of each trader's stats)
 *   • لیست ژورنال      — one merged journal list of all members' trades
 *   • تحلیل معاملات با هوش مصنوعی — the cached AI coach analyses, read-only
 *
 * Everything is public (no auth) and pulled from /api/public/team/*. The look
 * mirrors the glassy/animated UI used across the app.
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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
  publicApi,
  type PublicTeamTrade,
  type PublicMemberAI,
  type TeamMember,
} from "@/lib/api";
import type { DashboardData, Trade } from "@/lib/types";
import {
  faNum,
  formatPct,
  formatRatio,
  formatSignedUsd,
  formatUsd,
  pnlColorClass,
} from "@/lib/format";
import { formatJalaliDate, formatJalaliDateTime, getJalaliParts, toPersianDigits } from "@/lib/jalali";
import { Markdown } from "@/components/Markdown";

// ── palette (matches the landing + dashboard tints) ──────────────────────────
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
  contentStyle: {
    background: CHART_BG,
    border: `1px solid ${border}`,
    borderRadius: 12,
    fontSize: 12,
    color: "#fff",
  },
} as const;

type Tab = "dashboard" | "journal" | "ai";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  {
    key: "dashboard",
    label: "داشبورد معاملات",
    icon: <path d="M3 3v18h18M7 15l4-4 3 3 5-6" />,
  },
  {
    key: "journal",
    label: "لیست ژورنال",
    icon: (
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    ),
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
];

export function TeamLiveSection() {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");

  useEffect(() => {
    publicApi
      .teamMembers()
      .then((m) => {
        if (m.length === 0) setHidden(true);
        else setMembers(m);
      })
      .catch(() => setHidden(true));
  }, []);

  if (hidden || !members) return null;

  return (
    <section id="live" className="relative mx-auto max-w-7xl scroll-mt-24 px-5 py-16 md:px-8 md:py-24">
      {/* Heading */}
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
        <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
          لایو معاملات ربات الگو اسمارت
        </h2>
        <p className="mt-3 text-white/65">
          معاملات زندهٔ تیم کریپتو اسمارت را همین‌جا دنبال کن — داشبورد ترکیبی، لیست ژورنال مشترک و
          تحلیل هوش مصنوعی، همه به‌صورت زنده.
        </p>

        {/* Member chips */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {members.map((m) => (
            <span
              key={m.username}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur"
            >
              <span className="h-1.5 w-1.5 rounded-full animate-pulse-dot" style={{ background: `rgb(${T.accent})` }} />
              {m.trader}
              <span dir="ltr" className="text-white/50">@{m.username}</span>
            </span>
          ))}
        </div>
      </motion.div>

      {/* Tab buttons */}
      <div className="mt-9 flex flex-wrap items-center justify-center gap-2.5">
        {TABS.map((tb) => {
          const active = tab === tb.key;
          return (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition-all duration-300 hover:-translate-y-0.5"
              style={
                active
                  ? {
                      background: `linear-gradient(120deg, rgba(${T.accent},0.95), rgba(${T.sky},0.75))`,
                      color: "#06121f",
                      boxShadow: `0 14px 34px -14px rgba(${T.accent},0.9)`,
                    }
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

      {/* Panel */}
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mt-8"
      >
        {tab === "dashboard" && <DashboardPanel />}
        {tab === "journal" && <JournalPanel />}
        {tab === "ai" && <AIPanel />}
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

// ── loading / empty helpers ───────────────────────────────────────────────────
function PanelSpinner() {
  return (
    <div className="flex items-center justify-center gap-3 rounded-3xl p-12 text-sm text-white/60" style={glass()}>
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-transparent" />
      در حال بارگذاری…
    </div>
  );
}

function PanelEmpty({ text }: { text: string }) {
  return (
    <div className="rounded-3xl p-12 text-center text-sm text-white/60" style={glass()}>
      {text}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard panel — aggregated across the whole team
// ═══════════════════════════════════════════════════════════════════════════
function DashboardPanel() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    publicApi.teamDashboard().then(setData).catch(() => setError(true));
  }, []);

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

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Kpi label="تعداد معاملات" value={faNum(data.tradeCount)} sub={`${faNum(data.closedCount)} بسته‌شده`} rgb={T.sky} />
        <Kpi label="ضریب سود (PF)" value={formatRatio(data.profitFactor)} rgb={T.violet} />
        <Kpi label="میانگین R:R" value={formatRatio(data.avgRr)} rgb={T.mint} />
        <Kpi label="وین‌ریت" value={formatPct((data.winRate ?? 0) * 100)} rgb={T.amber} />
        <Kpi label="سرمایه ترکیبی" value={formatUsd(data.currentBalance, 0)} rgb={T.accent} ltr />
      </div>

      {/* Equity curve */}
      <div className="relative overflow-hidden rounded-3xl p-5" style={glass()}>
        <div className="mb-4 flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full animate-pulse-dot" style={{ background: `rgb(${T.sky})` }} />
          <h3 className="text-sm font-bold">منحنی سرمایه ترکیبی تیم</h3>
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
        {/* Win / loss donut */}
        <div className="rounded-3xl p-5" style={glass()}>
          <h3 className="mb-3 text-sm font-bold">توزیع سود و زیان</h3>
          <Donut data={wlData} centerTop={formatPct((data.winRate ?? 0) * 100)} centerBottom="وین‌ریت" total={wlTotal} />
        </div>

        {/* Direction donut */}
        <div className="rounded-3xl p-5" style={glass()}>
          <h3 className="mb-3 text-sm font-bold">تفکیک جهت معاملات</h3>
          <Donut data={dirData} centerTop={faNum(total)} centerBottom="معامله" total={total} />
        </div>
      </div>

      {/* Daily PnL bar */}
      <div className="rounded-3xl p-5" style={glass()}>
        <h3 className="mb-3 text-sm font-bold">سود و زیان روزانه (ترکیبی)</h3>
        {data.pnlByDay.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/50">داده‌ای موجود نیست</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.pnlByDay.map((d) => ({ ...d, label: shortDate(d.date) }))} barSize={16}>
              <defs>
                <linearGradient id="team-bar-up" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={`rgb(${T.mint})`} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={`rgb(${T.green})`} stopOpacity={0.5} />
                </linearGradient>
                <linearGradient id="team-bar-down" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={`rgb(${T.rose})`} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={`rgb(${T.red})`} stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={border} vertical={false} />
              <XAxis dataKey="label" stroke="rgba(255,255,255,0.5)" fontSize={10} />
              <YAxis stroke="rgba(255,255,255,0.5)" fontSize={11} tickFormatter={(v) => `${v.toFixed(0)}`} />
              <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.06)" }} formatter={(v: number) => [`${v.toFixed(4)} USDT`, "سود/زیان"]} />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                {data.pnlByDay.map((d, i) => (
                  <Cell key={i} fill={d.pnl >= 0 ? "url(#team-bar-up)" : "url(#team-bar-down)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

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
              {data.topSymbols.length === 0 && (
                <tr><td colSpan={3} className="py-8 text-center text-white/50">داده‌ای موجود نیست</td></tr>
              )}
              {data.topSymbols.map((s, i) => (
                <tr key={s.symbol} className="border-b border-white/5">
                  <td className="py-3 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-xl text-[10px] font-black" style={{ background: `rgba(${s.pnl >= 0 ? T.mint : T.rose},0.15)`, color: `rgb(${s.pnl >= 0 ? T.mint : T.rose})` }}>
                        {i + 1}
                      </span>
                      <span className="font-bold" dir="ltr">{s.symbol}</span>
                    </div>
                  </td>
                  <td className="py-3 text-center text-white/60">{faNum(s.count)}</td>
                  <td className="py-3 text-center font-semibold" style={{ color: `rgb(${s.pnl >= 0 ? T.green : T.red})` }} dir="ltr">
                    {s.pnl >= 0 ? "+" : ""}{s.pnl.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, rgb, ltr }: { label: string; value: string; sub?: string; rgb: string; ltr?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-4" style={glassTint(rgb)}>
      <div className="text-[11px] font-medium text-white/60">{label}</div>
      <div className="mt-1.5 text-xl font-extrabold tracking-tight" style={{ color: `rgb(${rgb})` }} dir={ltr ? "ltr" : undefined}>
        {value}
      </div>
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
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={72}
              outerRadius={104}
              paddingAngle={data.length > 1 ? 3 : 0}
              cornerRadius={10}
              startAngle={90}
              endAngle={-270}
              animationDuration={1000}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={`rgb(${d.rgb})`} stroke={`rgba(${d.rgb},0.3)`} strokeWidth={1} />
              ))}
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
// Journal panel — merged list of all members' trades
// ═══════════════════════════════════════════════════════════════════════════
function pnlOf(t: Trade): number | null {
  if (t.source === "toobit" && t.realizedPnl != null) return t.realizedPnl;
  return t.calc?.realizedPnl ?? t.realizedPnl ?? null;
}

function JournalPanel() {
  const [rows, setRows] = useState<PublicTeamTrade[] | null>(null);
  const [error, setError] = useState(false);
  const [traderFilter, setTraderFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    publicApi.teamTrades().then(setRows).catch(() => setError(true));
  }, []);

  const traders = useMemo(() => {
    if (!rows) return [];
    return [...new Set(rows.map((r) => r.trader))];
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      const mt = !traderFilter || r.trader === traderFilter;
      const ms = statusFilter === "ALL" || r.trade.status === statusFilter;
      return mt && ms;
    });
  }, [rows, traderFilter, statusFilter]);

  if (error) return <PanelEmpty text="بارگذاری ژورنال‌ها ممکن نشد." />;
  if (!rows) return <PanelSpinner />;
  if (rows.length === 0) return <PanelEmpty text="هنوز معامله‌ای برای تیم ثبت نشده است." />;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-3xl p-4" style={glass()}>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/60">معامله‌گر:</span>
          <select
            value={traderFilter}
            onChange={(e) => setTraderFilter(e.target.value)}
            className="rounded-xl bg-white/5 px-3 py-2 text-sm text-white outline-none"
            style={{ border: "1px solid rgba(255,255,255,0.12)" }}
          >
            <option value="" className="bg-[#0b1e3d]">همه</option>
            {traders.map((t) => (
              <option key={t} value={t} className="bg-[#0b1e3d]">{t}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/60">وضعیت:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl bg-white/5 px-3 py-2 text-sm text-white outline-none"
            style={{ border: "1px solid rgba(255,255,255,0.12)" }}
          >
            <option value="ALL" className="bg-[#0b1e3d]">همه</option>
            <option value="PLANNED" className="bg-[#0b1e3d]">برنامه‌ریزی‌شده</option>
            <option value="OPEN" className="bg-[#0b1e3d]">باز</option>
            <option value="CLOSED" className="bg-[#0b1e3d]">بسته‌شده</option>
          </select>
        </div>
        <span className="ml-auto text-xs text-white/50">{faNum(filtered.length)} معامله</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-3xl" style={glass()}>
        <table className="w-full text-sm">
          <thead className="text-white/60">
            <tr className="border-b border-white/10 text-center">
              <th className="p-3 text-right">معامله‌گر</th>
              <th className="p-3">نماد</th>
              <th className="p-3">جهت</th>
              <th className="p-3">VOL</th>
              <th className="p-3">تاریخ</th>
              <th className="p-3">R:R کسب</th>
              <th className="p-3">نتیجه</th>
              <th className="p-3">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const t = r.trade;
              const pnl = pnlOf(t);
              return (
                <tr
                  key={t.id}
                  className={`border-b border-white/5 transition-colors ${t.source === "toobit" ? "bg-sky-400/10" : "hover:bg-white/5"}`}
                >
                  <td className="p-3 text-right">
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-black" style={{ background: `rgba(${T.accent},0.16)`, color: `rgb(${T.accent})` }}>
                        {r.trader.slice(0, 1)}
                      </span>
                      <div className="leading-tight">
                        <div className="font-semibold text-white/90">{r.trader}</div>
                        <div className="text-[10px] text-white/45" dir="ltr">@{r.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-center font-medium" dir="ltr">
                    {t.symbol || "—"}
                    {t.source === "toobit" && (
                      <span className="ml-1 inline-block rounded-md border border-sky-400/40 bg-sky-400/15 px-1.5 py-0.5 align-middle text-[9px] font-bold text-sky-300">
                        toobit
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className="rounded-full px-2.5 py-1 text-xs font-bold"
                      style={{ background: `rgba(${t.direction === "LONG" ? T.green : T.red},0.16)`, color: `rgb(${t.direction === "LONG" ? T.green : T.red})` }}
                    >
                      {t.direction === "LONG" ? "Long" : "Short"}
                    </span>
                  </td>
                  <td className="p-3 text-center text-white/80" dir="ltr">{formatUsd(t.calc?.positionSize, 0)}</td>
                  <td className="p-3 text-center text-white/70">{formatJalaliDate(t.openDate)}</td>
                  <td className="p-3 text-center text-white/80" dir="ltr">{formatRatio(t.calc?.rrAchieved ?? t.rrAchieved)}</td>
                  <td className="p-3 text-center" dir="ltr">
                    <span className={pnlColorClass(pnl)}>{formatSignedUsd(pnl)}</span>
                  </td>
                  <td className="p-3 text-center">
                    <StatusPill status={t.status} pnl={pnl} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status, pnl }: { status: string; pnl: number | null }) {
  if (status === "CLOSED") {
    const win = (pnl ?? 0) >= 0;
    const rgb = win ? T.green : T.red;
    return (
      <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: `rgba(${rgb},0.16)`, color: `rgb(${rgb})` }}>
        بسته‌شده
      </span>
    );
  }
  const label = status === "OPEN" ? "باز" : "برنامه‌ریزی";
  const rgb = status === "OPEN" ? T.sky : T.violet;
  return (
    <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: `rgba(${rgb},0.16)`, color: `rgb(${rgb})` }}>
      {label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AI panel — cached coach analyses (read-only), both overall + institutional
// ═══════════════════════════════════════════════════════════════════════════
function AIPanel() {
  const [members, setMembers] = useState<PublicMemberAI[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    publicApi.teamAi().then(setMembers).catch(() => setError(true));
  }, []);

  if (error) return <PanelEmpty text="بارگذاری تحلیل‌ها ممکن نشد." />;
  if (!members) return <PanelSpinner />;

  const hasAny = members.some((m) => m.overall || m.report);
  if (!hasAny) {
    return <PanelEmpty text="هنوز تحلیل هوش مصنوعی‌ای برای تیم منتشر نشده است. به‌زودی…" />;
  }

  return (
    <div className="space-y-5">
      <p className="text-center text-sm text-white/60">
        این تحلیل‌ها را هوش مصنوعیِ مربیِ کریپتو اسمارت روی معاملات واقعی اعضای تیم تولید کرده است.
      </p>
      {members.map((m) => {
        if (!m.overall && !m.report) return null;
        return (
          <div key={m.username} className="space-y-4 rounded-3xl p-5" style={glass()}>
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl text-lg" style={{ background: `rgba(${T.violet},0.18)` }}>🤖</span>
              <div>
                <h3 className="text-base font-bold">{m.trader}</h3>
                <p className="text-xs text-white/50" dir="ltr">@{m.username}</p>
              </div>
            </div>

            {m.overall && (
              <AIBlock
                title="تحلیل کلی معاملات با هوش مصنوعی"
                rgb={T.violet}
                content={m.overall}
                at={m.overallAt}
              />
            )}
            {m.report && (
              <AIBlock
                title="گزارش نهادی (Institutional)"
                rgb={T.sky}
                content={m.report}
                at={m.reportAt}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function AIBlock({ title, rgb, content, at }: { title: string; rgb: string; content: string; at: string | null }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(${rgb},0.2)` }}>
      <div className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: `rgb(${rgb})` }}>
        <span className="h-2 w-2 rounded-full" style={{ background: `rgb(${rgb})` }} />
        {title}
      </div>
      <div className="max-h-[26rem] overflow-y-auto pr-1 text-white/90">
        <Markdown content={content} />
      </div>
      {at && <p className="pt-2 text-xs text-white/45">آخرین تحلیل: {formatJalaliDateTime(at)}</p>}
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
