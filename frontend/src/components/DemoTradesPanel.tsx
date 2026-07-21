"use client";

/**
 * لیستِ کاملِ معاملاتِ حسابِ دمو (Arezo Imani) با امکانِ کلیک برای دیدنِ جزئیاتِ
 * کاملِ هر معامله — همان تب‌های ادیتور به‌صورتِ فقط‌خواندنی (شاملِ تصاویرِ ورود و
 * خروج). هیچ فراخوانیِ نیازمندِ لاگین انجام نمی‌شود؛ چک‌لیست‌ها از اندپوینتِ عمومی
 * می‌آیند.
 */
import { useEffect, useMemo, useState } from "react";
import { publicApi } from "@/lib/api";
import type { ChecklistTemplate, Trade } from "@/lib/types";
import { faNum, formatRatio, formatSignedUsd, formatUsd, pnlColorClass } from "@/lib/format";
import { formatJalaliDate } from "@/lib/jalali";
import { TradeTabs } from "@/components/editor/TradeTabs";
import { useTrade } from "@/store/trade";
import { Badge, StatusDot } from "@/components/ui";

const T = { green: "52,211,153", red: "251,146,160", sky: "125,211,252", violet: "167,139,250" } as const;
const PAGE_SIZE = 10;

function pnlOf(t: Trade): number | null {
  if (t.source === "toobit" && t.realizedPnl != null) return t.realizedPnl;
  return t.calc?.realizedPnl ?? t.realizedPnl ?? null;
}

export function DemoTradesPanel({ trades }: { trades: Trade[] }) {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Trade | null>(null);

  const filtered = useMemo(
    () => trades.filter((t) => statusFilter === "ALL" || t.status === statusFilter),
    [trades, statusFilter],
  );
  useEffect(() => { setPage(1); }, [statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (trades.length === 0) {
    return <p className="tj-card p-8 text-center text-sm text-muted">این حساب هنوز معامله‌ای ثبت نکرده است.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">وضعیت:</span>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl bg-surface-2 px-3 py-2 text-sm outline-none"
          style={{ border: "1px solid var(--border)" }}
        >
          <option value="ALL">همه</option>
          <option value="PLANNED">برنامه‌ریزی‌شده</option>
          <option value="OPEN">باز</option>
          <option value="CLOSED">بسته‌شده</option>
        </select>
        <span className="ml-auto text-xs text-muted">{faNum(filtered.length)} معامله</span>
      </div>

      <p className="px-1 text-[11px] text-muted">برای مشاهدهٔ جزئیات کاملِ هر معامله روی آن کلیک کنید</p>

      <div className="tj-card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-muted">
            <tr className="border-b border-border text-center">
              <th className="p-3 text-right">نماد</th>
              <th className="p-3">جهت</th>
              <th className="p-3">VOL</th>
              <th className="p-3">تاریخ</th>
              <th className="p-3">R:R کسب</th>
              <th className="p-3">نتیجه</th>
              <th className="p-3">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((t) => {
              const pnl = pnlOf(t);
              return (
                <tr
                  key={t.id}
                  onClick={() => setDetail(t)}
                  className={`cursor-pointer border-b border-border/60 transition-colors ${t.source === "toobit" ? "bg-sky-400/10 hover:bg-sky-400/20" : "hover:bg-surface-2"}`}
                >
                  <td className="p-3 text-right font-medium" dir="ltr">
                    {t.symbol || "—"}
                    {t.source === "toobit" && (
                      <span className="ml-1 inline-block rounded-md border border-sky-400/40 bg-sky-400/15 px-1.5 py-0.5 align-middle text-[9px] font-bold text-sky-300">toobit</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: `rgba(${t.direction === "LONG" ? T.green : T.red},0.16)`, color: `rgb(${t.direction === "LONG" ? T.green : T.red})` }}>
                      {t.direction === "LONG" ? "Long" : "Short"}
                    </span>
                  </td>
                  <td className="p-3 text-center text-muted" dir="ltr">{formatUsd(t.calc?.positionSize, 0)}</td>
                  <td className="p-3 text-center text-muted">{formatJalaliDate(t.openDate)}</td>
                  <td className="p-3 text-center" dir="ltr">{formatRatio(t.calc?.rrAchieved ?? t.rrAchieved)}</td>
                  <td className="p-3 text-center" dir="ltr"><span className={pnlColorClass(pnl)}>{formatSignedUsd(pnl)}</span></td>
                  <td className="p-3 text-center"><StatusPill status={t.status} pnl={pnl} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}
            className="tj-card px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40">قبلی</button>
          <span className="px-2 text-sm text-muted">صفحهٔ {faNum(safePage)} از {faNum(totalPages)}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
            className="tj-card px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40">بعدی</button>
        </div>
      )}

      {detail && <DemoTradeDetailModal trade={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function StatusPill({ status, pnl }: { status: string; pnl: number | null }) {
  if (status === "CLOSED") {
    const rgb = (pnl ?? 0) >= 0 ? T.green : T.red;
    return <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: `rgba(${rgb},0.16)`, color: `rgb(${rgb})` }}>بسته‌شده</span>;
  }
  const label = status === "OPEN" ? "باز" : "برنامه‌ریزی";
  const rgb = status === "OPEN" ? T.sky : T.violet;
  return <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: `rgba(${rgb},0.16)`, color: `rgb(${rgb})` }}>{label}</span>;
}

/** Read-only full-detail viewer — reuses the editor tabs (all tabs, complete
 *  details including entry/exit images) with no editing and no authed calls. */
function DemoTradeDetailModal({ trade, onClose }: { trade: Trade; onClose: () => void }) {
  const setTrade = useTrade((s) => s.setTrade);
  const reset = useTrade((s) => s.reset);
  const [checklists, setChecklists] = useState<ChecklistTemplate[]>([]);

  useEffect(() => {
    setTrade(trade);
    return () => reset();
  }, [trade, setTrade, reset]);

  useEffect(() => {
    publicApi.teamChecklists(trade.userId).then(setChecklists).catch(() => setChecklists([]));
  }, [trade.userId]);

  const pnl = pnlOf(trade);

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose} dir="rtl">
      <div className="tj-card my-6 w-full max-w-3xl space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <StatusDot status={trade.status} pnl={pnl} exitType={trade.exitType} />
            <div className="font-bold">
              معامله #{faNum(trade.number)} <span dir="ltr" className="text-muted">{trade.symbol || ""}</span>
            </div>
            <Badge tone="muted">حالت فقط‌خواندنی</Badge>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:bg-surface-2">
            بستن ✕
          </button>
        </div>
        <TradeTabs readOnly checklistTemplates={checklists} />
      </div>
    </div>
  );
}
