"use client";

/**
 * Live calc preview hook.
 * Watches the relevant trade inputs and (debounced) calls POST /calc/preview,
 * returning the per-TP numbers + R:R/P&L for display while editing.
 */
import { useEffect, useState } from "react";
import { calcApi } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import type { Calc, Trade } from "@/lib/types";

export function useCalcPreview(trade: Trade | null, walletBalance: number, skip = false) {
  const [calc, setCalc] = useState<Calc | null>(trade?.calc ?? null);

  // Count entry levels that are active (level 1 always + levels 2+ unless deactivated).
  const nActivatedLevels = trade
    ? Math.max(1, trade.entryLevels.filter((l, i) => i === 0 || l.isActivated !== false).length)
    : 1;

  // Build a stable signature of the inputs that affect the calc.
  const sig = trade
    ? JSON.stringify({
        d: trade.direction,
        e: trade.entryPrice,
        l: trade.leverage,
        m: trade.marginPercent,
        s: trade.stopLoss,
        t: trade.takeProfits,
        x: trade.exitType,
        xp: trade.exitPrice,
        tv: trade.trailExitValue,
        tp: trade.trailIsPercent,
        w: walletBalance,
        n: nActivatedLevels,
      })
    : "";
  const debouncedSig = useDebounced(sig, 500);

  useEffect(() => {
    // Read-only viewers (e.g. the public showcase) must never hit the authed
    // /calc/preview endpoint — just show the server-computed calc on the trade.
    if (skip) {
      setCalc(trade?.calc ?? null);
      return;
    }
    if (!trade) return;
    if (trade.entryPrice == null || trade.leverage == null || trade.marginPercent == null) {
      return;
    }
    let cancelled = false;
    calcApi
      .preview({
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        leverage: trade.leverage,
        marginPercent: trade.marginPercent,
        stopLoss: trade.stopLoss,
        takeProfits: trade.takeProfits,
        exitType: trade.exitType,
        exitPrice: trade.exitPrice,
        trailExitValue: trade.trailExitValue,
        trailIsPercent: trade.trailIsPercent,
        walletBalance,
        nActivatedLevels,
      })
      .then((c) => !cancelled && setCalc(c))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSig, skip]);

  return calc;
}
