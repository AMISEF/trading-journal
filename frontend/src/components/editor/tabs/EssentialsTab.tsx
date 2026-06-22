"use client";

/**
 * "اطلاعات ضروری" tab.
 * symbol + live price, direction, entry/leverage/margin (with computed total
 * volume), stop loss (with computed loss %/$), TPs (with per-TP growth numbers
 * from the calc preview), analysis/trigger TF, risk-free plan switch.
 */
import { useState, useEffect } from "react";
import { useTrade } from "@/store/trade";
import { useAuth } from "@/store/auth";
import { SymbolInput } from "../SymbolInput";
import {
  DirectionToggle,
  Field,
  NumberInput,
} from "../fields";

const TIMEFRAMES = ["1Y","1M","1W","1D","4H","1H","15m","5m","1m"];
const TF_STORAGE_KEY = "tj_custom_tfs";

function TimeframeSelect({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  const [customTfs, setCustomTfs] = useState<string[]>([]);
  const [showInput, setShowInput] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(TF_STORAGE_KEY);
      if (stored) setCustomTfs(JSON.parse(stored));
    } catch {}
  }, []);

  const allTfs = [...TIMEFRAMES, ...customTfs];

  const addAndSelect = () => {
    const tf = draft.trim();
    if (!tf) return;
    let updatedCustom = customTfs;
    if (!allTfs.includes(tf)) {
      updatedCustom = [...customTfs, tf];
      setCustomTfs(updatedCustom);
      localStorage.setItem(TF_STORAGE_KEY, JSON.stringify(updatedCustom));
    }
    onChange(tf);
    setDraft("");
    setShowInput(false);
  };

  return (
    <div className="space-y-2">
      <select
        className="tj-input"
        dir="ltr"
        disabled={disabled}
        value={allTfs.includes(value) ? value : ""}
        onChange={(e) => {
          if (e.target.value === "__add__") {
            setShowInput(true);
          } else {
            setShowInput(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">— انتخاب تایم‌فریم —</option>
        {TIMEFRAMES.map((tf) => (
          <option key={tf} value={tf}>{tf}</option>
        ))}
        {customTfs.length > 0 && (
          <>
            <option disabled>──────────</option>
            {customTfs.map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </>
        )}
        <option value="__add__">+ افزودن سفارشی…</option>
      </select>
      {showInput && (
        <div className="flex gap-2">
          <input
            className="tj-input flex-1"
            dir="ltr"
            placeholder="مثلاً: 3D یا 2H"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); addAndSelect(); }
              if (e.key === "Escape") setShowInput(false);
            }}
          />
          <button
            type="button"
            onClick={addAndSelect}
            className="shrink-0 rounded-lg bg-primary px-3 text-sm text-white"
          >
            افزودن
          </button>
        </div>
      )}
    </div>
  );
}
import { useCalcPreview } from "../useCalcPreview";
import { decimalsForTick, faNum, formatSignedUsd, formatUsd, pnlColorClass } from "@/lib/format";
import type { EntryLevel, TakeProfit } from "@/lib/types";

/** Format a raw price (not a currency) for display. */
function formatPrice(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

/**
 * Collapse multi-level entries into a single entry + total margin.
 *
 * Every level's percent is taken against the SAME wallet balance, so two "4%"
 * levels are two equal-dollar buys ($20 + $20) — the second is never reduced.
 * The average is quantity-weighted (the real exchange breakeven):
 *   avgEntry = Σ marginᵢ / Σ(marginᵢ / priceᵢ)
 *
 * This function ignores isActivated — it always uses ALL levels. Use it for
 * planning/display purposes. For stored calc values, use deriveActivatedEntry.
 */
export function deriveEntryLevels(levels: EntryLevel[]): {
  avgEntry: number | null;
  totalPct: number;
} {
  const priced = levels.filter((l) => l.price != null && l.price > 0);
  const weighted = priced.filter((l) => l.marginPercent != null && l.marginPercent > 0);
  if (weighted.length > 0) {
    const totalPct = weighted.reduce((s, l) => s + (l.marginPercent as number), 0);
    const denom = weighted.reduce(
      (s, l) => s + (l.marginPercent as number) / (l.price as number),
      0
    );
    return { avgEntry: denom > 0 ? totalPct / denom : null, totalPct };
  }
  // Prices entered but no margins yet: keep a live entry (simple average) so the
  // SL% / RR preview still works. Total margin stays 0 until the user fills it.
  if (priced.length > 0) {
    const avg = priced.reduce((s, l) => s + (l.price as number), 0) / priced.length;
    return { avgEntry: avg, totalPct: 0 };
  }
  return { avgEntry: null, totalPct: 0 };
}

/**
 * Like deriveEntryLevels but respects activation status.
 * Level 1 is always included; levels 2+ are excluded only when isActivated === false.
 * (isActivated undefined = treated as activated, for backward compat.)
 */
export function deriveActivatedEntry(levels: EntryLevel[]): {
  avgEntry: number | null;
  totalPct: number;
} {
  const active = levels.filter((l, i) => i === 0 || l.isActivated !== false);
  return deriveEntryLevels(active);
}

export function EssentialsTab({ readOnly = false }: { readOnly?: boolean }) {
  const trade = useTrade((s) => s.trade);
  const patch = useTrade((s) => s.patch);
  const user = useAuth((s) => s.user);
  // Margin is derived from the trade's fixed balance snapshot (captured at
  // recording time) so it never changes as the wallet balance moves. New trades
  // without a snapshot fall back to the current wallet balance.
  const balance = trade?.balanceSnapshot ?? user?.currentBalance ?? 1000;
  const calc = useCalcPreview(trade, balance);

  if (!trade) return null;

  const tickDecimals = decimalsForTick(0.01); // symbol tick handled live in input

  // Working entry levels: use the stored levels, or synthesize a single level
  // from the legacy entryPrice/marginPercent so old trades keep working.
  const levels: EntryLevel[] =
    trade.entryLevels && trade.entryLevels.length > 0
      ? trade.entryLevels
      : [{ order: 1, price: trade.entryPrice, marginPercent: trade.marginPercent }];

  // Commit a new set of levels: re-number them and keep entryPrice/marginPercent
  // (the canonical fields the calc engine reads) in sync with the activated levels.
  const commitLevels = (next: EntryLevel[]) => {
    const reordered = next.map((l, i) => ({ ...l, order: i + 1 }));
    const { avgEntry, totalPct } = deriveActivatedEntry(reordered);
    patch({
      entryLevels: reordered,
      entryPrice: avgEntry,
      marginPercent: totalPct > 0 ? Math.round(totalPct * 100) / 100 : null,
    });
  };
  const setLevel = (i: number, fields: Partial<EntryLevel>) =>
    commitLevels(levels.map((l, idx) => (idx === i ? { ...l, ...fields } : l)));
  const addLevel = () =>
    commitLevels([...levels, { order: levels.length + 1, price: null, marginPercent: null }]);
  const removeLevel = (i: number) => commitLevels(levels.filter((_, idx) => idx !== i));

  const { avgEntry, totalPct } = deriveEntryLevels(levels);
  const multiLevel = levels.length > 1;

  const updateTp = (i: number, fields: Partial<TakeProfit>) => {
    const tps = trade.takeProfits.map((tp, idx) =>
      idx === i ? { ...tp, ...fields } : tp
    );
    patch({ takeProfits: tps });
  };
  const addTp = () => {
    const order = trade.takeProfits.length + 1;
    patch({
      takeProfits: [...trade.takeProfits, { order, price: null, savePercent: 0 }],
    });
  };
  const removeTp = (i: number) => {
    const tps = trade.takeProfits
      .filter((_, idx) => idx !== i)
      .map((tp, idx) => ({ ...tp, order: idx + 1 }));
    patch({ takeProfits: tps });
  };

  // Computed helpers.
  const totalVolume = calc?.positionSize ?? null;
  const marginNoLeverage = trade.marginPercent && balance ? (trade.marginPercent / 100) * balance : null;
  const lossPct =
    trade.entryPrice && trade.stopLoss && trade.leverage
      ? ((trade.direction === "LONG" ? -1 : 1) *
          ((trade.stopLoss - trade.entryPrice) / trade.entryPrice) *
          trade.leverage *
          100)
      : null;
  const lossDollarDirect = lossPct != null && marginNoLeverage != null
    ? (lossPct / 100) * marginNoLeverage
    : null;
  const lossDollar = calc ? -Math.abs(calc.risk1r) : lossDollarDirect != null ? -Math.abs(lossDollarDirect) : null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Symbol + live price */}
      <Field label="نماد">
        <SymbolInput
          value={trade.symbol}
          disabled={readOnly}
          onSelect={(symbol) => patch({ symbol })}
        />
      </Field>

      {/* Direction */}
      <Field label="جهت معامله">
        <DirectionToggle
          value={trade.direction}
          disabled={readOnly}
          onChange={(direction) => patch({ direction })}
        />
      </Field>

      {/* Manual trade reference number */}
      <Field label="شماره معامله">
        <input
          type="number"
          dir="ltr"
          className="tj-input"
          disabled={readOnly}
          placeholder="اختیاری"
          value={trade.tradeNumber ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            patch({ tradeNumber: v === "" ? null : Math.trunc(Number(v)) });
          }}
        />
      </Field>

      {/* Entry levels (DCA / پله‌ای) */}
      <div className="md:col-span-2">
        <div className="mb-2 flex items-center justify-between">
          <label className="tj-label mb-0">
            ورود {multiLevel && <span className="font-normal text-muted">(پله‌ای)</span>}
          </label>
          {!readOnly && (
            <button
              type="button"
              onClick={addLevel}
              className="rounded-lg bg-primary px-3 py-1 text-sm font-medium text-white"
            >
              + افزودن پله
            </button>
          )}
        </div>
        <div className="space-y-3">
          {levels.map((lvl, i) => {
            const lvlDollar =
              lvl.marginPercent != null && balance
                ? Math.round((lvl.marginPercent / 100) * balance * 100) / 100
                : null;
            return (
              <div key={i} className="tj-card p-3">
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-sm font-bold text-primary">
                    {faNum(i + 1)}
                  </span>
                  <div className="grid flex-1 gap-2 sm:grid-cols-3">
                    <NumberInput
                      value={lvl.price}
                      disabled={readOnly}
                      step={Math.pow(10, -tickDecimals)}
                      placeholder="قیمت ورود"
                      onChange={(price) => setLevel(i, { price })}
                    />
                    <div className="relative">
                      <NumberInput
                        value={lvl.marginPercent}
                        disabled={readOnly}
                        placeholder="درصد ولت"
                        onChange={(marginPercent) => setLevel(i, { marginPercent })}
                      />
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
                    </div>
                    <div className="relative">
                      <NumberInput
                        value={lvlDollar}
                        disabled={readOnly}
                        placeholder="دلار"
                        onChange={(dollar) => {
                          if (dollar != null && balance > 0) {
                            setLevel(i, {
                              marginPercent: Math.round((dollar / balance) * 10000) / 100,
                            });
                          } else if (dollar == null) {
                            setLevel(i, { marginPercent: null });
                          }
                        }}
                      />
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted">$</span>
                    </div>
                  </div>
                  {!readOnly && levels.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLevel(i)}
                      className="shrink-0 text-xs text-loss"
                      title="حذف پله"
                    >
                      حذف
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* Derived summary: average entry + total margin + total volume */}
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <span className="text-muted">
            {multiLevel ? "میانگین ورود" : "قیمت ورود"}:{" "}
            <b className="text-text" dir="ltr">{formatPrice(avgEntry)}</b>
          </span>
          <span className="text-muted">
            مارجین کل:{" "}
            <b className="text-text" dir="ltr">
              {totalPct > 0 ? `${faNum(Math.round(totalPct * 100) / 100)}%` : "—"}
            </b>{" "}
            / <b className="text-text" dir="ltr">{formatUsd(marginNoLeverage, 0)}</b>
          </span>
          <span className="text-muted">
            حجم با اهرم: <b className="text-text" dir="ltr">{formatUsd(totalVolume, 0)}</b>
          </span>
        </div>
      </div>

      {/* Leverage */}
      <Field label="اهرم (Leverage)">
        <NumberInput
          value={trade.leverage}
          disabled={readOnly}
          onChange={(leverage) => patch({ leverage })}
        />
      </Field>

      {/* Stop loss with computed loss */}
      <Field
        label="حد ضرر (Stop Loss)"
        hint={
          <span className="text-loss" dir="ltr">
            {lossPct != null ? `${lossPct.toFixed(2)}%` : "—"} /{" "}
            {formatSignedUsd(lossDollar)}
          </span>
        }
      >
        <NumberInput
          value={trade.stopLoss}
          disabled={readOnly}
          step={Math.pow(10, -tickDecimals)}
          onChange={(stopLoss) => patch({ stopLoss })}
        />
      </Field>

      {/* Take profits */}
      <div className="md:col-span-2">
        <div className="mb-2 flex items-center justify-between">
          <label className="tj-label mb-0">تارگت‌ها (Take Profit)</label>
          {!readOnly && (
            <button
              type="button"
              onClick={addTp}
              className="rounded-lg bg-profit px-3 py-1 text-sm font-medium text-white"
            >
              + افزودن تارگت
            </button>
          )}
        </div>
        <div className="space-y-3">
          {trade.takeProfits.length === 0 && (
            <p className="text-sm text-muted">هنوز تارگتی اضافه نشده است.</p>
          )}
          {trade.takeProfits.map((tp, i) => {
            const per = calc?.perTp?.find((p) => p.order === tp.order);
            return (
              <div key={i} className="tj-card p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto,1fr]">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-sm font-bold text-primary">
                    TP{tp.order}
                  </span>
                  <NumberInput
                    value={tp.price}
                    disabled={readOnly}
                    placeholder="قیمت تارگت"
                    onChange={(price) => updateTp(i, { price })}
                  />
                </div>
                {/* Per-TP computed numbers */}
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                  <span className="text-muted">
                    رشد اسپات:{" "}
                    <b dir="ltr">{per ? `${per.spotPct.toFixed(2)}%` : "—"}</b>
                  </span>
                  <span className="text-muted">
                    با اهرم:{" "}
                    <b dir="ltr">{per ? `${per.levPct.toFixed(2)}%` : "—"}</b>
                  </span>
                  <span className={pnlColorClass(per?.fullDollar)}>
                    سود کامل: <b dir="ltr">{formatSignedUsd(per?.fullDollar)}</b>
                  </span>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeTp(i)}
                    className="mt-2 text-xs text-loss"
                  >
                    حذف تارگت
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Timeframes */}
      <Field label="تایم‌فریم تحلیل">
        <TimeframeSelect
          value={trade.analysisTf ?? ""}
          disabled={readOnly}
          onChange={(v) => patch({ analysisTf: v })}
        />
      </Field>
      <Field label="تایم‌فریم تریگر">
        <TimeframeSelect
          value={trade.triggerTf ?? ""}
          disabled={readOnly}
          onChange={(v) => patch({ triggerTf: v })}
        />
      </Field>
    </div>
  );
}
