"use client";

/**
 * Faceted 3D diamond used by the الماسی plan.
 *
 * Drawn as separate facet polygons rather than one outline: each facet carries
 * its own gradient, so the crown catches light from the top-left while the
 * pavilion falls into shadow — that contrast is what reads as "3D" at 40px.
 * `id` must be unique per rendered instance, otherwise two diamonds on the same
 * page share (and fight over) the same SVG gradient definitions.
 */
export function DiamondIcon({
  size = 44,
  id = "dia",
  className,
  animate = true,
}: {
  size?: number;
  id?: string;
  className?: string;
  animate?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      style={animate ? { filter: "drop-shadow(0 6px 18px rgba(103,232,249,0.45))" } : undefined}
      aria-hidden
    >
      <defs>
        {/* Crown: brightest, lit from the top-left */}
        <linearGradient id={`${id}-crown-l`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#C8F7FF" />
          <stop offset="100%" stopColor="#67E8F9" />
        </linearGradient>
        <linearGradient id={`${id}-crown-r`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A5F3FC" />
          <stop offset="100%" stopColor="#22B8CF" />
        </linearGradient>
        {/* Table (top face) */}
        <linearGradient id={`${id}-table`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#8EEBFA" />
        </linearGradient>
        {/* Pavilion: the deep body, darker toward the culet */}
        <linearGradient id={`${id}-pav-l`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#7DD3FC" />
          <stop offset="100%" stopColor="#0E7490" />
        </linearGradient>
        <linearGradient id={`${id}-pav-c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E0FBFF" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
        <linearGradient id={`${id}-pav-r`} x1="1" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#075985" />
        </linearGradient>
      </defs>

      {/* ── Crown (upper band) ── */}
      <polygon points="20,14 32,14 26,24" fill={`url(#${id}-crown-l)`} />
      <polygon points="32,14 44,14 38,24" fill={`url(#${id}-crown-r)`} />
      <polygon points="8,24 20,14 26,24" fill={`url(#${id}-crown-r)`} opacity="0.85" />
      <polygon points="44,14 56,24 38,24" fill={`url(#${id}-crown-l)`} opacity="0.7" />
      <polygon points="26,24 32,14 38,24" fill={`url(#${id}-table)`} />

      {/* ── Pavilion (lower cone) ── */}
      <polygon points="8,24 26,24 32,54" fill={`url(#${id}-pav-l)`} />
      <polygon points="26,24 38,24 32,54" fill={`url(#${id}-pav-c)`} />
      <polygon points="38,24 56,24 32,54" fill={`url(#${id}-pav-r)`} />

      {/* Girdle highlight + facet seams */}
      <path d="M8 24h48" stroke="#FFFFFF" strokeOpacity="0.75" strokeWidth="1.1" />
      <path
        d="M20 14h24M26 24 32 14l6 10M26 24 32 54l6-30"
        stroke="#FFFFFF"
        strokeOpacity="0.35"
        strokeWidth="0.8"
      />

      {/* Sparkle */}
      {animate && (
        <g opacity="0.9">
          <path
            d="M48 8.5c.4 2.6.9 3.1 3.5 3.5-2.6.4-3.1.9-3.5 3.5-.4-2.6-.9-3.1-3.5-3.5 2.6-.4 3.1-.9 3.5-3.5z"
            fill="#FFFFFF"
          >
            <animate
              attributeName="opacity"
              values="0.2;1;0.2"
              dur="2.6s"
              repeatCount="indefinite"
            />
          </path>
        </g>
      )}
    </svg>
  );
}
