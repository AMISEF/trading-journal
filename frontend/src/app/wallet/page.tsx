"use client";

/**
 * Wallet management page (/wallet).
 * Lists all deposit/withdrawal transactions with edit/delete menu.
 * Shows a running balance chart.
 */
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/ui";
import { walletApi } from "@/lib/api";
import { useAuth } from "@/store/auth";
import type { WalletTransaction } from "@/lib/types";
import { formatSignedUsd, formatUsd, pnlColorClass } from "@/lib/format";

// recharts در باندلِ جداگانه‌ای لود می‌شود (نه در بارِ اولِ صفحه) چون فقط برای
// نمودار لازم است، نه خلاصه/جدولِ تراکنش‌ها که باید فوری نمایش داده شوند.
const WalletBalanceChart = dynamic(
  () => import("@/components/WalletBalanceChart").then((m) => m.WalletBalanceChart),
  { ssr: false, loading: () => <div className="tj-card h-[268px] animate-pulse" /> }
);

export default function WalletPage() {
  return (
    <AppShell>
      <WalletInner />
    </AppShell>
  );
}

function WalletInner() {
  const user = useAuth((s) => s.user);
  const [txs, setTxs] = useState<WalletTransaction[] | null>(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editTx, setEditTx] = useState<WalletTransaction | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  const load = () =>
    walletApi
      .list()
      .then(setTxs)
      .catch(() => setError("بارگذاری تراکنش‌ها با خطا مواجه شد."));

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("این تراکنش حذف شود؟")) return;
    await walletApi.remove(id);
    setMenuId(null);
    load();
  };

  if (error) return <p className="text-loss">{error}</p>;
  if (!txs) return <Spinner label="در حال بارگذاری…" />;

  // Running balance chart data
  const seed = user?.walletMargin ?? 0;
  let running = seed;
  const chartData = txs.map((tx) => {
    running += tx.amount;
    return {
      date: tx.transactionDate.slice(0, 10),
      balance: running,
    };
  });

  const total = txs.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">کیف پول</h1>
        <button
          onClick={() => { setEditTx(null); setShowForm(true); }}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
        >
          + تراکنش جدید
        </button>
      </div>
      <p className="-mt-3 text-xs text-muted">
        نکته: واریز/برداشت از کیف پول در «برایند» معاملات حساب نمی‌شود؛ برایند فقط عملکرد معاملات را نشان می‌دهد.
      </p>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <div className="tj-card p-4">
          <div className="text-xs text-muted">سرمایه اولیه</div>
          <div className="mt-1 text-xl font-bold" dir="ltr">{formatUsd(seed)}</div>
        </div>
        <div className="tj-card p-4">
          <div className="text-xs text-muted">واریز/برداشت کل</div>
          <div className={`mt-1 text-xl font-bold ${pnlColorClass(total)}`} dir="ltr">
            {formatSignedUsd(total)}
          </div>
        </div>
        <div className="tj-card p-4">
          <div className="text-xs text-muted">موجودی فعلی</div>
          <div className="mt-1 text-xl font-bold text-profit" dir="ltr">{formatUsd(user?.currentBalance)}</div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && <WalletBalanceChart data={chartData} />}

      {/* Transaction list */}
      <div className="tj-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted">
            <tr className="border-b border-border text-right">
              <th className="p-3">تاریخ</th>
              <th className="p-3">مبلغ</th>
              <th className="p-3">نوع</th>
              <th className="p-3">یادداشت</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {txs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-muted">
                  هنوز تراکنشی ثبت نشده است.
                </td>
              </tr>
            )}
            {txs.map((tx) => (
              <tr key={tx.id} className="border-b border-border/60">
                <td className="p-3 text-muted">{tx.transactionDate.slice(0, 10)}</td>
                <td className={`p-3 font-medium ${pnlColorClass(tx.amount)}`} dir="ltr">
                  {formatSignedUsd(tx.amount)}
                </td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      tx.amount >= 0
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {tx.amount >= 0 ? "واریز" : "برداشت"}
                  </span>
                </td>
                <td className="p-3 text-muted">{tx.note || "—"}</td>
                <td className="p-3 relative">
                  <button
                    onClick={() => setMenuId(menuId === tx.id ? null : tx.id)}
                    className="rounded-md p-1 hover:bg-surface-2"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
                    </svg>
                  </button>
                  {menuId === tx.id && (
                    <div className="absolute left-0 top-8 z-10 min-w-[120px] rounded-lg border border-border bg-surface shadow-lg">
                      <button
                        onClick={() => { setEditTx(tx); setShowForm(true); setMenuId(null); }}
                        className="block w-full px-4 py-2 text-right text-sm hover:bg-surface-2"
                      >
                        ویرایش
                      </button>
                      <button
                        onClick={() => handleDelete(tx.id)}
                        className="block w-full px-4 py-2 text-right text-sm text-loss hover:bg-surface-2"
                      >
                        حذف
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <TransactionForm
          tx={editTx}
          onClose={() => { setShowForm(false); setEditTx(null); }}
          onSaved={() => { setShowForm(false); setEditTx(null); load(); }}
        />
      )}

      {/* Close menu on outside click */}
      {menuId && (
        <div className="fixed inset-0 z-0" onClick={() => setMenuId(null)} />
      )}
    </div>
  );
}

function TransactionForm({
  tx,
  onClose,
  onSaved,
}: {
  tx: WalletTransaction | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(tx?.amount ?? ""));
  const [note, setNote] = useState(tx?.note ?? "");
  const [date, setDate] = useState(tx?.transactionDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amountNum = Number(amount);
    if (!amount || isNaN(amountNum)) return;
    setSaving(true);
    try {
      const payload = { amount: amountNum, note: note || null, transactionDate: date ? `${date}T00:00:00Z` : null };
      if (tx) {
        await walletApi.update(tx.id, payload);
      } else {
        await walletApi.create(payload);
      }
      onSaved();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="tj-card w-full max-w-sm p-6">
        <h2 className="mb-4 text-lg font-bold">{tx ? "ویرایش تراکنش" : "تراکنش جدید"}</h2>
        <div className="space-y-4">
          <div>
            <label className="tj-label">مبلغ (واریز مثبت، برداشت منفی)</label>
            <input
              type="number"
              className="tj-input"
              dir="ltr"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="مثال: 500 یا -200"
            />
          </div>
          <div>
            <label className="tj-label">تاریخ</label>
            <input
              type="date"
              className="tj-input"
              dir="ltr"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="tj-label">یادداشت (اختیاری)</label>
            <input
              className="tj-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثلاً: واریز ماهانه"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">
            انصراف
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "ذخیره…" : "ذخیره"}
          </button>
        </div>
      </div>
    </div>
  );
}
