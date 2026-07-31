"use client";

/**
 * لیگ تریدرها (Traders League) — لیدربردِ رقابتیِ کاربران.
 *
 * ساختار صفحه:
 *   ۱) سربرگِ مسابقه با دوره‌ی جاری و رتبهٔ خودِ کاربر،
 *   ۲) تبِ بازه‌ها (روزانه / هفتگی / ماهانه / فصلی / سالانه) + پیمایشِ دوره،
 *   ۳) نوارِ معیارها (درصد سود، امتیاز لیگ، حجم، اهرم، افت سرمایه، …)،
 *   ۴) سکوی قهرمانی (سه نفر اولِ کلِ جدول — فقط روی صفحهٔ اول)،
 *   ۵) جدولِ رتبه‌بندی، صفحه‌بندی‌شده (۱۰۰ ردیف در هر صفحه).
 *
 * همهٔ کاربران عضوِ لیگ‌اند — حتی کسی که در این دوره معامله‌ای نبسته است — و هر
 * کس لیگ را روی صفحه‌ای باز می‌کند که ردیفِ خودش در آن است؛ آن ردیف هایلایت می‌شود
 * و برچسبِ «you» می‌گیرد.
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

// ─── طراحی ────────────────────────────────────────────────

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

/** شناسهٔ DOM ردیفِ خودِ کاربر — برای پریدن روی آن با دکمهٔ «برو به ردیف من». */
const MY_ROW_ID = "league-my-row";

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

// ─── صفحه ───────────────────────────────────────────────────

function LeagueInner() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [meta, setMeta] = useState<LeagueMeta | null>(null);
  const [board, setBoard] = useState<LeagueBoard | null>(null);
  const [period, setPeriod] = useState<LeaguePeriod>("monthly");
  const [metric, setMetric] = useState("pnlPercent");
  const [windowKey, setWindowKey] = useState<string | null>(null);
  // ``null`` = انتخاب با سرور: صفحه‌ای که ردیفِ خودِ کاربر در آن است.
  const [page, setPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    leagueApi.meta().then(setMeta).catch(() => undefined);
  }, []);

  const load = useCallback(
    (p: LeaguePeriod, m: string, key: string | null, pageNo: number | null) => {
      setLoading(true);
      setError("");
      leagueApi
        .board(p, m, key, pageNo)
        .then(setBoard)
        .catch(() => setError("بارگذاری لیگ با خطا مواجه شد."))
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    load(period, metric, windowKey, page);
  }, [period, metric, windowKey, page, load]);

  const metricSpec = useMemo(
    () => meta?.metrics.find((m) => m.key === metric) ?? null,
    [meta, metric],
  );

  const switchPeriod = (p: LeaguePeriod) => {
    setPeriod(p);
    setWindowKey(null); // هر بازه از دورهٔ جاریِ خودش شروع می‌شود
    setPage(null);      // و روی صفحهٔ خودِ کاربر باز می‌شود
  };

  const switchMetric = (m: string) => {
    setMetric(m);
    setPage(null);      // با تغییر معیار، جای همه جابه‌جا می‌شود
  };

  const switchWindow = (key: string | null) => {
    setWindowKey(key);
    setPage(null);
  };

  const jumpToMyRow = () => {
    if (!board?.myPage) return;
    if (board.page === board.myPage) {
      document.getElementById(MY_ROW_ID)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setPage(board.myPage);
  };

  // سکو متعلق به سه نفرِ اولِ کلِ جدول است، پس فقط روی صفحهٔ اول معنا دارد.
  const top3 = board && board.page === 1 ? board.entries.slice(0, 3) : [];
  // ردیفِ خودِ کاربر وقتی در صفحهٔ جاری نیست — بالای جدول سنجاق می‌شود.
  const myPinned =
    board?.me && !board.entries.some((e) => e.isMe) ? board.me : null;

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
        onJumpToMyRow={jumpToMyRow}
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
            onClick={() => board && switchWindow(board.previousKey)}
            disabled={!board || loading}
          />
          <div className="min-w-[10rem] rounded-xl px-4 py-2 text-center text-sm font-extrabold" style={{ background: "var(--glass-bg)", border: "1px solid rgba(148,163,184,0.18)" }}>
            {board?.window.label ?? "…"}
          </div>
          <NavArrow
            dir="next"
            title={board?.hasNext ? "دورهٔ بعد" : "دورهٔ بعد هنوز شروع نشده است"}
            onClick={() => board && switchWindow(board.nextKey)}
            disabled={!board || loading || !board.hasNext}
          />
          {windowKey && (
            <button
              type="button"
              onClick={() => switchWindow(null)}
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
              onClick={() => switchMetric(m.key)}
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

      {board && board.total === 0 && !loading && (
        <div className="rounded-2xl p-10 text-center" style={glass(TINTS.sky, 0.7)}>
          <div className="text-4xl">🏁</div>
          <div className="mt-3 text-lg font-extrabold">هنوز عضوی در لیگ نیست</div>
          <p className="mt-1 text-sm text-muted">
            اولین نفری باشید که در {board.window.label} ثبت رکورد می‌کند — کافی است معاملهٔ بسته‌شدهٔ خود را در ژورنال ثبت کنید.
          </p>
          <Link href="/journals" className="mt-4 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-[#06121f]" style={{ background: `linear-gradient(120deg, rgb(${TINTS.gold}), rgb(${TINTS.mint}))` }}>
            ثبت معامله
          </Link>
        </div>
      )}

      {board && board.total > 0 && (
        <>
          {board.activeCount === 0 && (
            <div className="rounded-2xl px-5 py-4 text-sm" style={{ background: `rgba(${TINTS.rose},0.10)`, border: `1px solid rgba(${TINTS.rose},0.28)` }}>
              در {board.window.label} هنوز هیچ‌کس معامله‌ای نبسته است — اولین معاملهٔ بسته‌شده، صدرِ جدول را می‌گیرد.
            </div>
          )}

          {top3.length > 0 && (
            <Podium entries={top3} metric={metric} metricSpec={metricSpec} isAdmin={isAdmin} />
          )}

          {myPinned && (
            <MyRowCard
              entry={myPinned}
              metric={metric}
              metricSpec={metricSpec}
              myPage={board.myPage}
              onJump={jumpToMyRow}
            />
          )}

          <LeagueTable
            entries={board.entries}
            metric={metric}
            metricSpec={metricSpec}
            isAdmin={isAdmin}
            minTrades={board.minTrades}
          />

          <Pager
            page={board.page}
            pages={board.pages}
            pageSize={board.pageSize}
            total={board.total}
            myPage={board.myPage}
            loading={loading}
            onGo={(p) => setPage(p)}
          />
        </>
      )}

      <RulesCard minTrades={board?.minTrades ?? meta?.minTrades ?? 3} />
    </div>
  );
}

// ─── سربرگ ────────────────────────────────────────────────

function LeagueHeader({
  board,
  metricLabel,
  onJumpToMyRow,
}: {
  board: LeagueBoard | null;
  metricLabel: string;
  onJumpToMyRow: () => void;
}) {
  const total = board?.total ?? 0;
  const active = board?.activeCount ?? 0;
  // صدرنشین فقط روی صفحهٔ اول در دسترس است.
  const champion = board?.page === 1 ? board?.entries[0] : undefined;

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
          <HeaderStat label="اعضای لیگ" value={`${faNum(total)} نفر`} tint={TINTS.sky} />
          <HeaderStat label="فعال در این دوره" value={`${faNum(active)} نفر`} tint={TINTS.mint} />
          {board?.myRank ? (
            <button type="button" onClick={onJumpToMyRow} title="رفتن به ردیفِ خودم در جدول" className="text-start transition-transform hover:-translate-y-0.5">
              <HeaderStat label="رتبهٔ شما (you)" value={`#${faNum(board.myRank)}`} tint={TINTS.gold} />
            </button>
          ) : (
            <HeaderStat label="رتبهٔ شما (you)" value="هنوز ثبت نشده" tint={TINTS.rose} />
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

/** برچسبِ «you» — همه‌جا یک‌شکل تا کاربر خودش را فوری پیدا کند. */
function YouBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${className}`}
      style={{ background: `rgba(${TINTS.mint},0.22)`, color: `rgb(${TINTS.mint})`, border: `1px solid rgba(${TINTS.mint},0.45)` }}
      dir="ltr"
      title="این ردیفِ خودِ شماست"
    >
      you
    </span>
  );
}

// ─── سکوی قهرمانی ──────────────────────────────────────────

function Podium({
  entries,
  metric,
  metricSpec,
  isAdmin,
}: {
  entries: LeagueEntry[];
  metric: string;
  metricSpec: { label: string; unit: string } | null;
  isAdmin: boolean;
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
                {e.isMe && <YouBadge />}
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

// ─── ردیفِ خودِ کاربر وقتی در این صفحه نیست ────────────────────────

function MyRowCard({
  entry,
  metric,
  metricSpec,
  myPage,
  onJump,
}: {
  entry: LeagueEntry;
  metric: string;
  metricSpec: { label: string; unit: string } | null;
  myPage: number | null;
  onJump: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-4" style={glass(TINTS.mint, 0.9)}>
      <div className="flex flex-wrap items-center gap-3">
        <RankBadge rank={entry.rank} />
        <span className="font-extrabold" dir="ltr">{entry.username}</span>
        <YouBadge />
        <span className="text-xs text-muted">
          {metricSpec?.label ?? "درصد سود"}:{" "}
          <span className={`font-extrabold ${tone(entry, metric)}`} dir="ltr">
            {formatMetric(entry, metric, metricSpec?.unit ?? "percent")}
          </span>
        </span>
        <span className="text-xs text-muted">امتیاز لیگ: <span className="font-extrabold" dir="ltr">{faNum(entry.score.toFixed(1))}</span></span>
        <span className="text-xs text-muted">معاملات: <span className="font-extrabold" dir="ltr">{faNum(entry.tradeCount)}</span></span>
      </div>
      <button
        type="button"
        onClick={onJump}
        className="rounded-xl px-4 py-2 text-xs font-bold text-[#06121f]"
        style={{ background: `rgb(${TINTS.mint})` }}
      >
        برو به ردیف من{myPage ? ` (صفحهٔ ${faNum(myPage)})` : ""}
      </button>
    </div>
  );
}

// ─── جدولِ رتبه‌بندی ────────────────────────────────────────

function LeagueTable({
  entries,
  metric,
  metricSpec,
  isAdmin,
  minTrades,
}: {
  entries: LeagueEntry[];
  metric: string;
  metricSpec: { label: string; unit: string } | null;
  isAdmin: boolean;
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
            {entries.map((e) => (
              <tr
                key={e.username}
                id={e.isMe ? MY_ROW_ID : undefined}
                className="border-t transition-colors"
                style={{
                  borderColor: "rgba(148,163,184,0.12)",
                  background: e.isMe ? `rgba(${TINTS.mint},0.12)` : undefined,
                  boxShadow: e.isMe ? `inset 3px 0 0 rgb(${TINTS.mint})` : undefined,
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
                    {e.isMe && <YouBadge />}
                    {!e.active ? (
                      <span
                        className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold text-muted"
                        style={{ background: "var(--glass-bg)", border: "1px solid rgba(148,163,184,0.2)" }}
                        title="در این دوره معاملهٔ بسته‌شده‌ای ثبت نشده است"
                      >
                        بدون معامله در این دوره
                      </span>
                    ) : (
                      !e.qualified && (
                        <span
                          className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold text-muted"
                          style={{ background: "var(--glass-bg)", border: "1px solid rgba(148,163,184,0.2)" }}
                          title={`برای واجد شرایط شدن حداقل ${minTrades} معاملهٔ بسته‌شده در این دوره لازم است`}
                        >
                          خارج از رقابت
                        </span>
                      )
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── صفحه‌بندی ─────────────────────────────────────────────

/** شمارهٔ صفحه‌هایی که باید دکمه داشته باشند: اول، آخر، و دو تا دورِ صفحهٔ جاری. */
function pageWindow(page: number, pages: number): number[] {
  const wanted = new Set<number>([1, pages, page - 2, page - 1, page, page + 1, page + 2]);
  return [...wanted].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
}

function Pager({
  page,
  pages,
  pageSize,
  total,
  myPage,
  loading,
  onGo,
}: {
  page: number;
  pages: number;
  pageSize: number;
  total: number;
  myPage: number | null;
  loading: boolean;
  onGo: (page: number) => void;
}) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const numbers = pageWindow(page, pages);

  return (
    <div className="flex flex-col items-center justify-between gap-3 rounded-2xl px-4 py-3 sm:flex-row" style={glass(TINTS.violet, 0.6)}>
      <div className="text-xs text-muted">
        نمایش <span className="font-extrabold text-text">{faNum(from)}</span> تا{" "}
        <span className="font-extrabold text-text">{faNum(to)}</span> از{" "}
        <span className="font-extrabold text-text">{faNum(total)}</span> عضو — هر صفحه {faNum(pageSize)} نفر
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <PagerButton label="«" title="صفحهٔ اول" onClick={() => onGo(1)} disabled={loading || page <= 1} />
        <PagerButton label="‹" title="صفحهٔ قبل" onClick={() => onGo(page - 1)} disabled={loading || page <= 1} />

        {numbers.map((p, i) => (
          <span key={p} className="flex items-center gap-1.5">
            {i > 0 && numbers[i - 1] !== p - 1 && <span className="text-xs text-muted">…</span>}
            <PagerButton
              label={faNum(p)}
              title={myPage === p ? "صفحهٔ ردیفِ خودِ شما" : `صفحهٔ ${p}`}
              onClick={() => onGo(p)}
              active={p === page}
              marked={myPage === p}
              disabled={loading}
            />
          </span>
        ))}

        <PagerButton label="›" title="صفحهٔ بعد" onClick={() => onGo(page + 1)} disabled={loading || page >= pages} />
        <PagerButton label="»" title="صفحهٔ آخر" onClick={() => onGo(pages)} disabled={loading || page >= pages} />
      </div>

      <div className="text-xs text-muted">
        صفحهٔ <span className="font-extrabold text-text">{faNum(page)}</span> از{" "}
        <span className="font-extrabold text-text">{faNum(pages)}</span>
      </div>
    </div>
  );
}

function PagerButton({
  label,
  title,
  onClick,
  disabled,
  active,
  marked,
}: {
  label: string;
  title?: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  /** صفحه‌ای که ردیفِ خودِ کاربر در آن است — با حلقهٔ نعنایی مشخص می‌شود. */
  marked?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`min-w-[2.25rem] rounded-lg px-2.5 py-1.5 text-xs font-extrabold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "text-[#06121f]" : "text-muted hover:text-text"
      }`}
      style={
        active
          ? { background: `linear-gradient(120deg, rgb(${TINTS.gold}), rgb(${TINTS.mint}))` }
          : {
              background: "var(--glass-bg)",
              border: marked ? `1px solid rgba(${TINTS.mint},0.55)` : "1px solid rgba(148,163,184,0.18)",
            }
      }
      dir="ltr"
    >
      {label}
    </button>
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
    return <span className="text-[10px] text-muted" title="در دورهٔ قبل معامله‌ای نداشته">NEW</span>;
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

// ─── قوانین ────────────────────────────────────────────────

function RulesCard({ minTrades }: { minTrades: number }) {
  const rules = [
    ["عضویت", "هر کسی که در پنل حساب دارد در جدول لیگ می‌آید؛ کسی که در این دوره معامله‌ای نبسته، تهِ جدول فهرست می‌شود تا هیچ‌کس غیب نشود."],
    ["مبنای بازده", "درصد سود نسبت به موجودیِ ابتدای همان دوره حساب می‌شود، نه موجودیِ فعلی — پس سرمایهٔ بزرگ‌تر به‌تنهایی مزیت نیست."],
    ["هفته‌ها", "هفتهٔ لیگ از شنبه شروع می‌شود و جمعه تمام می‌شود؛ ماه، فصل و سال هم شمسی‌اند."],
    ["وین‌ریت", "فقط معاملات سودده و زیان‌ده در وین‌ریت شمرده می‌شوند؛ معاملهٔ سربه‌سر آن را رقیق نمی‌کند."],
    ["حد نصاب", `کسی که در دوره کمتر از ${minTrades} معاملهٔ بسته‌شده دارد «خارج از رقابت» است و بعد از واجدین شرایط فهرست می‌شود.`],
    ["امتیاز لیگ", "ترکیبِ وزن‌دارِ بازده (۴۵)، وین‌ریت (۱۵)، ضریب سود (۱۵)، کنترل افت سرمایه (۱۵) و انضباط چک‌لیست (۱۰) — تا مسابقه فقط «شرط‌بندی روی یک معامله» نباشد."],
    ["ردیفِ خودتان", "لیگ روی صفحه‌ای باز می‌شود که ردیفِ خودتان در آن است؛ آن ردیف هایلایت و با برچسبِ you مشخص می‌شود. هر صفحه ۱۰۰ نفر است."],
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
