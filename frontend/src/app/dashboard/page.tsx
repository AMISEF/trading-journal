"use client";

/**
 * Dashboard: KPI cards + equity curve + MA, heatmap calendar, symbol bar chart,
 * direction donut, checklist discipline, balance card.
 * Sessions removed (crypto has no sessions).
 */
import { useEffect, useState } from "react";
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
import { formatJalaliDate } from "@/lib/jalali";

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

// Build a 7-column calendar grid from pnlByDay data.
function buildCalendar(pnlByDay: { date: string; pnl: number }[]) {
  if (pnlByDay.length === 0) return [];
  const map = new Map<string, number>();
  pnlByDay.forEach((d) => map.set(d.date.slice(0, 10), d.pnl));

  const start = new Date(pnlByDay[0].date);
  const end = new Date(pnlByDay[pnlByDay.length - 1].date);
  // Align start to Sunday
  const startDay = new Date(start);
  startDay.setDate(start.getDate() - start.getDay());

  const weeks: { date: string; pnl: number | null }[][] = [];
  const cur = new Date(startDay);
  while (cur <= end || cur.getDay() !== 0) {
    const week: { date: string; pnl: number | null }[] = [];
    for (let d = 0; d < 7; d++) {
      const key = cur.toISOString().slice(0, 10);
      week.push({ date: key, pnl: map.has(key) ? map.get(key)! : null });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
    if (cur > end && cur.getDay() === 0) break;
  }
  return weeks;
}

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

  const calendar = buildCalendar(data.pnlByDay);

  // Symbol bar chart data
  const symbolBars = [...data.topSymbols].sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, 8);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">داشبورد</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="تعداد معاملات" value={faNum(data.tradeCount)} sub={`${faNum(data.closedCount)} بسته‌شده`} />
        <KpiCard label="ضریب سود (PF)" value={formatRatio(data.profitFactor)} />
        <KpiCard label="میانگین R:R" value={formatRatio(data.avgRR)} />
        <KpiCard label="نرخ برد" value={formatPct(data.winRate)} />
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

      {/* Heatmap calendar */}
      {calendar.length > 0 && (
        <ChartCard title="تقویم سود/زیان روزانه">
          <div className="overflow-x-auto">
            <div className="flex gap-1 text-xs text-muted mb-1 pr-6">
              {["ش","ی","د","س","چ","پ","ج"].map((d, i) => (
                <div key={i} className="w-8 text-center shrink-0">{d}</div>
              ))}
            </div>
            <div className="space-y-1">
              {calendar.map((week, wi) => (
                <div key={wi} className="flex gap-1">
                  {week.map((day, di) => {
                    const pnl = day.pnl;
                    let bg = "bg-surface-2";
                    if (pnl !== null) {
                      if (pnl > 0) bg = pnl > 100 ? "bg-green-500" : pnl > 20 ? "bg-green-400" : "bg-green-200";
                      else if (pnl < 0) bg = pnl < -100 ? "bg-red-500" : pnl < -20 ? "bg-red-400" : "bg-red-200";
                      else bg = "bg-surface-2";
                    }
                    return (
                      <div
                        key={di}
                        title={pnl !== null ? `${day.date}: $${pnl.toFixed(2)}` : day.date}
                        className={`h-8 w-8 shrink-0 rounded ${bg} flex items-center justify-center`}
                      >
                        <span className="text-[9px] text-white/80">
                          {new Date(day.date).getDate()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted">
              <span>کم‌تر</span>
              <div className="flex gap-1">
                {["bg-red-500","bg-red-400","bg-red-200","bg-surface-2","bg-green-200","bg-green-400","bg-green-500"].map((c, i) => (
                  <div key={i} className={`h-3 w-4 rounded ${c}`} />
                ))}
              </div>
              <span>بیش‌تر</span>
            </div>
          </div>
        </ChartCard>
      )}

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
                      { name: "done", value: data.checklistDiscipline },
                      { name: "rest", value: Math.max(0, 100 - data.checklistDiscipline) },
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
                {formatPct(data.checklistDiscipline, 0)}
              </div>
            </div>
            <p className="text-sm text-muted">میانگین رعایت چک‌لیست در معاملات</p>
            <div className="grid w-full grid-cols-3 gap-2 text-center text-xs">
              <div className="tj-card p-2">
                <div className="text-muted">برد</div>
                <div className="font-bold text-profit">{formatPct(data.winRate)}</div>
              </div>
              <div className="tj-card p-2">
                <div className="text-muted">PF</div>
                <div className="font-bold">{formatRatio(data.profitFactor)}</div>
              </div>
              <div className="tj-card p-2">
                <div className="text-muted">میانگین R:R</div>
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
