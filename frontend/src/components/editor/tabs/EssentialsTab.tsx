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
import { decimalsForTick, formatSignedUsd, formatUsd, pnlColorClass } from "@/lib/format";
import type { TakeProfit } from "@/lib/types";

export function EssentialsTab({ readOnly = false }: { readOnly?: boolean }) {
  const trade = useTrade((s) => s.trade);
  const patch = useTrade((s) => s.patch);
  const user = useAuth((s) => s.user);
  const balance = user?.currentBalance ?? 1000;
  const calc = useCalcPreview(trade, balance);

  if (!trade) return null;

  const tickDecimals = decimalsForTick(0.01); // symbol tick handled live in input

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

      {/* Entry */}
      <Field label="قیمت ورود">
        <NumberInput
          value={trade.entryPrice}
          disabled={readOnly}
          step={Math.pow(10, -tickDecimals)}
          onChange={(entryPrice) => patch({ entryPrice })}
        />
      </Field>

      {/* Leverage */}
      <Field label="اهرم (Leverage)">
        <NumberInput
          value={trade.leverage}
          disabled={readOnly}
          onChange={(leverage) => patch({ leverage })}
        />
      </Field>

      {/* Margin % with computed total volume */}
      <Field
        label="درصد مارجین"
        hint={
          <div className="space-y-0.5 text-xs text-muted">
            <div>حجم با اهرم: <b className="text-text" dir="ltr">{formatUsd(totalVolume, 0)}</b></div>
            <div>حجم بدون اهرم: <b className="text-text" dir="ltr">{formatUsd(marginNoLeverage, 0)}</b></div>
          </div>
        }
      >
        <NumberInput
          value={trade.marginPercent}
          disabled={readOnly}
          onChange={(marginPercent) => patch({ marginPercent })}
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
