"use client";

/**
 * Inline SVG marks for the supported exchanges.
 *
 * Self-contained (no network requests, no image assets) so the settings page
 * and the journal list render instantly and work offline. Each mark is drawn in
 * the exchange's own brand colour and is purely decorative — `aria-hidden`.
 */
import { EXCHANGES, type ExchangeSlug } from "@/lib/exchanges";

interface Props {
  slug: ExchangeSlug | string;
  size?: number;
  className?: string;
}

export function ExchangeLogo({ slug, size = 34, className = "" }: Props) {
  const key = (slug || "").toLowerCase() as ExchangeSlug;
  const brand = EXCHANGES[key];
  if (!brand) return null;
  const c = brand.hex;
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 48 48",
    className,
    "aria-hidden": true as const,
    focusable: "false" as const,
  };

  // A soft brand-tinted rounded square behind every mark keeps the row visually
  // consistent even though the marks themselves differ a lot in shape.
  const plate = (
    <>
      <rect x="0" y="0" width="48" height="48" rx="12" fill={c} opacity="0.12" />
      <rect x="0.75" y="0.75" width="46.5" height="46.5" rx="11.25" fill="none" stroke={c} strokeOpacity="0.45" strokeWidth="1.5" />
    </>
  );

  switch (key) {
    case "toobit":
      // Stylised "T" over a rising candle.
      return (
        <svg {...common}>
          {plate}
          <path d="M13 15h22" stroke={c} strokeWidth="3.4" strokeLinecap="round" />
          <path d="M24 15v19" stroke={c} strokeWidth="3.4" strokeLinecap="round" />
          <rect x="30" y="22" width="5" height="12" rx="1.6" fill={c} opacity="0.85" />
          <path d="M32.5 19v3.5M32.5 34v3" stroke={c} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "lbank":
      // "L" + bank pillars.
      return (
        <svg {...common}>
          {plate}
          <path d="M14 13v21h9" stroke={c} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x="27" y="20" width="3.2" height="14" rx="1.2" fill={c} />
          <rect x="33" y="16" width="3.2" height="18" rx="1.2" fill={c} opacity="0.75" />
        </svg>
      );
    case "xt":
      // Interlocked "X" + "T".
      return (
        <svg {...common}>
          {plate}
          <path d="M12 14l12 20M24 14L12 34" stroke={c} strokeWidth="3.4" strokeLinecap="round" />
          <path d="M27 14h10M32 14v20" stroke={c} strokeWidth="3.4" strokeLinecap="round" />
        </svg>
      );
    case "ourbit":
      // "O" ring with an orbiting dot.
      return (
        <svg {...common}>
          {plate}
          <circle cx="22" cy="24" r="9" fill="none" stroke={c} strokeWidth="3.4" />
          <circle cx="34" cy="16" r="3.6" fill={c} />
        </svg>
      );
    case "weex":
      // "W" stroke with a rising tail.
      return (
        <svg {...common}>
          {plate}
          <path
            d="M11 15l4.5 19L22 22l6.5 12L33 15"
            fill="none"
            stroke={c}
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M35 22l3 -3v7" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
        </svg>
      );
    default:
      return null;
  }
}

/** Small coloured chip with the exchange name — used next to a journal symbol. */
export function ExchangeTag({
  slug,
  className = "",
}: {
  slug: ExchangeSlug | string;
  className?: string;
}) {
  const key = (slug || "").toLowerCase() as ExchangeSlug;
  const brand = EXCHANGES[key];
  if (!brand) return null;
  return (
    <span
      dir="ltr"
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none ${className}`}
      style={{
        color: brand.hex,
        background: `rgba(${brand.tint},0.14)`,
        border: `1px solid rgba(${brand.tint},0.45)`,
      }}
      title={`این معامله از صرافی ${brand.label} همگام‌سازی شده است`}
    >
      {brand.label}
    </span>
  );
}
