"use client";

/**
 * اندازه‌گیری قیف محصول — پنل مدیریت.
 *
 * سه عددی که تصمیم می‌سازند:
 *   • بازدید لندینگ ← ثبت‌نام
 *   • ثبت‌نام ← اولین معامله   (مهم‌ترین عدد محصول)
 *   • اولین معامله ← خرید + ریزش ماهانه
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import http from "@/lib/api";
import { useAuth } from "@/store/auth";

type Step = {
  key: string;
  label: string;
  value: number;
  rate: number;
  of: string | null;
  hint: string;
};

type Group = { key: string; visitors: number; views: number };

type Funnel = {
  days: number;
  steps: Step[];
  headline: Record<string, number>;
  counts: Record<string, number>;
  lifetime: Record<string, number>;
  retention: Record<string, number>;
  growth: Record<string, number | null>;
  trend: { day: string; visitors: number; views: number; signups: number; trades: number }[];
  sources: Group[];
  devices: Group[];
  pages: Group[];
  cohorts: {
    month: string;
    signups: number;
    activated: number;
    paid: number;
    activationRate: number;
    paidRate: number;
  }[];
  medianHoursToActivate: number | null;
  trackingSince: string | null;
};

const FA = ["\u06f0", "\u06f1", "\u06f2", "\u06f3", "\u06f4", "\u06f5", "\u06f6", "\u06f7", "\u06f8", "\u06f9"];

function fa(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "\u2014";
  return String(value).replace(/[0-9]/g, (d) => FA[+d]);
}

function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return "\u2014";
  return `${fa(value.toFixed(1))}\u066a`;
}

const STEP_COLORS = ["#38bdf8", "#22c55e", "#f59e0b", "#eab308", "#a855f7"];

function verdict(key: string, value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const scale: Record<string, [number, number]> = {
    visitToSignup: [1, 3],
    signupToActivation: [25, 50],
    activationToPaid: [3, 10],
    monthlyChurn: [10, 5],
  };
  const s = scale[key];
  if (!s) return null;
  const good = key === "monthlyChurn" ? value <= s[1] : value >= s[1];
  const ok = key === "monthlyChurn" ? value <= s[0] : value >= s[0];
  if (good) return { t: "\u0639\u0627\u0644\u06cc", c: "#22c55e" };
  if (ok) return { t: "\u0642\u0627\u0628\u0644 \u0642\u0628\u0648\u0644", c: "#f59e0b" };
  return { t: "\u0646\u06cc\u0627\u0632 \u0628\u0647 \u0628\u0647\u0628\u0648\u062f", c: "#f87171" };
}

function Headline({
  title,
  value,
  metric,
  note,
}: {
  title: string;
  value: number;
  metric: string;
  note: string;
}) {
  const v = verdict(metric, value);
  return (
    <div className="tj-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {title}
        </p>
        {v && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ color: v.c, background: `${v.c}1f` }}
          >
            {v.t}
          </span>
        )}
      </div>
      <div className="mt-1 text-2xl font-extrabold" style={{ color: "var(--text)" }}>
        {pct(value)}
      </div>
      <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
        {note}
      </p>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="tj-card p-3">
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <div className="mt-1 text-lg font-bold" style={{ color: "var(--text)" }}>
        {value}
      </div>
      {sub && (
        <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function Table({
  title,
  head,
  rows,
}: {
  title: string;
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="tj-card p-4">
      <p className="mb-2 text-sm font-bold" style={{ color: "var(--text)" }}>
        {title}
      </p>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="py-2 text-right text-xs font-semibold"
                style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={head.length}
                className="py-4 text-center text-xs"
                style={{ color: "var(--muted)" }}
              >
                {"\u062f\u0627\u062f\u0647\u200c\u0627\u06cc \u062b\u0628\u062a \u0646\u0634\u062f\u0647"}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td
                    key={j}
                    className="py-2 text-[13px]"
                    style={{ color: "var(--text)", borderBottom: "1px solid var(--border)" }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminFunnelPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Funnel | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await http.get("/api/analytics/funnel", { params: { days } });
      setData(res.data);
    } catch {
      setError("\u062f\u0631\u06cc\u0627\u0641\u062a \u06af\u0632\u0627\u0631\u0634 \u0642\u06cc\u0641 \u0645\u0645\u06a9\u0646 \u0646\u0634\u062f.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (user && user.role !== "ADMIN") router.replace("/dashboard");
  }, [user, router]);

  useEffect(() => {
    load();
  }, [load]);

  const topBar = (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-extrabold" style={{ color: "var(--text)" }}>
          {"\u0627\u0646\u062f\u0627\u0632\u0647\u200c\u06af\u06cc\u0631\u06cc \u0642\u06cc\u0641 \u0645\u062d\u0635\u0648\u0644"}
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          {"\u0627\u0632 \u0628\u0627\u0632\u062f\u06cc\u062f \u0644\u0646\u062f\u06cc\u0646\u06af \u062a\u0627 \u062e\u0631\u06cc\u062f \u0627\u0634\u062a\u0631\u0627\u06a9 \u2014 \u062f\u0642\u06cc\u0642\u0627\u064b \u0628\u0628\u06cc\u0646\u06cc\u062f \u06a9\u062c\u0627 \u06a9\u0627\u0631\u0628\u0631 \u0631\u0627 \u0627\u0632 \u062f\u0633\u062a \u0645\u06cc\u200c\u062f\u0647\u06cc\u062f."}
        </p>
      </div>
      <div
        className="flex gap-1 rounded-xl p-1"
        style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
      >
        {[7, 30, 90, 365].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className="rounded-lg px-3 py-1.5 text-xs transition"
            style={
              days === d
                ? { background: "var(--primary)", color: "#06121d", fontWeight: 700 }
                : { color: "var(--muted)" }
            }
          >
            {d === 365 ? "\u06f1 \u0633\u0627\u0644" : `${fa(d)} \u0631\u0648\u0632`}
          </button>
        ))}
      </div>
    </div>
  );

  if (loading && !data) {
    return (
      <main className="mx-auto max-w-6xl p-4">
        {topBar}
        <p className="py-10 text-center text-sm" style={{ color: "var(--muted)" }}>
          {"\u062f\u0631 \u062d\u0627\u0644 \u0645\u062d\u0627\u0633\u0628\u0647\u2026"}
        </p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto max-w-6xl p-4">
        {topBar}
        <p className="py-10 text-center text-sm" style={{ color: "var(--loss)" }}>
          {error || "\u062e\u0637\u0627"}
        </p>
      </main>
    );
  }

  const top = Math.max(...data.steps.map((s) => s.value), 1);
  const trendTop = Math.max(
    ...data.trend.map((d) => Math.max(d.visitors, d.signups, d.trades)),
    1,
  );

  return (
    <main className="mx-auto max-w-6xl p-4">
      {topBar}

      {/* سه عدد طلایی + ریزش */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Headline
          title={"\u0628\u0627\u0632\u062f\u06cc\u062f \u2190 \u062b\u0628\u062a\u200c\u0646\u0627\u0645"}
          value={data.headline.visitToSignup}
          metric="visitToSignup"
          note={"\u0647\u062f\u0641 \u0633\u0627\u0644\u0645: \u0628\u0627\u0644\u0627\u06cc \u06f3\u066a"}
        />
        <Headline
          title={"\u062b\u0628\u062a\u200c\u0646\u0627\u0645 \u2190 \u0627\u0648\u0644\u06cc\u0646 \u0645\u0639\u0627\u0645\u0644\u0647"}
          value={data.headline.signupToActivation}
          metric="signupToActivation"
          note={"\u0645\u0647\u0645\u200c\u062a\u0631\u06cc\u0646 \u0639\u062f\u062f \u0645\u062d\u0635\u0648\u0644 \u2014 \u0647\u062f\u0641: \u0628\u0627\u0644\u0627\u06cc \u06f5\u06f0\u066a"}
        />
        <Headline
          title={"\u0627\u0648\u0644\u06cc\u0646 \u0645\u0639\u0627\u0645\u0644\u0647 \u2190 \u062e\u0631\u06cc\u062f"}
          value={data.headline.activationToPaid}
          metric="activationToPaid"
          note={"\u0647\u062f\u0641 \u0633\u0627\u0644\u0645: \u0628\u0627\u0644\u0627\u06cc \u06f1\u06f0\u066a"}
        />
        <Headline
          title={"\u0631\u06cc\u0632\u0634 \u0645\u0627\u0647\u0627\u0646\u0647"}
          value={data.headline.monthlyChurn}
          metric="monthlyChurn"
          note={"\u06a9\u0645\u062a\u0631 \u0627\u0632 \u06f5\u066a \u0639\u0627\u0644\u06cc \u0627\u0633\u062a"}
        />
      </div>

      {/* نمودار قیف */}
      <div className="tj-card mb-4 p-4">
        <p className="mb-4 text-sm font-bold" style={{ color: "var(--text)" }}>
          {"\u0642\u06cc\u0641 \u06a9\u0627\u0645\u0644 \u062a\u0628\u062f\u06cc\u0644"}
        </p>
        {data.steps.map((s, i) => (
          <div key={s.key} className="mb-3">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                {fa(i + 1)}. {s.label}{" "}
                <span className="text-[11px] font-normal" style={{ color: "var(--muted)" }}>
                  {s.hint}
                </span>
              </span>
              {i > 0 && (
                <span
                  className="text-xs font-bold"
                  style={{ color: STEP_COLORS[i % STEP_COLORS.length] }}
                >
                  {pct(s.rate)}{" "}
                  <span className="font-normal" style={{ color: "var(--muted)" }}>
                    {"\u0627\u0632 "}
                    {s.of}
                  </span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div
                className="h-6 flex-1 overflow-hidden rounded-lg"
                style={{ background: "var(--surface-2)" }}
              >
                <div
                  className="h-full rounded-lg"
                  style={{
                    width: `${Math.max(4, Math.round((s.value / top) * 100))}%`,
                    background: STEP_COLORS[i % STEP_COLORS.length],
                  }}
                />
              </div>
              <span
                className="min-w-[56px] text-left text-[15px] font-extrabold"
                style={{ color: "var(--text)" }}
              >
                {fa(s.value)}
              </span>
            </div>
          </div>
        ))}
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {"\u0628\u0627\u0632\u062f\u06cc\u062f \u062a\u0627 \u062e\u0631\u06cc\u062f: "}
          <b style={{ color: "var(--text)" }}>{pct(data.headline.visitToPaid)}</b>
        </p>
      </div>

      {/* KPI ها */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label={"\u0628\u0627\u0632\u062f\u06cc\u062f\u06a9\u0646\u0646\u062f\u0647\u0654 \u06cc\u06a9\u062a\u0627"}
          value={fa(data.counts.visitors)}
          sub={
            data.growth.visitors === null || data.growth.visitors === undefined
              ? undefined
              : `\u0646\u0633\u0628\u062a \u0628\u0647 \u062f\u0648\u0631\u0647\u0654 \u0642\u0628\u0644: ${pct(data.growth.visitors)}`
          }
        />
        <Kpi
          label={"\u0628\u0627\u0632\u062f\u06cc\u062f \u0635\u0641\u062d\u0647"}
          value={fa(data.counts.pageviews)}
          sub={`\u0645\u06cc\u0627\u0646\u06af\u06cc\u0646 \u0647\u0631 \u0646\u0641\u0631: ${fa(data.counts.pagesPerVisitor)}`}
        />
        <Kpi
          label={"\u062b\u0628\u062a\u200c\u0646\u0627\u0645 \u062c\u062f\u06cc\u062f"}
          value={fa(data.counts.signups)}
        />
        <Kpi
          label={"\u06a9\u0627\u0631\u0628\u0631 \u0641\u0639\u0627\u0644\u200c\u0634\u062f\u0647"}
          value={fa(data.counts.activated)}
          sub={`\u06f5 \u0645\u0639\u0627\u0645\u0644\u0647 \u06cc\u0627 \u0628\u06cc\u0634\u062a\u0631: ${fa(data.counts.engaged)}`}
        />
        <Kpi
          label={"\u0645\u0639\u0627\u0645\u0644\u0647\u0654 \u062c\u062f\u06cc\u062f"}
          value={fa(data.counts.newTrades)}
          sub={`\u06a9\u0644 \u0645\u0639\u0627\u0645\u0644\u0627\u062a: ${fa(data.lifetime.trades)}`}
        />
        <Kpi
          label={"\u0645\u062f\u062a \u062a\u0627 \u0627\u0648\u0644\u06cc\u0646 \u0645\u0639\u0627\u0645\u0644\u0647"}
          value={
            data.medianHoursToActivate === null
              ? "\u2014"
              : `${fa(data.medianHoursToActivate)} \u0633\u0627\u0639\u062a`
          }
          sub={"\u0645\u06cc\u0627\u0646\u0647\u0654 \u0641\u0627\u0635\u0644\u0647\u0654 \u062b\u0628\u062a\u200c\u0646\u0627\u0645 \u062a\u0627 \u0627\u0648\u0644\u06cc\u0646 \u0645\u0639\u0627\u0645\u0644\u0647"}
        />
        <Kpi
          label={"\u0645\u0634\u062a\u0631\u06a9 \u0641\u0639\u0627\u0644"}
          value={fa(data.retention.activePaid)}
          sub={`\u06f7 \u0631\u0648\u0632 \u062a\u0627 \u0627\u0646\u0642\u0636\u0627: ${fa(data.retention.expiring7d)}`}
        />
        <Kpi
          label={"\u0627\u0634\u062a\u0631\u0627\u06a9 \u0645\u0646\u0642\u0636\u06cc\u200c\u0634\u062f\u0647"}
          value={fa(data.retention.expired30d)}
          sub={"\u062f\u0631 \u06f3\u06f0 \u0631\u0648\u0632 \u06af\u0630\u0634\u062a\u0647"}
        />
      </div>

      {/* روند روزانه */}
      <div className="tj-card mb-4 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold" style={{ color: "var(--text)" }}>
            {"\u0631\u0648\u0646\u062f \u0631\u0648\u0632\u0627\u0646\u0647"}
          </p>
          <span className="text-[11px]" style={{ color: "var(--muted)" }}>
            <span style={{ color: "#38bdf8" }}>\u25a0</span>{" "}
            {"\u0628\u0627\u0632\u062f\u06cc\u062f"}{"  "}
            <span style={{ color: "#22c55e" }}>\u25a0</span>{" "}
            {"\u062b\u0628\u062a\u200c\u0646\u0627\u0645"}{"  "}
            <span style={{ color: "#f59e0b" }}>\u25a0</span>{" "}
            {"\u0645\u0639\u0627\u0645\u0644\u0647"}
          </span>
        </div>
        <div className="flex h-24 items-end gap-1">
          {data.trend.slice(-30).map((d) => (
            <div key={d.day} className="flex h-full flex-1 flex-col justify-end gap-[2px]" title={d.day}>
              <div
                style={{
                  height: `${(d.visitors / trendTop) * 100}%`,
                  background: "#38bdf8",
                  minHeight: 2,
                  borderRadius: "3px 3px 0 0",
                }}
              />
              <div
                style={{
                  height: `${(d.signups / trendTop) * 100}%`,
                  background: "#22c55e",
                  minHeight: 1,
                }}
              />
              <div
                style={{
                  height: `${(d.trades / trendTop) * 100}%`,
                  background: "#f59e0b",
                  minHeight: 1,
                  borderRadius: "0 0 3px 3px",
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* جدول‌ها */}
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Table
          title={"\u0645\u0646\u0627\u0628\u0639 \u0648\u0631\u0648\u062f\u06cc"}
          head={["\u0645\u0646\u0628\u0639", "\u06a9\u0627\u0631\u0628\u0631", "\u0628\u0627\u0632\u062f\u06cc\u062f"]}
          rows={data.sources.map((s) => [s.key, fa(s.visitors), fa(s.views)])}
        />
        <Table
          title={"\u062f\u0633\u062a\u06af\u0627\u0647"}
          head={["\u0646\u0648\u0639", "\u06a9\u0627\u0631\u0628\u0631"]}
          rows={data.devices.map((s) => [s.key, fa(s.visitors)])}
        />
        <Table
          title={"\u067e\u0631\u0628\u0627\u0632\u062f\u06cc\u062f\u062a\u0631\u06cc\u0646 \u0635\u0641\u062d\u0627\u062a"}
          head={["\u0645\u0633\u06cc\u0631", "\u0628\u0627\u0632\u062f\u06cc\u062f", "\u06a9\u0627\u0631\u0628\u0631"]}
          rows={data.pages.map((s) => [s.key, fa(s.views), fa(s.visitors)])}
        />
        <Table
          title={"\u06a9\u0648\u0647\u0648\u0631\u062a \u0645\u0627\u0647\u0627\u0646\u0647"}
          head={["\u0645\u0627\u0647", "\u062b\u0628\u062a\u200c\u0646\u0627\u0645", "\u0641\u0639\u0627\u0644", "\u062e\u0631\u06cc\u062f"]}
          rows={data.cohorts.map((c) => [
            c.month,
            fa(c.signups),
            `${fa(c.activated)} (${pct(c.activationRate)})`,
            `${fa(c.paid)} (${pct(c.paidRate)})`,
          ])}
        />
      </div>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {"\u0627\u0632 \u0627\u0628\u062a\u062f\u0627 \u062a\u0627 \u0627\u0645\u0631\u0648\u0632: "}
        {fa(data.lifetime.users)}
        {" \u06a9\u0627\u0631\u0628\u0631 \u00b7 "}
        {fa(data.lifetime.activated)}
        {" \u0641\u0639\u0627\u0644 ("}
        {pct(data.lifetime.activationRate)}
        {") \u00b7 "}
        {fa(data.lifetime.paid)}
        {" \u062e\u0631\u06cc\u062f ("}
        {pct(data.lifetime.paidRate)}
        {") \u00b7 "}
        {fa(data.lifetime.tradesPerActive)}
        {" \u0645\u0639\u0627\u0645\u0644\u0647 \u0628\u0647 \u0627\u0632\u0627\u06cc \u0647\u0631 \u06a9\u0627\u0631\u0628\u0631 \u0641\u0639\u0627\u0644"}
      </p>
    </main>
  );
}
