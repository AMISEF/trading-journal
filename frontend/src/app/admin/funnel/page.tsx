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

const FA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

function fa(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replace(/[0-9]/g, (d) => FA[+d]);
}

function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${fa(value.toFixed(1))}٪`;
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
  if (good) return { t: "عالی", c: "#22c55e" };
  if (ok) return { t: "قابل قبول", c: "#f59e0b" };
  return { t: "نیاز به بهبود", c: "#f87171" };
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
                داده‌ای ثبت نشده
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
      // پایهٔ نشانی API خودش /api دارد؛ پس اینجا بدون پیشوند.
      const res = await http.get("/analytics/funnel", { params: { days } });
      setData(res.data);
    } catch {
      setError("دریافت گزارش قیف ممکن نشد.");
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
          اندازه‌گیری قیف محصول
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          از بازدید لندینگ تا خرید اشتراک — دقیقاً ببینید کجا کاربر را از دست می‌دهید.
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
            {d === 365 ? "۱ سال" : `${fa(d)} روز`}
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
          در حال محاسبه…
        </p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto max-w-6xl p-4">
        {topBar}
        <p className="py-10 text-center text-sm" style={{ color: "var(--loss)" }}>
          {error || "خطا"}
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
          title="بازدید ← ثبت‌نام"
          value={data.headline.visitToSignup}
          metric="visitToSignup"
          note="هدف سالم: بالای ۳٪"
        />
        <Headline
          title="ثبت‌نام ← اولین معامله"
          value={data.headline.signupToActivation}
          metric="signupToActivation"
          note="مهم‌ترین عدد محصول — هدف: بالای ۵۰٪"
        />
        <Headline
          title="اولین معامله ← خرید"
          value={data.headline.activationToPaid}
          metric="activationToPaid"
          note="هدف سالم: بالای ۱۰٪"
        />
        <Headline
          title="ریزش ماهانه"
          value={data.headline.monthlyChurn}
          metric="monthlyChurn"
          note="کمتر از ۵٪ عالی است"
        />
      </div>

      {/* نمودار قیف */}
      <div className="tj-card mb-4 p-4">
        <p className="mb-4 text-sm font-bold" style={{ color: "var(--text)" }}>
          قیف کامل تبدیل
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
                    از {s.of}
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
          بازدید تا خرید:{" "}
          <b style={{ color: "var(--text)" }}>{pct(data.headline.visitToPaid)}</b>
        </p>
      </div>

      {/* KPI ها */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="بازدیدکنندهٔ یکتا"
          value={fa(data.counts.visitors)}
          sub={
            data.growth.visitors === null || data.growth.visitors === undefined
              ? undefined
              : `نسبت به دورهٔ قبل: ${pct(data.growth.visitors)}`
          }
        />
        <Kpi
          label="بازدید صفحه"
          value={fa(data.counts.pageviews)}
          sub={`میانگین هر نفر: ${fa(data.counts.pagesPerVisitor)}`}
        />
        <Kpi label="ثبت‌نام جدید" value={fa(data.counts.signups)} />
        <Kpi
          label="کاربر فعال‌شده"
          value={fa(data.counts.activated)}
          sub={`۵ معامله یا بیشتر: ${fa(data.counts.engaged)}`}
        />
        <Kpi
          label="معاملهٔ جدید"
          value={fa(data.counts.newTrades)}
          sub={`کل معاملات: ${fa(data.lifetime.trades)}`}
        />
        <Kpi
          label="مدت تا اولین معامله"
          value={
            data.medianHoursToActivate === null
              ? "—"
              : `${fa(data.medianHoursToActivate)} ساعت`
          }
          sub="میانهٔ فاصلهٔ ثبت‌نام تا اولین معامله"
        />
        <Kpi
          label="مشترک فعال"
          value={fa(data.retention.activePaid)}
          sub={`۷ روز تا انقضا: ${fa(data.retention.expiring7d)}`}
        />
        <Kpi
          label="اشتراک منقضی‌شده"
          value={fa(data.retention.expired30d)}
          sub="در ۳۰ روز گذشته"
        />
      </div>

      {/* روند روزانه */}
      <div className="tj-card mb-4 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold" style={{ color: "var(--text)" }}>
            روند روزانه
          </p>
          <span className="text-[11px]" style={{ color: "var(--muted)" }}>
            <span style={{ color: "#38bdf8" }}>■</span> بازدید{"  "}
            <span style={{ color: "#22c55e" }}>■</span> ثبت‌نام{"  "}
            <span style={{ color: "#f59e0b" }}>■</span> معامله
          </span>
        </div>
        <div className="flex h-24 items-end gap-1">
          {data.trend.slice(-30).map((d) => (
            <div
              key={d.day}
              className="flex h-full flex-1 flex-col justify-end gap-[2px]"
              title={d.day}
            >
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
          title="منابع ورودی"
          head={["منبع", "کاربر", "بازدید"]}
          rows={data.sources.map((s) => [s.key, fa(s.visitors), fa(s.views)])}
        />
        <Table
          title="دستگاه"
          head={["نوع", "کاربر"]}
          rows={data.devices.map((s) => [s.key, fa(s.visitors)])}
        />
        <Table
          title="پربازدیدترین صفحات"
          head={["مسیر", "بازدید", "کاربر"]}
          rows={data.pages.map((s) => [s.key, fa(s.views), fa(s.visitors)])}
        />
        <Table
          title="کوهورت ماهانه"
          head={["ماه", "ثبت‌نام", "فعال", "خرید"]}
          rows={data.cohorts.map((c) => [
            c.month,
            fa(c.signups),
            `${fa(c.activated)} (${pct(c.activationRate)})`,
            `${fa(c.paid)} (${pct(c.paidRate)})`,
          ])}
        />
      </div>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        از ابتدا تا امروز: {fa(data.lifetime.users)} کاربر · {fa(data.lifetime.activated)} فعال (
        {pct(data.lifetime.activationRate)}) · {fa(data.lifetime.paid)} خرید (
        {pct(data.lifetime.paidRate)}) · {fa(data.lifetime.tradesPerActive)} معامله به ازای هر
        کاربر فعال
      </p>
    </main>
  );
}
