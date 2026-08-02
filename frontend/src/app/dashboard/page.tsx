"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button, Spinner } from "@/components/ui";
import { DashboardView } from "@/components/DashboardView";
import { PnlCardStudio } from "@/components/PnlCardStudio";
import { dashboardApi, tradesApi, publicApi } from "@/lib/api";
import type { DashboardData, Trade } from "@/lib/types";
import { DemoTradesPanel } from "@/components/DemoTradesPanel";
import { getJalaliParts, jalaliWeekday, toPersianDigits } from "@/lib/jalali";

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardInner />
    </AppShell>
  );
}

// ─── Pastel design tokens (سربرگ صفحه؛ بقیهٔ رنگ‌ها داخل DashboardView است) ──
const TINTS = {
  mint: "94,234,212",
  violet: "167,139,250",
  sky: "125,211,252",
} as const;

// ─── Main dashboard ────────────────────────────────────────────────────

const DEMO_KEY = "tj_demo_on";

/** Live Jalali date + weekday + clock shown at the top of the dashboard. */
function JalaliClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  const iso = now.toISOString();
  const jp = getJalaliParts(iso);
  const weekday = jalaliWeekday(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = toPersianDigits(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-4 py-2.5 text-sm"
      style={{
        background: `linear-gradient(150deg, rgba(${TINTS.sky},0.16), rgba(${TINTS.violet},0.05) 60%, var(--glass-bg))`,
        border: `1px solid rgba(${TINTS.sky},0.28)`,
      }}
    >
      <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: `rgba(${TINTS.sky},0.18)`, color: `rgb(${TINTS.sky})` }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
        </svg>
      </span>
      {jp && (
        <span className="font-bold">
          {weekday}، {toPersianDigits(jp.day)} {jp.monthName} {toPersianDigits(jp.year)}
        </span>
      )}
      <span className="text-muted">·</span>
      <span className="font-mono font-bold tabular-nums" style={{ color: `rgb(${TINTS.sky})` }} dir="ltr">{time}</span>
    </div>
  );
}

function DashboardInner() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  // ── استودیوی ساخت تصویر برایند ──
  const [studioOpen, setStudioOpen] = useState(false);

  // ── Demo mode: render a sample showcase journal read-only (name never shown) ──
  const [demoOn, setDemoOn] = useState(false);
  const [demoTrades, setDemoTrades] = useState<Trade[] | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);

  const loadReal = () =>
    dashboardApi
      .get()
      .then(setData)
      .catch(() => setError("بارگذاری داشبورد با خطا مواجه شد."));

  const enterDemo = async () => {
    setDemoBusy(true);
    setError("");
    try {
      const s = await publicApi.demoSummary();
      if (!s.available) {
        alert("در حال حاضر حساب دمو تنظیم نشده است.");
        return;
      }
      const [dash, trades] = await Promise.all([publicApi.demoDashboard(), publicApi.demoTrades()]);
      setData(dash);
      setDemoTrades(trades);
      setDemoOn(true);
      if (typeof window !== "undefined") localStorage.setItem(DEMO_KEY, "1");
    } catch {
      alert("بارگذاری دمو ممکن نشد. کمی بعد دوباره تلاش کنید.");
    } finally {
      setDemoBusy(false);
    }
  };

  const exitDemo = () => {
    setDemoOn(false);
    setDemoTrades(null);
    if (typeof window !== "undefined") localStorage.removeItem(DEMO_KEY);
    setData(null);
    loadReal();
  };

  useEffect(() => {
    const wantDemo = typeof window !== "undefined" && localStorage.getItem(DEMO_KEY) === "1";
    if (wantDemo) enterDemo();
    else loadReal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createTrade = async () => {
    setCreating(true);
    try {
      const t = await tradesApi.create();
      router.push(`/journals/${t.id}`);
    } catch {
      setCreating(false);
    }
  };

  if (error) return <p className="text-loss">{error}</p>;
  if (!data) return <Spinner label="در حال بارگذاری داشبورد…" />;

  return (
    <DashboardView
      data={data}
      header={
        <>
          {/* ── Title ── */}
          <div className="flex flex-wrap items-center justify-between gap-3">
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
              <JalaliClock />
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {demoOn ? (
                <button
                  type="button"
                  onClick={exitDemo}
                  className="rounded-xl px-4 py-2 text-sm font-bold text-white transition-all hover:-translate-y-0.5 active:scale-95"
                  style={{
                    background: "linear-gradient(120deg, rgb(248,68,68), rgb(219,39,39))",
                    boxShadow: "0 12px 28px -12px rgba(248,68,68,0.8)",
                  }}
                >
                  ✕ حذف دمو
                </button>
              ) : (
                <button
                  type="button"
                  onClick={enterDemo}
                  disabled={demoBusy}
                  className="rounded-xl px-4 py-2 text-sm font-bold text-[#06121f] transition-all hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    background: `linear-gradient(120deg, rgb(${TINTS.violet}), rgb(${TINTS.sky}))`,
                    boxShadow: `0 12px 28px -12px rgba(${TINTS.violet},0.8)`,
                  }}
                >
                  {demoBusy ? "در حال بارگذاری…" : "🎬 ایجاد دمو"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setStudioOpen(true)}
                className="rounded-xl px-4 py-2 text-sm font-extrabold text-[#2a1200] transition-all hover:-translate-y-0.5 active:scale-95"
                style={{
                  background: "linear-gradient(120deg, rgb(251,191,36), rgb(244,114,182))",
                  boxShadow: "0 12px 28px -12px rgba(251,146,60,0.9)",
                }}
              >
                🖼️ ساخت تصویر برایند
              </button>
              {!demoOn && (
                <Button onClick={createTrade} disabled={creating}>
                  {creating ? "در حال ساخت…" : "+ ثبت معامله جدید"}
                </Button>
              )}
            </div>
          </div>

          {/* ── استودیوی تصویر برایند ── */}
          <PnlCardStudio
            data={data}
            open={studioOpen}
            onClose={() => setStudioOpen(false)}
            nameOverride={demoOn ? "حساب دموی الگو هاب" : undefined}
          />

          {/* ── Demo banner ── */}
          {demoOn && (
            <div
              className="flex flex-wrap items-center gap-3 rounded-2xl px-5 py-3.5"
              style={{
                background: `linear-gradient(150deg, rgba(${TINTS.violet},0.16), rgba(${TINTS.sky},0.06) 60%, var(--glass-bg))`,
                border: `1px solid rgba(${TINTS.violet},0.3)`,
              }}
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl text-lg" style={{ background: `rgba(${TINTS.violet},0.2)` }}>🎬</span>
              <div className="text-sm">
                <div className="font-bold">حالت دمو — نمونهٔ یک ژورنالِ کامل</div>
                <div className="text-xs text-muted">این یک دموی نمونه است تا ببینید سایت چطور پر می‌شود و نتایج چطور نمایش داده می‌شوند. برای بازگشت به ژورنال خودتان «حذف دمو» را بزنید.</div>
              </div>
            </div>
          )}
        </>
      }
      footer={
        demoOn && demoTrades ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-extrabold">معاملات دمو</h2>
              <span className="h-2 w-2 rounded-full animate-pulse-dot" style={{ background: `rgb(${TINTS.violet})` }} />
            </div>
            <DemoTradesPanel trades={demoTrades} />
          </div>
        ) : null
      }
    />
  );
}
