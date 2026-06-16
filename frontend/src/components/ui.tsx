"use client";

/**
 * Small shared UI primitives used across the app:
 * Spinner, StatusDot (trade lifecycle), Badge, Button, Paginator.
 */
import { useState } from "react";
import type { ExitType, TradeStatus } from "@/lib/types";
import { faNum } from "@/lib/format";

/** Centered loading spinner. */
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

/**
 * Status circle:
 * PLANNED = grey, OPEN = blue (pulse),
 * CLOSED + RISK_FREE = sky-blue, CLOSED + profit = green, CLOSED + loss = red.
 */
export function StatusDot({
  status,
  pnl,
  exitType,
}: {
  status: TradeStatus;
  pnl?: number | null;
  exitType?: ExitType | null;
}) {
  let color = "bg-muted";
  let pulse = "";
  if (status === "OPEN") {
    color = "bg-primary";
    pulse = "animate-pulse-dot";
  } else if (status === "CLOSED") {
    if (exitType === "NOT_ACTIVATED") {
      color = "bg-gray-400";
    } else if (exitType === "RISK_FREE") {
      color = "bg-sky-400";
    } else {
      color = (pnl ?? 0) >= 0 ? "bg-profit" : "bg-loss";
    }
  }
  const title =
    status === "PLANNED" ? "برنامه‌ریزی‌شده"
    : status === "OPEN" ? "باز"
    : exitType === "NOT_ACTIVATED" ? "فعال نشد"
    : "بسته‌شده";
  return (
    <span
      title={title}
      className={`inline-block h-3 w-3 rounded-full ${color} ${pulse}`}
    />
  );
}

/** Small rounded label. `tone` controls the color. */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "profit" | "loss" | "neutral" | "muted";
}) {
  const map: Record<string, string> = {
    profit: "bg-profit-soft text-profit",
    loss: "bg-loss-soft text-loss",
    neutral: "bg-primary-soft text-primary",
    muted: "bg-surface-2 text-muted",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${map[tone]}`}>
      {children}
    </span>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "profit";
};

/** Themed button. */
export function Button({
  variant = "primary",
  className = "",
  ...props
}: BtnProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary: "bg-primary text-white hover:opacity-90",
    profit: "bg-profit text-white hover:opacity-90",
    danger: "bg-loss text-white hover:opacity-90",
    ghost: "border border-border bg-surface-2 text-text hover:text-primary",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

// ---------------------------------------------------------------------------
// Paginator
// ---------------------------------------------------------------------------

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100];

/** Hook: manage pagination state for an array of items.
 *  Returns the current page's slice plus the <Paginator /> props. */
export function usePagination<T>(items: T[], storageKey?: string) {
  const [pageSize, setPageSizeRaw] = useState<number>(() => {
    if (!storageKey || typeof window === "undefined") return 10;
    // Key is versioned (v2) so stale values from older builds are ignored.
    const v = Number(localStorage.getItem(`tj_pg_${storageKey}_v2`));
    return v > 0 ? v : 10;
  });
  const [page, setPage] = useState(1);

  const setPageSize = (n: number) => {
    const safe = Math.max(1, n);
    setPageSizeRaw(safe);
    setPage(1);
    if (storageKey && typeof window !== "undefined") {
      localStorage.setItem(`tj_pg_${storageKey}_v2`, String(safe));
    }
  };

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);

  return {
    slice,
    page: safePage,
    setPage,
    totalPages,
    pageSize,
    setPageSize,
    total: items.length,
    start,
  };
}

/** Page-size selector + page navigation bar. */
export function Paginator({
  page,
  totalPages,
  pageSize,
  total,
  start,
  setPage,
  setPageSize,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  start: number;
  setPage: (p: number) => void;
  setPageSize: (n: number) => void;
}) {
  const [customDraft, setCustomDraft] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const applyCustom = () => {
    const n = parseInt(customDraft, 10);
    if (n > 0) setPageSize(n);
    setCustomDraft("");
    setShowCustom(false);
  };

  const end = Math.min(start + pageSize, total);

  // Build page numbers: always show first, last, current ±1, and ellipses.
  const pages: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    const near = new Set([1, totalPages, page, page - 1, page + 1].filter((p) => p >= 1 && p <= totalPages));
    let prev = 0;
    for (const p of [...near].sort((a, b) => a - b)) {
      if (p - prev > 1) pages.push("…");
      pages.push(p);
      prev = p;
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-sm">
      {/* Left: items per page + range info */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted">هر صفحه:</span>
        <div className="flex flex-wrap gap-1">
          {PAGE_SIZE_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => { setPageSize(n); setShowCustom(false); }}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                pageSize === n && !showCustom
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface-2 text-text hover:border-primary hover:text-primary"
              }`}
            >
              {faNum(n)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowCustom((v) => !v)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
              showCustom
                ? "border-primary bg-primary text-white"
                : "border-border bg-surface-2 text-text hover:border-primary hover:text-primary"
            }`}
          >
            دلخواه
          </button>
        </div>
        {showCustom && (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              className="tj-input w-20 py-1 text-xs"
              dir="ltr"
              placeholder="تعداد"
              value={customDraft}
              autoFocus
              onChange={(e) => setCustomDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); applyCustom(); }
                if (e.key === "Escape") setShowCustom(false);
              }}
            />
            <button
              type="button"
              onClick={applyCustom}
              className="rounded-lg bg-primary px-2.5 py-1 text-xs text-white"
            >
              اعمال
            </button>
          </div>
        )}
        {total > 0 && (
          <span className="text-muted text-xs">
            نمایش <b className="text-text">{faNum(end - start)}</b> از <b className="text-text">{faNum(total)}</b> مورد
            {totalPages > 1 && (
              <span className="mr-1 text-muted/60">(صفحه {faNum(page)} از {faNum(totalPages)})</span>
            )}
          </span>
        )}
      </div>

      {/* Right: page navigation */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
            className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs disabled:opacity-40 hover:border-primary hover:text-primary"
          >
            ‹ قبلی
          </button>
          {pages.map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="px-1 text-muted">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p as number)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  p === page
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-surface-2 text-text hover:border-primary hover:text-primary"
                }`}
              >
                {faNum(p as number)}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => setPage(page + 1)}
            disabled={page === totalPages}
            className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs disabled:opacity-40 hover:border-primary hover:text-primary"
          >
            بعدی ›
          </button>
        </div>
      )}
    </div>
  );
}
