"use client";

/**
 * لیگ تریدرها (Traders League) — لیدربردِ رقابتیِ کاربران.
 *
 * ساختار صفحه:
 *   ۱) سربرگِ مسابقه با دوره‌ی جاری و رتبهٔ خودِ کاربر،
 *   ۲) تبِ بازه‌ها (روزانه / هفتگی / ماهانه / فصلی / سالانه) + پیمایشِ دوره،
 *   ۳) نوارِ معیارها (درصد سود، امتیاز لیگ، حجم، اهرم، افت سرمایه، …)،
 *   ۴) سکوی قهرمانی (سه نفر اول)،
 *   ۵) جدولِ کاملِ رتبه‌بندی با همهٔ آمار.
 *
 * همهٔ محاسبات سمتِ بک‌اند انجام می‌شود (`/api/league`)؛ این‌جا فقط نمایش است.
 * از هر کاربر تنها **نام کاربری** نشان داده می‌شود؛ ادمین (و فقط ادمین) دکمهٔ
 * «مشاهدهٔ پروفایل» را می‌بیند که او را به داشبورد و ژورنالِ کاملِ آن تریدر
 * می‌برد.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/ui";
import { ExchangeLogo } from "@/components/ExchangeLogo";
import { leagueApi } from "@/lib/api";
import { useAuth } from "@/store/auth";
import type { LeagueBoard, LeagueEntry, LeagueMeta, LeaguePeriod } from "@/lib/types";
import { faNum, formatPct, formatRatio, formatSignedUsd, formatUsd } from "@/lib/format";

export default function LeaguePage() {
  return (
    <AppShell>
      <LeagueInner />
    </AppShell>
  );
}

// ─── طراحی ────────────────────────────────────────────────────────────────────

const TINTS = {
  gold: "251,191,36",
  silver: "203,213,225",
  bronze: "205,127,50",
  violet: "167,139,250",
  mint: "94,234,212",
  sky: "125,211,252",
  rose: "244,114,182",
} as const;

const PERIOD_LABELS: Record<LeaguePeriod, string> = {
  daily: "روزانه",
  weekly: "هفتگی",
  monthly: "ماهانه",
  quarterly: "فصلی",
  yearly: "سالانه",
};

/** رنگ و نشانِ سکو برای سه ردهٔ اول. */
const PODIUM = [
  { tint: TINTS.gold, medal: "🥇", title: "قهرمان دوره", ring: "0 0 60px -12px rgba(251,191,36,0.9)" },
  { tint: TINTS.silver, medal: "🥈", title: "نایب قهرمان", ring: "0 0 48px -14px rgba(203,213,225,0.75)" },
  { tint: TINTS.bronze, medal: "🥉", title: "سکوی سوم", ring: "0 0 48px -14px rgba(205,127,50,0.75)" },
] as const;

function glass(rgb: string, strength = 1): React.CSSProperties {
  return {
    background: `linear-gradient(150deg, rgba(${rgb},${0.18 * strength}) 0%, rgba(${rgb},${0.05 * strength}) 48%, var(--glass-bg) 100%)`,
    border: `1px solid rgba(${rgb},${0.24 * strength})`,
    backdropFilter: "blur(20px) saturate(155%)",
    WebkitBackdropFilter: "blur(20px) saturate(155%)",
    boxShadow: `0 16px 48px -20px rgba(${rgb},0.42), inset 0 1px 0 rgba(255,255,255,0.10)`,
  };
}

/**
 * ضریب سود. اگر کاربر در دوره هیچ معاملهٔ زیان‌دهی نداشته باشد مخرج صفر است و
 * بک‌اند ``null`` می‌فرستد؛ آن حالت «بی‌نهایت» است، نه «نامعلوم».
 */
function formatProfitFactor(e: LeagueEntry): string {
  if (e.profitFactor != null) return formatRatio(e.profitFactor);
  return e.tradeCount > 0 && e.pnlUsd > 0 ? "∞" : "—";
}

/**
 * درصدِ بدون علامتِ ±. فقط سود/زیان علامت می‌گیرد؛ وین‌ریت، افت سرمایه، انضباط و
 * روزهای سبز همیشه نامنفی‌اند و «+» گذاشتن روی‌شان گمراه‌کننده است.
 */
function plainPct(value: number, digits = 2): string {
  return `${value.toFixed(digits)}%`;
}

/** مقدارِ یک معیار را با واحدِ خودش قالب‌بندی کن. */
function formatMetric(entry: LeagueEntry, key: string, unit: string): string {
  if (key === "profitFactor") return formatProfitFactor(entry);
  const raw = (entry as unknown as Record<string, number | null>)[key];
  if (raw === null || raw === undefined) return "—";
  switch (unit) {
    case "percent":
      // فقط «درصد سود» علامت‌دار است. افت سرمایه از قبل درصد است؛ وین‌ریت،
      // انضباط و روزهای سبز کسری (۰..۱) هستند و باید ×۱۰۰ شوند.
      if (key === "pnlPercent") return formatPct(raw);
      return plainPct(key === "maxDrawdown" ? raw : raw * 100);
    case "usd":
      return key === "pnlUsd" ? formatSignedUsd(raw) : formatUsd(raw);
    case "ratio":
      return formatRatio(raw);
    case "x":
      return `${faNum(Math.round(raw * 10) / 10)}×`;
    case "score":
      return faNum(raw.toFixed(1));
    default:
      return faNum(raw);
  }
}

/** آیا مقدار مثبت است؟ (برای رنگِ سود/زیان) */
function tone(entry: LeagueEntry, key: string): string {
  if (key === "pnlPercent") return entry.pnlPercent > 0 ? "text-profit" : entry.pnlPercent < 0 ? "text-loss" : "text-muted";
  if (key === "pnlUsd") return entry.pnlUsd > 0 ? "text-profit" : entry.pnlUsd < 0 ? "text-loss" : "text-muted";
  return "";
}

// ─── صفحه ─────────────────────────────────────────────────────────────────────

function LeagueInner() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [meta, setMeta] = useState<LeagueMeta | null>(null);
  const [board, setBoard] = useState<LeagueBoard | null>(null);
  const [period, setPeriod] = useState<LeaguePeriod>("monthly");
  const [metric, setMetric] = useState("pnlPercent");
  const [windowKey, setWindowKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    leagueApi.meta().then(setMeta).catch(() => undefined);
  }, []);

  const load = useCallback(
    (p: LeaguePeriod, m: string, key: string | null) => {
      setLoading(true);
      setError("");
      leagueApi
        .board(p, m, key)
        .then(setBoard)
        .catch(() => setError("بارگذاری لیگ با خطا مواجه شد."))
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    load(period, metric, windowKey);
  }, [period, metric, windowKey, load]);

  const metricSpec = useMemo(
    () => meta?.metrics.find((m) => m.key === metric) ?? null,
    [meta, metric],
  );

  const switchPeriod = (p: LeaguePeriod) => {
    setPeriod(p);
    setWindowKey(null); // هر بازه از دورهٔ جاریِ خودش شروع می‌شود
  };

  const top3 = board?.entries.slice(0, 3) ?? [];
  const rest = board?.entries.slice(3) ?? [];

  return (
    <div className="relative space-y-6">
      {/* هالهٔ رنگیِ پس‌زمینه */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="animate-blob absolute -right-32 top-0 h-[480px] w-[480px] rounded-full blur-[120px]" style={{ background: `rgba(${TINTS.gold},0.13)` }} />
        <div className="animate-blob-slow absolute -left-32 top-1/3 h-[440px] w-[440px] rounded-full blur-[120px]" style={{ background: `rgba(${TINTS.violet},0.14)` }} />
        <div className="animate-blob absolute bottom-0 right-1/4 h-[400px] w-[400px] rounded-full blur-[120px]" style={{ background: `rgba(${TINTS.sky},0.12)` }} />
      </div>

      <LeagueHeader
        board={board}
        metricLabel={metricSpec?.label ?? ""}
        minTrades={meta?.minTrades ?? 3}
        isAdmin={isAdmin}
      />

      {/* بازه‌ها + پیمایشِ دوره */}
      <div className="flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center sm:justify-between" style={glass(TINTS.violet, 0.7)}>
        <div className="flex flex-wrap gap-1.5">
          {(meta?.periods ?? (["daily", "weekly", "monthly", "quarterly", "yearly"] as LeaguePeriod[])).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => switchPeriod(p)}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                period === p ? "text-[#06121f]" : "text-muted hover:text-text"
              }`}
              style={
                period === p
                  ? { background: `linear-gradient(120deg, rgb(${TINTS.gold}), rgb(${TINTS.mint}))`, boxShadow: `0 12px 26px -14px rgba(${TINTS.gold},0.9)` }
                  : { background: "var(--glass-bg)", border: "1px solid rgba(148,163,184,0.18)" }
              }
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <NavArrow
            dir="prev"
            title="دورهٔ قبل"
            onClick={() => board && setWindowKey(board.previousKey)}
            disabled={!board || loading}
          />
          <div className="min-w-[10rem] rounded-xl px-4 py-2 text-center text-sm font-extrabold" style={{ background: "var(--glass-bg)", border: "1px solid rgba(148,163,184,0.18)" }}>
            {board?.window.label ?? "…"}
          </div>
          <NavArrow
            dir="next"
            title={board?.hasNext ? "دورهٔ بعد" : "دورهٔ بعد هنوز شروع نشده است"}
            onClick={() => board && setWindowKey(board.nextKey)}
            disabled={!board || loading || !board.hasNext}
          />
          {windowKey && (
            <button
              type="button"
              onClick={() => setWindowKey(null)}
              className="rounded-xl px-3 py-2 text-xs font-bold text-muted hover:text-text"
              style={{ background: "var(--glass-bg)", border: "1px solid rgba(148,163,184,0.18)" }}
            >
              دورهٔ جاری
            </button>
          )}
        </div>
      </div>

      {/* معیارها */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {(meta?.metrics ?? []).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              title={m.hint}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                metric === m.key ? "text-[#06121f]" : "text-muted hover:text-text"
              }`}
              style={
                metric === m.key
                  ? { background: `rgb(${TINTS.mint})`, boxShadow: `0 10px 22px -14px rgba(${TINTS.mint},0.9)` }
                  : { background: "var(--glass-bg)", border: "1px solid rgba(148,163,184,0.18)" }
              }
            >
              {m.label}
            </button>
          ))}
        </div>
        {metricSpec?.hint && (
          <p className="px-1 text-xs text-muted">
            <span className="font-bold text-text">{metricSpec.label}:</span> {metricSpec.hint}
            {!metricSpec.higherIsBetter && " (هرچه کمتر، رتبه بهتر)"}
          </p>
        )}
      </div>

      {error && <p className="text-loss">{error}</p>}
      {loading && !board && <Spinner label="در حال بارگذاری لیگ…" />}

      {board && board.entries.length === 0 && !loading && (
        <div className="rounded-2xl p-10 text-center" style={glass(TINTS.sky, 0.7)}>
          <div className="text-4xl">🏁</div>
          <div className="mt-3 text-lg font-extrabold">هنوز کسی در این دوره معامله‌ای نبسته است</div>
          <p className="mt-1 text-sm text-muted">
            اولین نفری باشید که در {board.window.label} ثبت رکورد می‌کند — کافی است معاملهٔ بسته‌شدهٔ خود را در ژورنال ثبت کنید.
          </p>
          <Link href="/journals" className="mt-4 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-[#06121f]" style={{ background: `linear-gradient(120deg, rgb(${TINTS.gold}), rgb(${TINTS.mint}))` }}>
            ثبت معامله
          </Link>
        </div>
      )}

      {board && board.entries.length > 0 && (
        <>
          <Podium entries={top3} metric={metric} metricSpec={metricSpec} isAdmin={isAdmin} me={user?.username} />
          <LeagueTable
            entries={board.entries}
            highlight={rest.length > 0}
            metric={metric}
            metricSpec={metricSpec}
            isAdmin={isAdmin}
            me={user?.username}
            minTrades={board.minTrades}
          />
        </>
      )}

      <RulesCard minTrades={board?.minTrades ?? meta?.minTrades ?? 3} />
    </div>
  );
}

// ─── سربرگ ────────────────────────────────────────────────────────────────────

function LeagueHeader({
  board,
  metricLabel,
  minTrades,
  isAdmin,
}: {
  board: LeagueBoard | null;
  metricLabel: string;
  minTrades: number;
  /** ادمین‌ها در لیگ شرکت داده نمی‌شوند، پس «رتبهٔ شما» برایشان معنا ندارد. */
  isAdmin: boolean;
}) {
  const total = board?.entries.length ?? 0;
  const qualified = board?.entries.filter((e) => e.qualified).length ?? 0;
  const champion = board?.entries[0];

  return (
    <div className="relative overflow-hidden rounded-3xl p-6 md:p-8" style={glass(TINTS.gold)}>
      <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full blur-[80px]" style={{ background: `rgba(${TINTS.gold},0.25)` }} />
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl text-2xl" style={{ background: `rgba(${TINTS.gold},0.2)` }}>🏆</span>
            <div>
              <h1
                className="text-3xl font-extrabold tracking-tight"
                style={{
                  backgroundImage: `linear-gradient(120deg, rgb(${TINTS.gold}), rgb(${TINTS.mint}), rgb(${TINTS.violet}))`,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                لیگ تریدرها
              </h1>
              <div className="text-xs tracking-widest text-muted">TRADERS LEAGUE</div>
            </div>
          </div>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
            هر دوره یک مسابقهٔ تازه است: معاملاتتان را در ژورنال ثبت کنید تا بر اساس{" "}
            <span className="font-bold text-text">{metricLabel || "درصد سود"}</span> در جدول بالا بروید.
            رقابت روی نتیجهٔ واقعیِ ژورنال است، نه ادعا.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <HeaderStat label="دورهٔ جاری" value={board?.window.label ?? "…"} tint={TINTS.violet} />
          <HeaderStat label="شرکت‌کننده" value={`${faNum(total)} نفر`} tint={TINTS.sky} />
          <HeaderStat label={`واجد شرایط (${faNum(minTrades)}+ معامله)`} value={`${faNum(qualified)} نفر`} tint={TINTS.mint} />
          {isAdmin ? (
            <HeaderStat label="نقش شما" value="داورِ لیگ (ادمین)" tint={TINTS.violet} />
          ) : board?.myRank ? (
            <HeaderStat label="رتبهٔ شما" value={`#${faNum(board.myRank)}`} tint={TINTS.gold} />
          ) : (
            <HeaderStat label="رتبهٔ شما" value="هنوز ثبت نشده" tint={TINTS.rose} />
          )}
        </div>
      </div>

      {champion && (
        <div className="relative mt-5 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3" style={{ background: `rgba(${TINTS.gold},0.12)`, border: `1px solid rgba(${TINTS.gold},0.3)` }}>
          <span className="text-xl">👑</span>
          <span className="text-sm">
            صدرنشینِ این دوره <span className="font-extrabold">{champion.username}</span> است با{" "}
            <span className="font-extrabold" dir="ltr">{formatPct(champion.pnlPercent)}</span> بازده و امتیازِ لیگ{" "}
            <span className="font-extrabold" dir="ltr">{faNum(champion.score.toFixed(1))}</span>.
          </span>
        </div>
      )}
    </div>
  );
}

function HeaderStat({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <div className="rounded-2xl px-4 py-2.5" style={{ background: `rgba(${tint},0.12)`, border: `1px solid rgba(${tint},0.28)` }}>
      <div className="text-[10px] text-muted">{label}</div>
      <div className="text-sm font-extrabold">{value}</div>
    </div>
  );
}

function NavArrow({
  dir,
  onClick,
  disabled,
  title,
}: {
  dir: "prev" | "next";
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="grid h-9 w-9 place-items-center rounded-xl text-muted transition-all hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: "var(--glass-bg)", border: "1px solid rgba(148,163,184,0.18)" }}
    >
      {/* در چیدمانِ راست‌به‌چپ، «قبلی» فلشِ راست است. */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={dir === "prev" ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
      </svg>
    </button>
  );
}

// ─── سکوی قهرمانی ─────────────────────────────────────────────────────────────

function Podium({
  entries,
  metric,
  metricSpec,
  isAdmin,
  me,
}: {
  entries: LeagueEntry[];
  metric: string;
  metricSpec: { label: string; unit: string } | null;
  isAdmin: boolean;
  me?: string;
}) {
  if (entries.length === 0) return null;
  // ترتیبِ نمایش: دوم، اول، سوم — تا نفر اول وسط و بلندتر بایستد.
  const order = entries.length >= 3 ? [1, 0, 2] : entries.map((_, i) => i);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {order.map((idx) => {
        const e = entries[idx];
        if (!e) return null;
        const p = PODIUM[idx];
        const isMe = me && e.username === me;
        return (
          <div
            key={e.username}
            className={`relative overflow-hidden rounded-3xl p-5 text-center transition-transform hover:-translate-y-1 ${idx === 0 ? "sm:-mt-4 sm:pb-8" : ""}`}
            style={{ ...glass(p.tint), boxShadow: p.ring }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, transparent, rgb(${p.tint}), transparent)` }} />
            <div className="text-3xl">{p.medal}</div>
            <div className="mt-1 text-[11px] font-bold tracking-wide" style={{ color: `rgb(${p.tint})` }}>{p.title}</div>

            <div className="mt-3 flex flex-col items-center gap-2">
              <span
                className="grid h-14 w-14 place-items-center rounded-2xl text-lg font-extrabold"
                style={{ background: `rgba(${p.tint},0.18)`, border: `1px solid rgba(${p.tint},0.4)` }}
                dir="ltr"
              >
                {e.username.slice(0, 2).toUpperCase()}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold" dir="ltr">{e.username}</span>
                {isMe && <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ background: `rgba(${TINTS.mint},0.2)`, color: `rgb(${TINTS.mint})` }}>شما</span>}
              </div>
              <ExchangeRow slugs={e.exchanges} size={22} />
            </div>

            <div className="mt-4">
              <div className="text-[11px] text-muted">{metricSpec?.label ?? "درصد سود"}</div>
              <div className={`text-3xl font-extrabold ${tone(e, metric)}`} dir="ltr">
                {formatMetric(e, metric, metricSpec?.unit ?? "percent")}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
              <MiniFact label="امتیاز" value={faNum(e.score.toFixed(1))} />
              <MiniFact label="وین‌ریت" value={e.winRate == null ? "—" : plainPct(e.winRate * 100)} />
              <MiniFact label="معاملات" value={faNum(e.tradeCount)} />
            </div>

            {isAdmin && e.userId != null && <AdminLink userId={e.userId} className="mt-4 w-full" />}
          </div>
        );
      })}
    </div>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-2 py-1.5" style={{ background: "var(--glass-bg)", border: "1px solid rgba(148,163,184,0.16)" }}>
      <div className="text-muted">{label}</div>
      <div className="font-extrabold" dir="ltr">{value}</div>
    </div>
  );
}

function ExchangeRow({ slugs, size = 18 }: { slugs: string[]; size?: number }) {
  if (!slugs.length) {
    return <span className="whitespace-nowrap text-[10px] text-muted">بدون اتصال صرافی</span>;
  }
  return (
    <span className="flex items-center justify-center gap-1">
      {slugs.map((s) => (
        <ExchangeLogo key={s} slug={s} size={size} />
      ))}
    </span>
  );
}

function AdminLink({ userId, className = "" }: { userId: number; className?: string }) {
  return (
    <Link
      href={`/admin/users/${userId}?tab=dashboard`}
      className={`inline-block rounded-xl px-3 py-2 text-center text-xs font-bold transition-opacity hover:opacity-85 ${className}`}
      style={{ background: `rgba(${TINTS.violet},0.18)`, border: `1px solid rgba(${TINTS.violet},0.4)` }}
      title="مشاهدهٔ داشبورد و ژورنال کاملِ این تریدر"
    >
      مشاهدهٔ پروفایل کامل
    </Link>
  );
}

// ─── جدولِ رتبه‌بندی ───────────────────────────────────────────────────────────

function LeagueTable({
  entries,
  metric,
  metricSpec,
  isAdmin,
  me,
  minTrades,
}: {
  entries: LeagueEntry[];
  highlight?: boolean;
  metric: string;
  metricSpec: { label: string; unit: string } | null;
  isAdmin: boolean;
  me?: string;
  minTrades: number;
}) {
  // ستون‌های ثابتِ جدول. اگر معیارِ انتخابی خودش یکی از همین‌هاست، ستونِ جداگانه
  // برایش ساخته نمی‌شود (وگرنه یک عدد دو بار تکرار می‌شد)؛ فقط همان ستون به‌عنوان
  // ستونِ مرتب‌سازی برجسته می‌شود.
  const FIXED = ["score", "pnlUsd", "winRate", "profitFactor", "maxDrawdown",
                 "avgLeverage", "volume", "tradeCount"];
  const extraColumn = !FIXED.includes(metric);
  const sortedOn = (key: string) => metric === key;

  return (
    <div className="overflow-hidden rounded-3xl" style={glass(TINTS.sky, 0.7)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[62rem] text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <Th className="w-16">رتبه</Th>
              <Th>تریدر</Th>
              <Th>صرافی</Th>
              {extraColumn && <Th sorted>{metricSpec?.label ?? "درصد سود"}</Th>}
              <Th sorted={sortedOn("score")}>امتیاز لیگ</Th>
              <Th sorted={sortedOn("pnlUsd")}>سود دلاری</Th>
              <Th sorted={sortedOn("winRate")}>وین‌ریت</Th>
              <Th sorted={sortedOn("profitFactor")}>ضریب سود</Th>
              <Th sorted={sortedOn("maxDrawdown")}>افت سرمایه</Th>
              <Th sorted={sortedOn("avgLeverage")}>اهرم</Th>
              <Th sorted={sortedOn("volume")}>حجم</Th>
              <Th sorted={sortedOn("tradeCount")}>معاملات</Th>
              {isAdmin && <Th className="w-32">مدیریت</Th>}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const isMe = me && e.username === me;
              return (
                <tr
                  key={e.username}
                  className="border-t transition-colors"
                  style={{
                    borderColor: "rgba(148,163,184,0.12)",
                    background: isMe ? `rgba(${TINTS.mint},0.10)` : undefined,
                  }}
                >
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <RankBadge rank={e.rank} />
                      <RankMove change={e.rankChange} />
                    </div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-extrabold"
                        style={{ background: `rgba(${TINTS.violet},0.16)`, border: `1px solid rgba(${TINTS.violet},0.3)` }}
                        dir="ltr"
                      >
                        {e.username.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="font-bold" dir="ltr">{e.username}</span>
                      {isMe && <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: `rgba(${TINTS.mint},0.2)`, color: `rgb(${TINTS.mint})` }}>شما</span>}
                      {!e.qualified && (
                        <span
                          className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold text-muted"
                          style={{ background: "var(--glass-bg)", border: "1px solid rgba(148,163,184,0.2)" }}
                          title={`برای واجد شرایط شدن حداقل ${minTrades} معاملهٔ بسته‌شده در این دوره لازم است`}
                        >
                          خارج از رقابت
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td><ExchangeRow slugs={e.exchanges} /></Td>
                  {extraColumn && (
                    <Td className={`font-extrabold ${tone(e, metric)}`} ltr>
                      {formatMetric(e, metric, metricSpec?.unit ?? "percent")}
                    </Td>
                  )}
                  <Td className={sortedOn("score") ? "font-extrabold" : ""} ltr>{faNum(e.score.toFixed(1))}</Td>
                  <Td className={`${tone(e, "pnlUsd")} ${sortedOn("pnlUsd") ? "font-extrabold" : ""}`} ltr>{formatSignedUsd(e.pnlUsd)}</Td>
                  <Td className={sortedOn("winRate") ? "font-extrabold" : ""} ltr>{e.winRate == null ? "—" : plainPct(e.winRate * 100)}</Td>
                  <Td className={sortedOn("profitFactor") ? "font-extrabold" : ""} ltr>{formatProfitFactor(e)}</Td>
                  <Td className={sortedOn("maxDrawdown") ? "font-extrabold" : ""} ltr>{plainPct(e.maxDrawdown)}</Td>
                  <Td className={sortedOn("avgLeverage") ? "font-extrabold" : ""} ltr>{e.avgLeverage == null ? "—" : `${faNum(Math.round(e.avgLeverage * 10) / 10)}×`}</Td>
                  <Td className={sortedOn("volume") ? "font-extrabold" : ""} ltr>{formatUsd(e.volume, 0)}</Td>
                  <Td className={sortedOn("tradeCount") ? "font-extrabold" : ""} ltr>
                    {faNum(e.tradeCount)}
                    <span className="text-[10px] text-muted"> ({faNum(e.wins)}✓ {faNum(e.losses)}✕)</span>
                  </Td>
                  {isAdmin && (
                    <Td>{e.userId != null && <AdminLink userId={e.userId} />}</Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className = "", sorted }: { children: React.ReactNode; className?: string; sorted?: boolean }) {
  return (
    <th className={`px-3 py-3 text-center font-bold ${sorted ? "text-text" : ""} ${className}`}>
      {children}
      {sorted && <span className="ms-1 text-[10px]">▼</span>}
    </th>
  );
}

function Td({ children, className = "", ltr }: { children: React.ReactNode; className?: string; ltr?: boolean }) {
  return (
    <td className={`px-3 py-3 text-center ${className}`} dir={ltr ? "ltr" : undefined}>
      {children}
    </td>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const p = rank <= 3 ? PODIUM[rank - 1] : null;
  return (
    <span
      className="grid h-7 w-7 place-items-center rounded-lg text-xs font-extrabold"
      style={
        p
          ? { background: `rgba(${p.tint},0.22)`, border: `1px solid rgba(${p.tint},0.5)`, color: `rgb(${p.tint})` }
          : { background: "var(--glass-bg)", border: "1px solid rgba(148,163,184,0.18)" }
      }
      dir="ltr"
    >
      {faNum(rank)}
    </span>
  );
}

/** جابه‌جاییِ رتبه نسبت به دورهٔ قبل. */
function RankMove({ change }: { change: number | null }) {
  if (change === null) {
    return <span className="text-[10px] text-muted" title="تازه‌وارد این دوره">NEW</span>;
  }
  if (change === 0) {
    return <span className="text-[10px] text-muted" title="بدون تغییر نسبت به دورهٔ قبل">—</span>;
  }
  const up = change > 0;
  return (
    <span
      className={`text-[10px] font-bold ${up ? "text-profit" : "text-loss"}`}
      title={`${up ? "صعود" : "نزول"} ${Math.abs(change)} پله نسبت به دورهٔ قبل`}
      dir="ltr"
    >
      {up ? "▲" : "▼"}{faNum(Math.abs(change))}
    </span>
  );
}

// ─── قوانین ───────────────────────────────────────────────────────────────────

function RulesCard({ minTrades }: { minTrades: number }) {
  const rules = [
    ["مبنای بازده", "درصد سود نسبت به موجودیِ ابتدای همان دوره حساب می‌شود، نه موجودیِ فعلی — پس سرمایهٔ بزرگ‌تر به‌تنهایی مزیت نیست."],
    ["هفته‌ها", "هفتهٔ لیگ از شنبه شروع می‌شود و جمعه تمام می‌شود؛ ماه، فصل و سال هم شمسی‌اند."],
    ["وین‌ریت", "فقط معاملات سودده و زیان‌ده در وین‌ریت شمرده می‌شوند؛ معاملهٔ سربه‌سر آن را رقیق نمی‌کند."],
    ["حد نصاب", `کسی که در دوره کمتر از ${minTrades} معاملهٔ بسته‌شده دارد «خارج از رقابت» است و بعد از واجدین شرایط فهرست می‌شود.`],
    ["امتیاز لیگ", "ترکیبِ وزن‌دارِ بازده (۴۵)، وین‌ریت (۱۵)، ضریب سود (۱۵)، کنترل افت سرمایه (۱۵) و انضباط چک‌لیست (۱۰) — تا مسابقه فقط «شرط‌بندی روی یک معامله» نباشد."],
    ["حریم خصوصی", "از هر شرکت‌کننده تنها نام کاربری نمایش داده می‌شود."],
  ];
  return (
    <div className="rounded-3xl p-5" style={glass(TINTS.mint, 0.6)}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg">📜</span>
        <h2 className="text-base font-extrabold">قوانین لیگ</h2>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {rules.map(([title, body]) => (
          <div key={title} className="rounded-2xl px-4 py-3" style={{ background: "var(--glass-bg)", border: "1px solid rgba(148,163,184,0.16)" }}>
            <div className="text-xs font-extrabold">{title}</div>
            <div className="mt-1 text-xs leading-6 text-muted">{body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
