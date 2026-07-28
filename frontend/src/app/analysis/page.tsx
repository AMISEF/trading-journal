"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AICoachPanel } from "@/components/AICoachPanel";
import { aiApi } from "@/lib/api";
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

function AnalysisInner() {
  const authUser = useAuth((s) => s.user);
  const limits = limitsOf(authUser);
  const currentTier = TIER_LABEL[effectiveTier(authUser)];
  const coachPlan = cheapestTierWith((l) => l.coachEnabled);
  const reportPlan = cheapestTierWith((l) => l.reportEnabled);

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
        <AICoachPanel
          title="مربی هوش مصنوعی — تحلیل کلی معاملات"
          subtitle={`بررسی وین‌ریت، الگوهای تکرارشونده، مدیریت ریسک و روانشناسی، همراه با برنامهٔ بهبود · ${cadenceLabel(
            true,
            limits.coachPeriodDays
          )}`}
          fetcher={() => aiApi.getOverall()}
          generator={() => aiApi.analyzeOverall()}
          chat={{ send: (m) => aiApi.chatOverall(m) }}
        />
      ) : (
        <LockedPanel
          title="مربی هوش مصنوعی — تحلیل کلی معاملات"
          subtitle="کل ژورنالت را می‌خواند و می‌گوید پولت از کجا نشت می‌کند"
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
