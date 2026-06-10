"use client";

/** Admin: a single user's journals. Click a journal -> read-only view. */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Badge, Spinner, StatusDot } from "@/components/ui";
import { adminApi } from "@/lib/api";
import {
  faNum,
  formatPct,
  formatRatio,
  formatSignedUsd,
  pnlColorClass,
} from "@/lib/format";
import { formatJalaliDate } from "@/lib/jalali";
import type { Trade } from "@/lib/types";

export default function AdminUserTradesPage() {
  return (
    <AppShell requireAdmin>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const params = useParams();
  const router = useRouter();
  const userId = String(params.id);
  const [trades, setTrades] = useState<Trade[] | null>(null);

  useEffect(() => {
    adminApi.userTrades(userId).then(setTrades).catch(() => setTrades([]));
  }, [userId]);

  if (!trades) return <Spinner label="در حال بارگذاری ژورنال‌ها…" />;

  const pnl = (t: Trade) => t.calc?.realizedPnl ?? t.realizedPnl ?? null;

  return (
    <div className="space-y-5">
      <button onClick={() => router.push("/admin")} className="text-sm text-primary">
        → بازگشت به کاربران
      </button>
      <h1 className="text-2xl font-bold">ژورنال‌های کاربر</h1>

      {trades.length === 0 && (
        <div className="tj-card p-10 text-center text-muted">
          این کاربر معامله‌ای ثبت نکرده است.
        </div>
      )}

      <div className="tj-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted">
            <tr className="border-b border-border text-right">
              <th className="p-3">#</th>
              <th className="p-3">نماد</th>
              <th className="p-3">جهت</th>
              <th className="p-3">تایم‌فریم</th>
              <th className="p-3">تاریخ</th>
              <th className="p-3">R:R انتظار</th>
              <th className="p-3">نتیجه</th>
              <th className="p-3">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr
                key={t.id}
                onClick={() => router.push(`/admin/trades/${t.id}`)}
                className="cursor-pointer border-b border-border/60 hover:bg-surface-2"
              >
                <td className="p-3 font-medium text-primary">{faNum(t.number)}</td>
                <td className="p-3" dir="ltr">{t.symbol || "—"}</td>
                <td className="p-3">
                  {t.direction === "LONG" ? (
                    <Badge tone="profit">Long</Badge>
                  ) : (
                    <Badge tone="loss">Short</Badge>
                  )}
                </td>
                <td className="p-3 text-xs" dir="ltr">
                  {t.analysisTf || "—"}
                  {t.triggerTf && t.analysisTf ? <span className="text-muted"> / </span> : null}
                  {t.triggerTf && <span className="text-muted">{t.triggerTf}</span>}
                </td>
                <td className="p-3">{formatJalaliDate(t.openDate)}</td>
                <td className="p-3" dir="ltr">{formatRatio(t.calc?.rrExpected ?? t.rrExpected)}</td>
                <td className="p-3" dir="ltr">
                  <span className={pnlColorClass(pnl(t))}>{formatSignedUsd(pnl(t))}</span>
                  <span className={`block text-xs ${pnlColorClass(t.calc?.resultPct)}`}>
                    {formatPct(t.calc?.resultPct)}
                  </span>
                </td>
                <td className="p-3"><StatusDot status={t.status} pnl={pnl(t)} exitType={t.exitType} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
