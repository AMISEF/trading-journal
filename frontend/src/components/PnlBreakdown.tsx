"use client";

/**
 * Compact daily / weekly / monthly PnL breakdown card.
 * Used in the admin per-user dashboard modal.
 */
import { useMemo, useState } from "react";
import {
  buildDailyData,
  buildWeeklyData,
  buildMonthlyData,
  type PnlByDay,
} from "@/lib/pnl";

const TINTS = {
  green: "52,211,153",
  red: "251,146,160",
  sky: "125,211,252",
};

type View = "daily" | "weekly" | "monthly";

export function PnlBreakdown({ pnlByDay }: { pnlByDay: PnlByDay[] }) {
  const [view, setView] = useState<View>("weekly");

  const daily = useMemo(() => buildDailyData(pnlByDay), [pnlByDay]);
  const weekly = useMemo(() => [...buildWeeklyData(pnlByDay)].reverse(), [pnlByDay]);
  const monthly = useMemo(() => [...buildMonthlyData(pnlByDay)].reverse(), [pnlByDay]);

  const rows = view === "daily" ? daily : view === "weekly" ? weekly : monthly;

  const pill = (active: boolean) =>
    active
      ? {
          background: `linear-gradient(135deg, rgba(${TINTS.sky},0.9), rgba(${TINTS.sky},0.55))`,
          border: `1px solid rgba(${TINTS.sky},0.5)`,
          color: "#0a1622",
        }
      : {
          background: "var(--glass-bg)",
          border: "1px solid var(--glass-border)",
          color: "var(--muted)",
        };

  return (
    <div className="tj-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">سود و زیان دوره‌ای</h3>
        <div className="flex gap-1.5">
          {(["daily", "weekly", "monthly"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className="rounded-full px-3 py-1 text-xs font-semibold transition"
              style={pill(view === v)}
            >
              {v === "daily" ? "روزانه" : v === "weekly" ? "هفتگی" : "ماهانه"}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">داده‌ای موجود نیست</p>
      ) : (
        <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {rows.map((row) => {
            const rgb = row.pnl >= 0 ? TINTS.green : TINTS.red;
            return (
              <div
                key={row.key}
                className="flex items-center justify-between rounded-xl px-3 py-2"
                style={{
                  background: `linear-gradient(135deg, rgba(${rgb},0.14), rgba(${rgb},0.03))`,
                  border: `1px solid rgba(${rgb},0.22)`,
                }}
              >
                <div>
                  <div className="text-sm font-semibold">{row.jalaliLabel}</div>
                  <div className="text-[10px] text-muted" dir="ltr">{row.label}</div>
                </div>
                <div
                  className="text-sm font-extrabold"
                  style={{ color: `rgb(${rgb})` }}
                  dir="ltr"
                >
                  {row.pnl >= 0 ? "+" : ""}{row.pnl.toFixed(2)} USDT
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
