"use client";

/** Admin: a single user's journals. Click a journal -> read-only view. */
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Badge, Paginator, Spinner, StatusDot, usePagination } from "@/components/ui";
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
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmTrade, setConfirmTrade] = useState<Trade | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    adminApi.userTrades(userId).then(setTrades).catch(() => setTrades([]));
  }, [userId]);

  const filtered = useMemo(() => {
    if (!trades) return [];
    if (!search.trim()) return trades;
    const q = search.toLowerCase();
    return trades.filter(
      (t) =>
        t.symbol?.toLowerCase().includes(q) ||
        String(t.number).includes(q)
    );
  }, [trades, search]);

  const pagination = usePagination(filtered, "admin_user_journals");

  if (!trades) return <Spinner label="در حال بارگذاری ژورنال‌ها…" />;

  const pnl = (t: Trade) => t.calc?.realizedPnl ?? t.realizedPnl ?? null;
  const rr  = (t: Trade) => t.calc?.rrAchieved  ?? t.rrAchieved  ?? null;

  async function handleDeleteConfirm() {
    if (!confirmTrade) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await adminApi.deleteTrade(String(confirmTrade.id));
      setTrades((prev) => prev ? prev.filter((t) => t.id !== confirmTrade.id) : prev);
      setConfirmTrade(null);
    } catch (e: unknown) {
      const resp = (e as { response?: { data?: { detail?: string }; status?: number } })?.response;
      const msg = resp?.data?.detail ?? `خطای سرور (${resp?.status ?? "?"})`;
      setDeleteError(msg);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      {confirmTrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="tj-card w-full max-w-sm space-y-4 p-6">
            <h2 className="text-lg font-bold text-loss">حذف ژورنال</h2>
            <p className="text-sm text-muted">
              آیا از حذف معامله{" "}
              <span className="font-bold text-foreground">
                #{faNum(confirmTrade.number)}{" "}
                <span dir="ltr">{confirmTrade.symbol || ""}</span>
              </span>{" "}
              مطمئن هستید؟ این عمل برگشت‌پذیر نیست.
            </p>
            {deleteError && <p className="text-sm text-loss">{deleteError}</p>}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                className="flex-1 rounded-xl bg-loss py-2.5 text-sm font-medium text-white disabled:opacity-50"
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                {deleting ? "در حال حذف…" : "بله، حذف شود"}
              </button>
              <button
                type="button"
                className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted hover:bg-surface-2"
                onClick={() => { setConfirmTrade(null); setDeleteError(""); }}
                disabled={deleting}
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      <button onClick={() => router.push("/admin")} className="text-sm text-primary">
        → بازگشت به کاربران
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">ژورنال‌های کاربر</h1>
        <input
          className="tj-input w-48"
          placeholder="جستجو (نماد یا شماره)"
          value={search}
          onChange={(e) => { setSearch(e.target.value); pagination.setPage(1); }}
        />
      </div>

      {trades.length === 0 && (
        <div className="tj-card p-10 text-center text-muted">
          این کاربر معامله‌ای ثبت نکرده است.
        </div>
      )}

      {trades.length > 0 && (
        <>
          <Paginator
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            total={pagination.total}
            start={pagination.start}
            setPage={pagination.setPage}
            setPageSize={pagination.setPageSize}
          />

          <div className="tj-card overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="text-muted">
                <tr className="border-b border-border">
                  <th className="p-3">#</th>
                  <th className="p-3">نماد</th>
                  <th className="p-3">جهت</th>
                  <th className="p-3">تایم‌فریم</th>
                  <th className="p-3">تاریخ</th>
                  <th className="p-3">R:R انتظار</th>
                  <th className="p-3">R:R کسب‌شده</th>
                  <th className="p-3">نتیجه</th>
                  <th className="p-3">برچسب‌ها</th>
                  <th className="p-3">وضعیت</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {pagination.slice.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => router.push(`/admin/trades/${t.id}`)}
                    className="cursor-pointer border-b border-border/60 hover:bg-surface-2 text-right"
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
                      <span className={rr(t) !== null && rr(t)! >= 1 ? "text-profit font-semibold" : rr(t) !== null ? "text-loss font-semibold" : "text-muted"}>
                        {formatRatio(rr(t))}
                      </span>
                    </td>
                    <td className="p-3" dir="ltr">
                      <span className={pnlColorClass(pnl(t))}>{formatSignedUsd(pnl(t))}</span>
                      <span className={`block text-xs ${pnlColorClass(t.calc?.resultPct)}`}>
                        {formatPct(t.calc?.resultPct)}
                      </span>
                    </td>
                    <td className="p-3">
                      {t.tags && t.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {t.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      <StatusDot status={t.status} pnl={pnl(t)} exitType={t.exitType} />
                    </td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="rounded px-2 py-1 text-xs text-loss hover:bg-loss/10 transition-colors"
                        onClick={() => setConfirmTrade(t)}
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <Paginator
              page={pagination.page}
              totalPages={pagination.totalPages}
              pageSize={pagination.pageSize}
              total={pagination.total}
              start={pagination.start}
              setPage={pagination.setPage}
              setPageSize={pagination.setPageSize}
            />
          )}
        </>
      )}
    </div>
  );
}
