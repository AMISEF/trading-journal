"use client";

import { AppShell } from "@/components/AppShell";
import { AICoachPanel } from "@/components/AICoachPanel";
import { aiApi } from "@/lib/api";
import { useAuth } from "@/store/auth";

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

function AnalysisInner() {
  const authUser = useAuth((s) => s.user);

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
      <AICoachPanel
        title="مربی هوش مصنوعی — تحلیل کلی معاملات"
        subtitle="بررسی وین‌ریت، الگوهای تکرارشونده، مدیریت ریسک و روانشناسی، همراه با برنامه‌ی بهبود"
        fetcher={() => aiApi.getOverall()}
        generator={() => aiApi.analyzeOverall()}
        chat={{ send: (m) => aiApi.chatOverall(m) }}
      />

      {/* ── Institutional due-diligence report (full 19-section, PDF) ── */}
      <AICoachPanel
        title="گزارش نهادی (Institutional) — ارزیابی کامل معاملات"
        subtitle="۱۹ بخش: امتیازدهی، ریسک، دراودان، مونت‌کارلو، استرس‌تست، مقیاس‌پذیری و تصمیم نهایی — بر اساس تمام دیتا و تصاویر"
        fetcher={() => aiApi.getReport()}
        generator={() => aiApi.analyzeReport()}
        pdf={{
          title: "گزارش ارزیابی نهادی معاملات",
          subject: authUser ? `${authUser.firstName} ${authUser.lastName} (@${authUser.username})` : undefined,
        }}
        chat={{ send: (m) => aiApi.chatReport(m) }}
      />
    </div>
  );
}
