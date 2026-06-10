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

export function useCalcPreview(trade: Trade | null, walletBalance: number) {
  const [calc, setCalc] = useState<Calc | null>(trade?.calc ?? null);

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
        tv: trade.trailExitValue,
        tp: trade.trailIsPercent,
        w: walletBalance,
      })
    : "";
  const debouncedSig = useDebounced(sig, 500);

  useEffect(() => {
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
        trailExitValue: trade.trailExitValue,
        trailIsPercent: trade.trailIsPercent,
        walletBalance,
      })
      .then((c) => !cancelled && setCalc(c))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSig]);

  return calc;
}
