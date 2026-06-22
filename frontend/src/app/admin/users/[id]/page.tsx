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
import type { Trade, User } from "@/lib/types";

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
  const [user, setUser] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [confirmTrade, setConfirmTrade] = useState<Trade | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState("");

  useEffect(() => {
    adminApi.userTrades(userId).then(setTrades).catch(() => setTrades([]));
    adminApi.users().then((users) => {
      const u = users.find((u) => String(u.id) === userId);
      if (u) setUser(u);
    }).catch(() => {});
  }, [userId]);

  const filtered = useMemo(() => {
    if (!trades) return [];
    // Sort descending (latest trade first)
    const sorted = [...trades].sort((a, b) => b.number - a.number);
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(
      (t) =>
        t.symbol?.toLowerCase().includes(q) ||
        String(t.number).includes(q)
    );
  }, [trades, search]);

  const handleSetGroup = async (group: string | null) => {
    setGroupBusy(true);
    setGroupError("");
    try {
      const updated = await adminApi.setGroup(userId, group);
      setUser(updated);
    } catch {
      setGroupError("خطا در تغییر گروه");
    } finally {
      setGroupBusy(false);
    }
  };

  const handleResetCapital = async () => {
    if (!confirm("آیا مطمئن هستید؟ این عمل سرمایه را به ۱۰۰۰ دلار ریست می‌کند و همه معاملات قبلی را قفل می‌کند.")) return;
    setGroupBusy(true);
    setGroupError("");
    try {
      const updated = await adminApi.resetCapital(userId);
      setUser(updated);
      // Refresh trades to reflect locked status
      const refreshed = await adminApi.userTrades(userId);
      setTrades(refreshed);
    } catch {
      setGroupError("خطا در ریست سرمایه");
    } finally {
      setGroupBusy(false);
    }
  };

  const pagination = usePagination(filtered, "admin_user_journals");

  if (!trades) return <Spinner label="در حال بارگذاری ژورنال‌ها…" />;

  const isCryptoTeam = user?.userGroup === "CRYPTOSMART_TEAM";

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
        <h1 className="text-2xl font-bold">
          ژورنال‌های کاربر
          {user && (
            <span className="mr-2 text-base font-normal text-muted">
              {user.firstName} {user.lastName}
            </span>
          )}
          {isCryptoTeam && (
            <span className="mr-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              Cryptosmart Team
            </span>
          )}
        </h1>
        <input
          className="tj-input w-48"
          placeholder="جستجو (نماد یا شماره)"
          value={search}
          onChange={(e) => { setSearch(e.target.value); pagination.setPage(1); }}
        />
      </div>

      {/* Cryptosmart Team management */}
      <div className="tj-card p-4 space-y-3">
        <div className="text-sm font-semibold">مدیریت گروه Cryptosmart Team</div>
        <div className="flex flex-wrap gap-2 items-center">
          {isCryptoTeam ? (
            <button
              type="button"
              disabled={groupBusy}
              onClick={() => handleSetGroup(null)}
              className="rounded-lg border border-amber-400/40 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 disabled:opacity-50"
            >
              {groupBusy ? "…" : "حذف از Cryptosmart Team"}
            </button>
          ) : (
            <button
              type="button"
              disabled={groupBusy}
              onClick={() => handleSetGroup("CRYPTOSMART_TEAM")}
              className="rounded-lg border border-amber-400/40 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 disabled:opacity-50"
            >
              {groupBusy ? "…" : "افزودن به Cryptosmart Team"}
            </button>
          )}
          <button
            type="button"
            disabled={groupBusy}
            onClick={handleResetCapital}
            className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {groupBusy ? "…" : "ریست سرمایه به $۱۰۰۰ + قفل معاملات"}
          </button>
          {user?.capitalResetDate && (
            <span className="text-xs text-muted">
              آخرین ریست: {new Date(user.capitalResetDate).toLocaleDateString("fa-IR")}
            </span>
          )}
        </div>
        {groupError && <p className="text-xs text-loss">{groupError}</p>}
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
                  <th className="p-3">ش.معامله</th>
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
                    className={`cursor-pointer border-b border-border/60 text-right ${t.isLocked ? "opacity-60 bg-surface-2" : "hover:bg-surface-2"}`}
                  >
                    <td className="p-3 font-medium text-primary">
                      {faNum(t.number)}
                      {t.isLocked && (
                        <span className="mr-1 rounded bg-gray-300 px-1 py-0.5 text-[9px] font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                          قفل
                        </span>
                      )}
                    </td>
                    <td className="p-3" dir="ltr">{t.tradeNumber != null ? <span className="font-medium text-primary">{faNum(t.tradeNumber)}</span> : <span className="text-muted">—</span>}</td>
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
                      {t.calc?.capitalPct != null && t.calc.capitalPct !== 0 && (
                        <span className={`block text-xs font-medium ${pnlColorClass(t.calc.capitalPct)}`}>
                          {t.calc.capitalPct > 0 ? "+" : ""}{t.calc.capitalPct.toFixed(2)}٪ سرمایه
                        </span>
                      )}
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
