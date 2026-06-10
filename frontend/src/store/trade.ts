/**
 * Trade editor store (Zustand) with debounced auto-save.
 *
 * Flow:
 *  - load(id): fetch the trade once and seed local state.
 *  - patch(fields): merge fields into local state immediately (snappy UI),
 *    then schedule a debounced PATCH /trades/{id} (~800ms).
 *  - saveNow(): flush any pending change right away ("ذخیره ژورنال" button).
 *
 * `saveStatus` drives the auto-save indicator in the editor header.
 */
"use client";

import { create } from "zustand";
import { tradesApi } from "@/lib/api";
import type { Trade, TradePatch } from "@/lib/types";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 800;

/** Ensure array fields are never null/undefined (backend may return null). */
function normalizeTrade(t: Trade): Trade {
  return {
    ...t,
    tags: t.tags ?? [],
    entryReasons: t.entryReasons ?? [],
    exitReasons: t.exitReasons ?? [],
    takeProfits: t.takeProfits ?? [],
    emotions: t.emotions ?? {},
    checklistTicks: t.checklistTicks ?? {},
  };
}

interface TradeState {
  trade: Trade | null;
  loading: boolean;
  saveStatus: SaveStatus;
  /** Accumulated unsaved changes waiting to be flushed. */
  pending: TradePatch;
  // internals
  _timer: ReturnType<typeof setTimeout> | null;

  load: (id: string) => Promise<void>;
  /** Merge fields locally and schedule a debounced save. */
  patch: (fields: TradePatch) => void;
  /** Flush pending changes immediately. */
  saveNow: () => Promise<void>;
  /** Replace the trade object (e.g. after a server response). */
  setTrade: (trade: Trade) => void;
  reset: () => void;
}

export const useTrade = create<TradeState>((set, get) => ({
  trade: null,
  loading: true,
  saveStatus: "idle",
  pending: {},
  _timer: null,

  load: async (id) => {
    set({ loading: true, saveStatus: "idle", pending: {} });
    try {
      const trade = normalizeTrade(await tradesApi.get(id));
      set({ trade, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  setTrade: (trade) => set({ trade }),

  patch: (fields) => {
    const { trade, _timer } = get();
    if (!trade) return;

    // Optimistically merge into local state for an instant UI update.
    set({
      trade: { ...trade, ...fields } as Trade,
      pending: { ...get().pending, ...fields },
    });

    // Debounce the network save.
    if (_timer) clearTimeout(_timer);
    const timer = setTimeout(() => {
      void get().saveNow();
    }, DEBOUNCE_MS);
    set({ _timer: timer });
  },

  saveNow: async () => {
    const { trade, pending, _timer } = get();
    if (!trade) return;
    if (_timer) {
      clearTimeout(_timer);
      set({ _timer: null });
    }
    if (Object.keys(pending).length === 0) return;

    set({ saveStatus: "saving" });
    try {
      const updated = normalizeTrade(await tradesApi.update(trade.id, pending));
      set({
        trade: { ...updated, ...get().pending } as Trade,
        pending: {},
        saveStatus: "saved",
      });
      // Reset the indicator back to idle after a short moment.
      setTimeout(() => {
        if (get().saveStatus === "saved") set({ saveStatus: "idle" });
      }, 1500);
    } catch {
      set({ saveStatus: "error" });
    }
  },

  reset: () => {
    const { _timer } = get();
    if (_timer) clearTimeout(_timer);
    set({ trade: null, loading: true, saveStatus: "idle", pending: {}, _timer: null });
  },
}));
