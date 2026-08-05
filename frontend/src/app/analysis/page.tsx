"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AICoachPanel } from "@/components/AICoachPanel";
import { aiApi } from "@/lib/api";
import {
  COACH_LEVELS,
  DEFAULT_COACH_LEVEL,
  coachApi,
  type CoachLevel,
  type CoachLevelInfo,
} from "@/lib/coach";
import { useAuth } from "@/store/auth";
import {
  cadenceLabel,
  cheapestTierWith,
  effectiveTier,
  limitsOf,
  TIER_LABEL,
} from "@/lib/plans";

const TINTS = {
  mint: "94,234,212",
  violet: "167,139,250",
  sky: "125,211,252",
} as const;

/** Remembers the chosen depth between visits. */
const LEVEL_KEY = "tj_coach_level";

const fa = (n: number) => n.toLocaleString("fa-IR");

export default function AnalysisPage() {
  return (
    <AppShell>
      <AnalysisInner />
    </AppShell>
  );
}

/**
 * Shown instead of a coach panel the current plan does not include. The API
 * would reject the request anyway — this turns a 403 into an offer.
 */
function LockedPanel({
  title,
  subtitle,
  currentTier,
  requiredPlanName,
  requiredTint,
}: {
  title: string;
  subtitle: string;
  currentTier: string;
  requiredPlanName: string;
  requiredTint: string;
}) {
  return (
    <div
      className="tj-card relative overflow-hidden p-5"
      style={{ borderColor: `rgba(${requiredTint},0.35)` }}
    >
      <div
        className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full opacity-40 blur-3xl"
        style={{ background: `rgba(${requiredTint},0.5)` }}
      />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className="grid h-9 w-9 flex-none place-items-center rounded-xl text-lg"
            style={{ background: `rgba(${requiredTint},0.15)` }}
          >
            🔒
          </span>
          <div>
            <h2 className="text-base font-bold">{title}</h2>
            <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
            <p className="mt-2 text-sm text-muted">
              پلن فعلی تو <b>{currentTier}</b> است و این بخش را شامل نمی‌شود. با ارتقا به پلن{" "}
              <b style={{ color: `rgb(${requiredTint})` }}>{requiredPlanName}</b> فعال می‌شود.
            </p>
          </div>
        </div>
        <Link
          href="/subscription"
          className="rounded-xl px-4 py-2 text-sm font-bold text-white transition hover:-translate-y-0.5"
          style={{
            background: `linear-gradient(to left, rgb(${requiredTint}), rgba(${requiredTint},0.65))`,
            boxShadow: `0 12px 30px -12px rgba(${requiredTint},0.8)`,
          }}
        >
          مشاهدهٔ پلن‌ها
        </Link>
      </div>
    </div>
  );
}

/**
 * Depth of reasoning for the coach. Higher levels hand the model more of the
 * user's history (and, on «اولترا», the exit screenshots), which costs more
 * time but produces a far more grounded review.
 */
function CoachLevelPicker({
  levels,
  value,
  onChange,
}: {
  levels: CoachLevelInfo[];
  value: CoachLevel;
  onChange: (next: CoachLevel) => void;
}) {
  const active = levels.find((l) => l.key === value);
  return (
    <div className="tj-card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold">
            <span>🧠</span> عمق تحلیل مربی
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            در هر سطح، داشبورد کامل + تریدینگ پلن + چک‌لیست فرستاده می‌شود؛ فقط تعداد معاملاتی که
            مربی می‌خواند فرق می‌کند. سطح بالاتر = تحلیل دقیق‌تر و کمی کندتر.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {levels.map((l) => {
          const on = l.key === value;
          return (
            <button
              key={l.key}
              type="button"
              onClick={() => onChange(l.key)}
              aria-pressed={on}
              className={`flex min-w-[104px] flex-col items-center gap-0.5 rounded-xl border px-3 py-2 text-xs transition ${
                on
                  ? "border-transparent bg-gradient-to-l from-violet-600 to-sky-600 text-white shadow-lg shadow-violet-600/20"
                  : "border-border bg-surface-2 text-foreground/80 hover:-translate-y-0.5"
              }`}
            >
              <span className="text-sm font-bold">{l.label}</span>
              <span className={on ? "text-[11px] opacity-90" : "text-[11px] text-muted"}>
                {fa(l.trades)} معاملهٔ اخیر{l.images > 0 ? " + تصاویر" : ""}
              </span>
            </button>
          );
        })}
      </div>

      {active && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-muted">
          {active.note}
        </p>
      )}
    </div>
  );
}

function AnalysisInner() {
  const authUser = useAuth((s) => s.user);
  const limits = limitsOf(authUser);
  const currentTier = TIER_LABEL[effectiveTier(authUser)];
  const coachPlan = cheapestTierWith((l) => l.coachEnabled);
  const reportPlan = cheapestTierWith((l) => l.reportEnabled);

  const [level, setLevel] = useState<CoachLevel>(DEFAULT_COACH_LEVEL);
  const [levels, setLevels] = useState<CoachLevelInfo[]>(COACH_LEVELS);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LEVEL_KEY);
      if (saved && COACH_LEVELS.some((l) => l.key === saved)) {
        setLevel(saved as CoachLevel);
      }
    } catch {
      /* private mode — keep the default */
    }
    // Keep the labels in sync with the backend if it ever changes them.
    coachApi
      .levels()
      .then((rows) => {
        if (Array.isArray(rows) && rows.length) setLevels(rows);
      })
      .catch(() => {});
  }, []);

  const pickLevel = (next: CoachLevel) => {
    setLevel(next);
    try {
      window.localStorage.setItem(LEVEL_KEY, next);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative space-y-7">
      {/* ── Ambient pastel glow backdrop ── */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="animate-blob absolute -right-32 top-0 h-[480px] w-[480px] rounded-full blur-[120px]" style={{ background: `rgba(${TINTS.mint},0.16)` }} />
        <div className="animate-blob-slow absolute -left-32 top-1/3 h-[440px] w-[440px] rounded-full blur-[120px]" style={{ background: `rgba(${TINTS.violet},0.14)` }} />
        <div className="animate-blob absolute bottom-0 right-1/4 h-[400px] w-[400px] rounded-full blur-[120px]" style={{ background: `rgba(${TINTS.sky},0.12)` }} />
      </div>

      {/* ── Title ── */}
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
          تحلیل معاملات
        </h1>
        <span className="h-2.5 w-2.5 rounded-full animate-pulse-dot" style={{ background: `rgb(${TINTS.mint})` }} />
      </div>

      {/* ── AI coach: whole-journal coaching report ── */}
      {limits.coachEnabled ? (
        <div className="space-y-3">
          <CoachLevelPicker levels={levels} value={level} onChange={pickLevel} />
          <AICoachPanel
            title="مربی هوش مصنوعی — تحلیل کلی معاملات"
            subtitle={`نقاط قوت و ضعف معاملاتت را با اسم هر معامله بیرون می‌کشد، تریدینگ پلن و چک‌لیستت را بررسی می‌کند و برنامهٔ معاملاتی جلوی پایت می‌گذارد · ${cadenceLabel(
              true,
              limits.coachPeriodDays
            )}`}
            fetcher={() => aiApi.getOverall()}
            generator={() => coachApi.analyzeOverall(level)}
            pdf={{
              title: "گزارش مربی هوش مصنوعی",
              subject: authUser ? `${authUser.firstName} ${authUser.lastName} (@${authUser.username})` : undefined,
            }}
            chat={{ send: (m) => aiApi.chatOverall(m) }}
          />
        </div>
      ) : (
        <LockedPanel
          title="مربی هوش مصنوعی — تحلیل کلی معاملات"
          subtitle="کل ژورنالت را می‌خواند و می‌گوید ضررهایت از کدام رفتار تکرارشونده می‌آید"
          currentTier={currentTier}
          requiredPlanName={coachPlan.name}
          requiredTint={coachPlan.tint}
        />
      )}

      {/* ── Institutional due-diligence report ── */}
      {limits.reportEnabled ? (
        <AICoachPanel
          title="گزارش نهادی (Institutional) — ارزیابی کامل معاملات"
          subtitle={`ارزیابی در سطح کمیتهٔ ریسک: امتیازدهی، دراودان، مونت‌کارلو، استرس‌تست، مقیاس‌پذیری و رأی نهایی · ${cadenceLabel(
            true,
            limits.reportPeriodDays
          )}`}
          fetcher={() => aiApi.getReport()}
          generator={() => aiApi.analyzeReport()}
          pdf={{
            title: "گزارش ارزیابی نهادی معاملات",
            subject: authUser ? `${authUser.firstName} ${authUser.lastName} (@${authUser.username})` : undefined,
          }}
          chat={{ send: (m) => aiApi.chatReport(m) }}
        />
      ) : (
        <LockedPanel
          title="گزارش نهادی (Institutional) — ارزیابی کامل معاملات"
          subtitle="همان استانداردی که پراپ‌فرم‌ها و صندوق‌ها با آن سرمایه می‌دهند"
          currentTier={currentTier}
          requiredPlanName={reportPlan.name}
          requiredTint={reportPlan.tint}
        />
      )}
    </div>
  );
}
