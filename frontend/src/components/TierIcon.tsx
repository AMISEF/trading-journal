"use client";

/**
 * Plan emblems.
 *
 * الماسی keeps its faceted gem (DiamondIcon); the three metal tiers get a
 * struck medallion. Both are drawn the same way — separate shapes with their
 * own gradients — so a light source from the top-left reads as depth instead of
 * a flat sticker at 40px.
 *
 * `id` must be unique per rendered instance: SVG gradient ids are global, so two
 * medals sharing an id would render with one palette.
 */
import { DiamondIcon } from "@/components/DiamondIcon";
import type { Tier } from "@/lib/plans";

/** light → dark ramp for each metal, plus the glow colour under the medal. */
const METAL: Record<
  "bronze" | "silver" | "gold",
  { hi: string; mid: string; low: string; deep: string; glow: string }
> = {
  gold: { hi: "#FFFDF0", mid: "#FDE68A", low: "#F59E0B", deep: "#92400E", glow: "251,191,36" },
  silver: { hi: "#FFFFFF", mid: "#E2E8F0", low: "#94A3B8", deep: "#475569", glow: "148,163,184" },
  bronze: { hi: "#FFE9D6", mid: "#FDBA74", low: "#EA7B1C", deep: "#7C2D12", glow: "251,146,60" },
};

function MedalIcon({
  metal,
  size = 44,
  id = "medal",
  className,
  animate = true,
}: {
  metal: "bronze" | "silver" | "gold";
  size?: number;
  id?: string;
  className?: string;
  animate?: boolean;
}) {
  const c = METAL[metal];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      style={animate ? { filter: `drop-shadow(0 6px 16px rgba(${c.glow},0.45))` } : undefined}
      aria-hidden
    >
      <defs>
        {/* Outer rim: bright at the top-left, shadowed at the bottom-right */}
        <linearGradient id={`${id}-rim`} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor={c.hi} />
          <stop offset="45%" stopColor={c.mid} />
          <stop offset="100%" stopColor={c.deep} />
        </linearGradient>
        {/* Face: recessed, so the ramp runs the other way */}
        <linearGradient id={`${id}-face`} x1="0.85" y1="0" x2="0.15" y2="1">
          <stop offset="0%" stopColor={c.mid} />
          <stop offset="60%" stopColor={c.low} />
          <stop offset="100%" stopColor={c.deep} />
        </linearGradient>
        {/* Raised star */}
        <linearGradient id={`${id}-star`} x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor={c.hi} />
          <stop offset="100%" stopColor={c.low} />
        </linearGradient>
        {/* Specular sweep across the upper half */}
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Ribbon tails, tucked behind the medal */}
      <path d="M22 6l7 15-9-2-4 6-2-19z" fill={c.deep} opacity="0.9" />
      <path d="M42 6l-7 15 9-2 4 6 2-19z" fill={c.low} opacity="0.85" />

      {/* Medal body */}
      <circle cx="32" cy="38" r="20" fill={`url(#${id}-rim)`} />
      <circle cx="32" cy="38" r="15" fill={`url(#${id}-face)`} />
      <circle
        cx="32"
        cy="38"
        r="15"
        fill="none"
        stroke={c.hi}
        strokeOpacity="0.55"
        strokeWidth="0.9"
      />

      {/* Struck star */}
      <path
        d="M32 28.5l3.1 6.5 7 .9-5.1 4.8 1.3 6.9-6.3-3.4-6.3 3.4 1.3-6.9-5.1-4.8 7-.9z"
        fill={`url(#${id}-star)`}
      />

      {/* Highlight sweep */}
      <path d="M17 30a20 20 0 0 1 26-8 20 20 0 0 0-26 8z" fill={`url(#${id}-shine)`} />
      <circle cx="32" cy="38" r="20" fill="none" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="0.8" />

      {animate && (
        <path
          d="M50 13c.35 2.3.8 2.75 3.1 3.1-2.3.35-2.75.8-3.1 3.1-.35-2.3-.8-2.75-3.1-3.1 2.3-.35 2.75-.8 3.1-3.1z"
          fill="#FFFFFF"
        >
          <animate attributeName="opacity" values="0.2;1;0.2" dur="2.8s" repeatCount="indefinite" />
        </path>
      )}
    </svg>
  );
}

export function TierIcon({
  tier,
  size = 44,
  id,
  className,
  animate = true,
}: {
  tier: Tier;
  size?: number;
  id?: string;
  className?: string;
  animate?: boolean;
}) {
  const uid = id ? `${id}-${tier}` : tier;
  if (tier === "diamond") {
    return <DiamondIcon size={size} id={uid} className={className} animate={animate} />;
  }
  return <MedalIcon metal={tier} size={size} id={uid} className={className} animate={animate} />;
}
