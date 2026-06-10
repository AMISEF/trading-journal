"use client";

/**
 * "مدیریت معامله" tab.
 * TPs each with price + save% (with per-TP spot%, lev%, dollar-with-save and
 * dynamic R:R from the calc preview), stop loss %/$, risk-free checkbox,
 * an "exit zone" dropdown (sets exitType + status=CLOSED), and open/close
 * date+time (Jalali) stored as ISO.
 */
import { useTrade } from "@/store/trade";
import { useAuth } from "@/store/auth";
import { useCalcPreview } from "../useCalcPreview";
import { JalaliDateTime } from "../JalaliDateTime";
import { Field, NumberInput, Switch } from "../fields";
import { formatSignedUsd, formatRatio, pnlColorClass } from "@/lib/format";
import type { ExitType, TakeProfit } from "@/lib/types";

// Maps an exit-zone selection to an exitType + closes the trade.
const BASE_EXIT_OPTIONS: { value: string; label: string; exitType: ExitType }[] = [
  { value: "RISK_FREE", label: "شد ریسک‌فری", exitType: "RISK_FREE" },
  { value: "LAST_TP", label: "آخرین تارگت (TP)", exitType: "LAST_TP" },
  { value: "STOP_LOSS", label: "استاپ لاس", exitType: "STOP_LOSS" },
  { value: "TRAILING_STOP", label: "تریل استاپ", exitType: "TRAILING_STOP" },
];

export function ManagementTab({ readOnly = false }: { readOnly?: boolean }) {
  const trade = useTrade((s) => s.trade);
  const patch = useTrade((s) => s.patch);
  const user = useAuth((s) => s.user);
  const calc = useCalcPreview(trade, user?.currentBalance ?? 1000);

  if (!trade) return null;

  const updateTp = (i: number, fields: Partial<TakeProfit>) => {
    const tps = trade.takeProfits.map((tp, idx) =>
      idx === i ? { ...tp, ...fields } : tp
    );
    patch({ takeProfits: tps });
  };

  const lossPct =
    trade.entryPrice && trade.stopLoss && trade.leverage
      ? (trade.direction === "LONG" ? -1 : 1) *
        ((trade.stopLoss - trade.entryPrice) / trade.entryPrice) *
        trade.leverage *
        100
      : null;
  const marginDollar =
    trade.marginPercent && (user?.currentBalance ?? 1000)
      ? (trade.marginPercent / 100) * (user?.currentBalance ?? 1000)
      : null;
  const lossDollarDirect =
    marginDollar && lossPct != null ? (lossPct / 100) * marginDollar : null;
  const lossDollar = calc ? -Math.abs(calc.risk1r) : lossDollarDirect != null ? -Math.abs(lossDollarDirect) : null;

  // Build exit options including individual TPs.
  const tpExitOptions = trade.takeProfits.map((tp) => ({
    value: `TP${tp.order}`,
    label: `تارگت TP${tp.order}${tp.price != null ? ` (${tp.price})` : ""}`,
    exitType: "LAST_TP" as ExitType,
  }));
  const EXIT_OPTIONS = [...BASE_EXIT_OPTIONS, ...tpExitOptions];

  const onExitZone = (value: string) => {
    if (readOnly || !value) return;
    const opt = EXIT_OPTIONS.find((o) => o.value === value);
    if (!opt) return;
    patch({
      exitType: opt.exitType,
      status: "CLOSED",
      closeDate: trade.closeDate || new Date().toISOString(),
    });
  };

  return (
    <div className="space-y-6">
      {/* TPs with save% */}
      <div>
        <label className="tj-label">تارگت‌ها و درصد ذخیره</label>
        <div className="space-y-3">
          {trade.takeProfits.length === 0 && (
            <p className="text-sm text-muted">
              ابتدا در تب «اطلاعات ضروری» تارگت اضافه کنید.
            </p>
          )}
          {trade.takeProfits.map((tp, i) => {
            const per = calc?.perTp?.find((p) => p.order === tp.order);
            return (
              <div key={i} className="tj-card p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-sm font-bold text-primary">
                      TP{tp.order}
                    </span>
                    <NumberInput
                      value={tp.price}
                      disabled={readOnly}
                      placeholder="قیمت"
                      onChange={(price) => updateTp(i, { price })}
                    />
                  </div>
                  <Field label="درصد ذخیره (Save %)">
                    <input
                      type="number"
                      dir="ltr"
                      className="tj-input"
                      disabled={readOnly}
                      placeholder="0"
                      value={tp.savePercent === 0 ? "" : tp.savePercent}
                      min={0}
                      max={100}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateTp(i, { savePercent: v === "" ? 0 : Math.max(0, Math.min(100, Number(v))) });
                      }}
                    />
                  </Field>
                  <div className="flex flex-col justify-center text-xs">
                    <span className="text-muted">
                      اسپات: <b dir="ltr">{per ? `${per.spotPct.toFixed(2)}%` : "—"}</b>{" "}
                      | اهرم: <b dir="ltr">{per ? `${per.levPct.toFixed(2)}%` : "—"}</b>
                    </span>
                    <span className={pnlColorClass(per?.savedDollar)}>
                      دلار با ذخیره:{" "}
                      <b dir="ltr">{formatSignedUsd(per?.savedDollar)}</b>
                    </span>
                    <span className="text-muted">
                      R:R پویا: <b dir="ltr">{formatRatio(per?.rrDynamic)}</b>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stop loss summary */}
      <div className="tj-card p-4">
        <div className="text-sm font-medium">حد ضرر</div>
        <div className="mt-1 text-sm text-loss" dir="ltr">
          {lossPct != null ? `${lossPct.toFixed(2)}%` : "—"} /{" "}
          {formatSignedUsd(lossDollar)}
        </div>
      </div>

      {/* Risk-free management */}
      <Switch
        label="مدیریت ریسک‌فری (Risk-Free)"
        checked={trade.isRiskFreeMgmt}
        disabled={readOnly}
        onChange={(isRiskFreeMgmt) => patch({ isRiskFreeMgmt })}
      />

      {/* Exit zone */}
      <Field
        label="منطقه‌ی خروج (بستن معامله)"
        hint={
          trade.exitType ? (
            <span className="text-primary">
              نوع خروج فعلی:{" "}
              {EXIT_OPTIONS.find((o) => o.exitType === trade.exitType)?.label}
            </span>
          ) : undefined
        }
      >
        <select
          className="tj-input"
          disabled={readOnly}
          value={trade.exitType ?? ""}
          onChange={(e) => onExitZone(e.target.value)}
        >
          <option value="">— انتخاب کنید —</option>
          {BASE_EXIT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {tpExitOptions.length > 0 && (
            <>
              <option disabled>──────────────</option>
              {tpExitOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </>
          )}
        </select>
      </Field>

      {/* Trailing stop value (only meaningful for TRAILING_STOP) */}
      {trade.exitType === "TRAILING_STOP" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="مقدار تریل استاپ">
            <NumberInput
              value={trade.trailExitValue}
              disabled={readOnly}
              onChange={(trailExitValue) => patch({ trailExitValue })}
            />
          </Field>
          <Switch
            label="مقدار به‌صورت درصد است"
            checked={!!trade.trailIsPercent}
            disabled={readOnly}
            onChange={(trailIsPercent) => patch({ trailIsPercent })}
          />
        </div>
      )}

      {/* Dates */}
      <div className="grid gap-4 md:grid-cols-2">
        <JalaliDateTime
          label="تاریخ و زمان باز شدن"
          value={trade.openDate}
          disabled={readOnly}
          onChange={(openDate) => patch({ openDate })}
        />
        <JalaliDateTime
          label="تاریخ و زمان بسته شدن"
          value={trade.closeDate}
          disabled={readOnly}
          onChange={(closeDate) => patch({ closeDate })}
        />
      </div>
    </div>
  );
}
