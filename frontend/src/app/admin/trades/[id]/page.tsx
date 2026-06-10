"use client";

/**
 * Admin: read-only view of a single trade's tabs/fields.
 * Loads via GET /admin/trades/{id}, seeds the trade store, and renders the
 * shared TradeTabs in readOnly mode (no editing / no auto-save).
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Badge, Spinner, StatusDot } from "@/components/ui";
import { TradeTabs } from "@/components/editor/TradeTabs";
import { adminApi } from "@/lib/api";
import { useTrade } from "@/store/trade";
import { faNum } from "@/lib/format";
import type { TradeStatus } from "@/lib/types";

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

  useEffect(() => {
    adminApi
      .trade(id)
      .then((t) => {
        setTrade(t);
        setReady(true);
      })
      .catch(() => setReady(true));
    return () => reset();
  }, [id, setTrade, reset]);

  if (!ready) return <Spinner label="در حال بارگذاری معامله…" />;
  if (!trade) return <p className="text-loss">معامله یافت نشد.</p>;

  return (
    <div className="space-y-5">
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
        <Badge tone="muted">حالت فقط‌خواندنی</Badge>
      </div>

      <TradeTabs readOnly />
    </div>
  );
}

function StatusBadge({ status }: { status: TradeStatus }) {
  if (status === "PLANNED") return <Badge tone="muted">برنامه‌ریزی‌شده</Badge>;
  if (status === "OPEN") return <Badge tone="neutral">باز</Badge>;
  return <Badge tone="profit">بسته‌شده</Badge>;
}
