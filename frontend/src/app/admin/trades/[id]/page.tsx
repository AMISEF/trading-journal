"use client";

/**
 * Admin: read-only view of a single trade's tabs/fields.
 * Loads via GET /admin/trades/{id}, seeds the trade store, and renders the
 * shared TradeTabs in readOnly mode (no editing / no auto-save).
 * Also loads the trade owner's checklist templates so the Checklist tab
 * shows that user's templates, not the admin's.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Badge, Spinner, StatusDot } from "@/components/ui";
import { TradeTabs } from "@/components/editor/TradeTabs";
import { adminApi } from "@/lib/api";
import { useTrade } from "@/store/trade";
import { faNum } from "@/lib/format";
import type { ChecklistTemplate, TradeStatus } from "@/lib/types";

export default function AdminTradeViewPage() {
  return (
    <AppShell requireAdmin>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const { trade, setTrade, reset } = useTrade();
  const [ready, setReady] = useState(false);
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    adminApi
      .trade(id)
      .then((t) => {
        setTrade(t);
        setReady(true);
        adminApi.userChecklists(String(t.userId)).then(setChecklistTemplates).catch(() => {});
      })
      .catch(() => setReady(true));
    return () => reset();
  }, [id, setTrade, reset]);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      await adminApi.deleteTrade(id);
      router.back();
    } catch (e: unknown) {
      const resp = (e as { response?: { data?: { detail?: string }; status?: number } })?.response;
      const msg = resp?.data?.detail ?? `خطای سرور (${resp?.status ?? "?"})`;
      setDeleteError(msg);
      setDeleting(false);
    }
  }

  if (!ready) return <Spinner label="در حال بارگذاری معامله…" />;
  if (!trade) return <p className="text-loss">معامله یافت نشد.</p>;

  return (
    <div className="space-y-5">
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="tj-card w-full max-w-sm space-y-4 p-6">
            <h2 className="text-lg font-bold text-loss">حذف ژورنال</h2>
            <p className="text-sm text-muted">
              آیا از حذف معامله{" "}
              <span className="font-bold text-foreground">
                #{faNum(trade.number)}{" "}
                <span dir="ltr">{trade.symbol || ""}</span>
              </span>{" "}
              مطمئن هستید؟ این عمل برگشت‌پذیر نیست.
            </p>
            {deleteError && <p className="text-sm text-loss">{deleteError}</p>}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                className="flex-1 rounded-xl bg-loss py-2.5 text-sm font-medium text-white disabled:opacity-50"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "در حال حذف…" : "بله، حذف شود"}
              </button>
              <button
                type="button"
                className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted hover:bg-surface-2"
                onClick={() => { setShowConfirm(false); setDeleteError(""); }}
                disabled={deleting}
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="tj-card flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-sm text-primary">
            → بازگشت
          </button>
          <StatusDot status={trade.status} pnl={trade.calc?.realizedPnl} />
          <div className="font-bold">
            معامله #{faNum(trade.number)}{" "}
            <span dir="ltr" className="text-muted">{trade.symbol || ""}</span>
          </div>
          <StatusBadge status={trade.status} />
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="muted">حالت فقط‌خواندنی</Badge>
          <button
            className="rounded px-3 py-1.5 text-sm text-loss border border-loss/30 hover:bg-loss/10 transition-colors"
            onClick={() => setShowConfirm(true)}
          >
            حذف ژورنال
          </button>
        </div>
      </div>

      <TradeTabs readOnly checklistTemplates={checklistTemplates} />
    </div>
  );
}

function StatusBadge({ status }: { status: TradeStatus }) {
  if (status === "PLANNED") return <Badge tone="muted">برنامه‌ریزی‌شده</Badge>;
  if (status === "OPEN") return <Badge tone="neutral">باز</Badge>;
  return <Badge tone="profit">بسته‌شده</Badge>;
}
