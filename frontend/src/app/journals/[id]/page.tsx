"use client";

/**
 * Trade editor (/journals/[id]).
 * Header: trade #, status badge, lifecycle controls, auto-save indicator,
 * and a persistent "ذخیره ژورنال" button. Body: the tabbed editor.
 * Auto-save happens via the Zustand trade store (debounced PATCH).
 */
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Spinner, StatusDot } from "@/components/ui";
import { TradeTabs } from "@/components/editor/TradeTabs";
import { AICoachPanel } from "@/components/AICoachPanel";
import { useTrade, SaveStatus } from "@/store/trade";
import { aiApi, tradesApi } from "@/lib/api";
import { faNum } from "@/lib/format";
import type { TradeStatus } from "@/lib/types";

export default function EditorPage() {
  return (
    <AppShell>
      <EditorInner />
    </AppShell>
  );
}

function EditorInner() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const { trade, loading, saveStatus, load, saveNow, patch, reset } = useTrade();

  useEffect(() => {
    void load(id);
    return () => reset();
  }, [id, load, reset]);

  if (loading) return <Spinner label="در حال بارگذاری معامله…" />;
  if (!trade) return <p className="text-loss">معامله یافت نشد.</p>;

  // Lifecycle: PLANNED -> OPEN -> CLOSED, plus re-open.
  const advance = (status: TradeStatus) => {
    const fields: Record<string, unknown> = { status };
    if (status === "OPEN" && !trade.openDate)
      fields.openDate = new Date().toISOString();
    if (status === "CLOSED" && !trade.closeDate)
      fields.closeDate = new Date().toISOString();
    patch(fields);
  };

  const remove = async () => {
    if (!confirm("این معامله حذف شود؟")) return;
    await tradesApi.remove(trade.id);
    router.push("/journals");
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="tj-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/journals")}
            className="rounded-lg border border-border bg-surface-2 p-2"
            aria-label="بازگشت"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {/* RTL: arrow points right = back */}
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </button>
          <StatusDot status={trade.status} pnl={trade.calc?.realizedPnl} />
          <div>
            <div className="font-bold">
              معامله #{faNum(trade.number)}{" "}
              <span dir="ltr" className="text-muted">
                {trade.symbol || ""}
              </span>
            </div>
            <StatusBadge status={trade.status} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SaveIndicator status={saveStatus} />
          {/* Lifecycle controls */}
          {trade.status === "PLANNED" && (
            <Button variant="ghost" onClick={() => advance("OPEN")}>
              باز کردن معامله
            </Button>
          )}
          {trade.status === "OPEN" && (
            <Button variant="ghost" onClick={() => advance("CLOSED")}>
              بستن معامله
            </Button>
          )}
          {trade.status === "CLOSED" && (
            <Button variant="ghost" onClick={() => advance("OPEN")}>
              بازگشایی معامله
            </Button>
          )}
          <Button variant="danger" onClick={remove}>
            حذف
          </Button>
          <Button onClick={async () => { await saveNow(); router.push("/journals"); }}>ذخیره ژورنال</Button>
        </div>
      </div>

      {/* Tabbed editor */}
      <TradeTabs />

      {/* AI coach: deep review of this trade */}
      <AICoachPanel
        title="تحلیل هوش مصنوعی این معامله"
        subtitle="بررسی کامل ورود، خروج، مدیریت ریسک، احساسات و چارت — همراه با توصیه‌های بهبود"
        fetcher={() => aiApi.getTrade(trade.id)}
        generator={() => aiApi.analyzeTrade(trade.id)}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: TradeStatus }) {
  if (status === "PLANNED") return <Badge tone="muted">برنامه‌ریزی‌شده</Badge>;
  if (status === "OPEN") return <Badge tone="neutral">باز</Badge>;
  return <Badge tone="profit">بسته‌شده</Badge>;
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "saving")
    return <span className="text-sm text-muted">در حال ذخیره…</span>;
  if (status === "saved")
    return <span className="text-sm text-profit">ذخیره شد ✓</span>;
  if (status === "error")
    return <span className="text-sm text-loss">خطا در ذخیره</span>;
  return null;
}
