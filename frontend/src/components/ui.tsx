"use client";

/**
 * Small shared UI primitives used across the app:
 * Spinner, StatusDot (trade lifecycle), Badge, Button.
 */
import type { ExitType, TradeStatus } from "@/lib/types";

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
