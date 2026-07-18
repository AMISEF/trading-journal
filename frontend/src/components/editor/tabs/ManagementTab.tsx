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
import { faNum, formatSignedUsd, formatRatio, pnlColorClass } from "@/lib/format";
import type { ExitType, TakeProfit } from "@/lib/types";
import { deriveActivatedEntry } from "./EssentialsTab";

// Maps an exit-zone selection to an exitType + closes the trade.
const BASE_EXIT_OPTIONS: { value: string; label: string; exitType: ExitType }[] = [
  { value: "RISK_FREE", label: "ریسک‌فری شد", exitType: "RISK_FREE" },
  { value: "LAST_TP", label: "آخرین تارگت (TP)", exitType: "LAST_TP" },
  { value: "STOP_LOSS", label: "استاپ لاس", exitType: "STOP_LOSS" },
  { value: "TRAILING_STOP", label: "تریل استاپ", exitType: "TRAILING_STOP" },
  { value: "NOT_ACTIVATED", label: "معامله فعال نشد", exitType: "NOT_ACTIVATED" },
];

export function ManagementTab({ readOnly = false }: { readOnly?: boolean }) {
  const trade = useTrade((s) => s.trade);
  const patch = useTrade((s) => s.patch);
  const user = useAuth((s) => s.user);

  // Margin is always derived from the trade's fixed balance snapshot (captured
  // when it was recorded). For a brand-new trade with no snapshot yet, fall back
  // to the current wallet balance. In readOnly (admin viewer) we never want the
  // admin's balance to leak in, so we use trade.calc which the backend already
  // computed from the owner's snapshot.
  const previewBalance = trade?.balanceSnapshot ?? user?.currentBalance ?? 1000;
  const liveCalc = useCalcPreview(trade, readOnly ? 0 : previewBalance, readOnly);
  const calc = readOnly ? (trade?.calc ?? null) : liveCalc;

  if (!trade) return null;

  const levels = trade.entryLevels ?? [];

  const toggleLevelActivation = (levelIndex: number, activated: boolean) => {
    if (readOnly) return;
    const newLevels = levels.map((l, idx) =>
      idx === levelIndex ? { ...l, isActivated: activated } : l
    );
    const reordered = newLevels.map((l, i) => ({ ...l, order: i + 1 }));
    const { avgEntry, totalPct } = deriveActivatedEntry(reordered);
    patch({
      entryLevels: reordered,
      entryPrice: avgEntry,
      marginPercent: totalPct > 0 ? Math.round(totalPct * 100) / 100 : null,
    });
  };

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

  // Margin in dollars = balance snapshot × margin%. In readOnly we use the
  // backend-computed calc.margin (owner's snapshot); otherwise derive from the
  // trade's own snapshot so it stays fixed regardless of the live balance.
  const marginDollar = readOnly
    ? (trade.calc?.margin ?? null)
    : trade.marginPercent && previewBalance
    ? (trade.marginPercent / 100) * previewBalance
    : null;

  const lossDollarDirect =
    marginDollar && lossPct != null ? (lossPct / 100) * marginDollar : null;
  const lossDollar = (calc && calc.risk1r !== 0) ? -Math.abs(calc.risk1r) : lossDollarDirect != null ? -Math.abs(lossDollarDirect) : null;

  // Build exit options including individual TPs. Each TP carries its own price
  // so that "close the remainder at the TP2 level" books the leftover at that
  // exact price (via exitPrice) instead of the last target.
  const tpExitOptions = trade.takeProfits.map((tp) => ({
    value: `TP${tp.order}`,
    label: `تارگت TP${tp.order}${tp.price != null ? ` (${tp.price})` : ""}`,
    exitType: "LAST_TP" as ExitType,
    exitPrice: tp.price ?? null,
  }));
  const EXIT_OPTIONS: {
    value: string;
    label: string;
    exitType: ExitType;
    exitPrice?: number | null;
  }[] = [...BASE_EXIT_OPTIONS, ...tpExitOptions];

  const onExitZone = (value: string) => {
    if (readOnly || !value) return;
    const opt = EXIT_OPTIONS.find((o) => o.value === value);
    if (!opt) return;
    // Specific-TP exits pin the remainder to that TP price; every other exit
    // type derives its price in the calc engine, so we clear exitPrice for them.
    patch({
      exitType: opt.exitType,
      exitPrice: value.startsWith("TP") ? opt.exitPrice ?? null : null,
      status: "CLOSED",
      closeDate: trade.closeDate || new Date().toISOString(),
    });
  };

  // The <select> value can't be derived from exitType alone, because a specific
  // TP exit also uses exitType="LAST_TP". When exitPrice matches a TP we show
  // that TP option; otherwise we fall back to the plain exit type.
  const currentExitValue = (() => {
    if (!trade.exitType) return "";
    if (trade.exitPrice != null) {
      const tpMatch = tpExitOptions.find((o) => o.exitPrice === trade.exitPrice);
      if (tpMatch) return tpMatch.value;
    }
    return trade.exitType;
  })();

  return (
    <div className="space-y-6">
      {/* Entry level activation — shown only for multi-level trades */}
      {levels.length > 1 && (
        <div>
          <label className="tj-label">فعال‌سازی پله‌های ورود</label>
          <div className="space-y-2">
            {levels.slice(1).map((level, i) => {
              const levelIndex = i + 1;
              const activated = level.isActivated !== false;
              return (
                <div key={levelIndex} className="tj-card p-3 flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <span className="font-medium">پله {faNum(levelIndex + 1)}</span>
                    {level.price != null && (
                      <span dir="ltr" className="text-muted mx-2">{level.price}</span>
                    )}
                    {level.marginPercent != null && (
                      <span className="text-muted">({faNum(level.marginPercent)}%)</span>
                    )}
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-primary"
                      disabled={readOnly}
                      checked={activated}
                      onChange={(e) => toggleLevelActivation(levelIndex, e.target.checked)}
                    />
                    <span className={`text-sm ${activated ? "text-profit" : "text-muted"}`}>
                      {activated ? "فعال شد" : "فعال نشد"}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
        <div className="mb-2 text-sm font-medium">حد ضرر (ریسک ۱R)</div>
        <div className="grid grid-cols-4 gap-3 text-sm text-right">
          <div>
            <div className="text-xs text-muted mb-0.5">قیمت</div>
            <div className="font-medium" dir="ltr">{trade.stopLoss ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted mb-0.5">درصد موضع</div>
            <div className="text-loss" dir="ltr">{lossPct != null ? `${lossPct.toFixed(2)}%` : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted mb-0.5">دلار</div>
            <div className="text-loss" dir="ltr">{formatSignedUsd(lossDollar)}</div>
          </div>
          <div>
            <div className="text-xs text-muted mb-0.5">% سرمایه</div>
            <div className="text-loss" dir="ltr">
              {calc && calc.risk1r && previewBalance
                ? `${((calc.risk1r / previewBalance) * 100).toFixed(2)}%`
                : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Trade result — shown when trade is closed */}
      {trade.exitType && trade.exitType !== "NOT_ACTIVATED" && (
        <div className="tj-card p-4">
          <div className="mb-2 text-sm font-medium">نتیجه معامله</div>
          <div className="grid grid-cols-3 gap-3 text-sm text-right">
            <div>
              <div className="text-xs text-muted mb-0.5">سود / زیان</div>
              <div className={`font-bold ${pnlColorClass(calc?.realizedPnl)}`} dir="ltr">
                {formatSignedUsd(calc?.realizedPnl ?? null)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted mb-0.5">% مارجین</div>
              <div className={pnlColorClass(calc?.resultPct)} dir="ltr">
                {calc?.resultPct != null ? `${calc.resultPct.toFixed(2)}%` : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted mb-0.5">% سرمایه</div>
              <div className={`font-bold ${pnlColorClass(calc?.capitalPct)}`} dir="ltr">
                {calc?.capitalPct != null ? `${calc.capitalPct.toFixed(2)}%` : "—"}
              </div>
            </div>
          </div>
          {calc?.rrAchieved != null && (
            <div className="mt-2 text-xs text-muted">
              R:R کسب‌شده:{" "}
              <span className={`font-semibold ${pnlColorClass(calc.rrAchieved)}`} dir="ltr">
                {formatRatio(calc.rrAchieved)}
              </span>
            </div>
          )}
        </div>
      )}

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
              {EXIT_OPTIONS.find((o) => o.value === currentExitValue)?.label}
            </span>
          ) : undefined
        }
      >
        <select
          className="tj-input"
          disabled={readOnly}
          value={currentExitValue}
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
        <div className="tj-card p-4 space-y-4">
          <div className="text-sm font-medium">نوع تریل استاپ</div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                checked={!trade.trailIsPercent}
                disabled={readOnly}
                onChange={() => patch({ trailIsPercent: false })}
              />
              قیمت خروج
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                checked={!!trade.trailIsPercent}
                disabled={readOnly}
                onChange={() => patch({ trailIsPercent: true })}
              />
              درصد از ورود
            </label>
          </div>
          <Field label={trade.trailIsPercent ? "درصد تریل (از قیمت ورود)" : "قیمت خروج تریل استاپ"}>
            <NumberInput
              value={trade.trailExitValue}
              disabled={readOnly}
              onChange={(trailExitValue) => patch({ trailExitValue })}
              placeholder={trade.trailIsPercent ? "مثلاً: 2.5" : "قیمت"}
            />
          </Field>
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
