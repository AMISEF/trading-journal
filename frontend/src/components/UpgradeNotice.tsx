"use client";

/**
 * The panel shown instead of a red error box when the API refuses something
 * because of the subscription plan (the free tier's 20 journals, its single
 * trade analysis, its single coach run, cooldowns, Toobit…).
 *
 * The backend marks those refusals with `[UPGRADE]`; `isUpgradeError()` detects
 * it and `upgradeMessage()` strips it. Everything else stays a normal error.
 */
import Link from "next/link";
import { SUBSCRIPTION_PATH, upgradeMessage } from "@/lib/plans";

export function UpgradeNotice({
  message,
  compact = false,
}: {
  message: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-amber-400/40 bg-gradient-to-l from-amber-400/10 to-violet-500/10 ${
        compact ? "px-3 py-2.5" : "px-4 py-3.5"
      } space-y-2.5`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-base">✨</span>
        <p className={`${compact ? "text-xs" : "text-sm"} leading-relaxed text-foreground/90`}>
          {upgradeMessage(message)}
        </p>
      </div>
      <Link
        href={SUBSCRIPTION_PATH}
        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-amber-500 to-violet-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-violet-600/20 transition hover:-translate-y-0.5"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
        خرید اشتراک
      </Link>
    </div>
  );
}
