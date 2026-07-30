"use client";

/**
 * Inline SVG marks for the supported exchanges.
 *
 * Self-contained (no network requests, no image assets) so the settings page
 * and the journal list render instantly and work offline. Each mark is drawn
 * with the exchange's official palette:
 *
 *   Toobit  blue on a blue-tinted plate
 *   LBank   yellow on black  (official yellow/black identity)
 *   XT.COM  green on a green-tinted plate
 *   Ourbit  purple on a purple-tinted plate
 *   WEEX    yellow on black  (official yellow/black identity)
 *
 * The marks are decorative — `aria-hidden` — the label is always next to them.
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
  const dark = brand.darkPlate;
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 48 48",
    className,
    "aria-hidden": true as const,
    focusable: "false" as const,
  };

  // Yellow/black brands get a solid black plate (that IS their identity);
  // the others get a soft tint of their own colour.
  const plate = dark ? (
    <>
      <rect x="0" y="0" width="48" height="48" rx="12" fill={brand.ink} />
      <rect
        x="0.75"
        y="0.75"
        width="46.5"
        height="46.5"
        rx="11.25"
        fill="none"
        stroke={c}
        strokeOpacity="0.9"
        strokeWidth="1.5"
      />
    </>
  ) : (
    <>
      <rect x="0" y="0" width="48" height="48" rx="12" fill={c} opacity="0.14" />
      <rect
        x="0.75"
        y="0.75"
        width="46.5"
        height="46.5"
        rx="11.25"
        fill="none"
        stroke={c}
        strokeOpacity="0.5"
        strokeWidth="1.5"
      />
    </>
  );

  switch (key) {
    case "toobit":
      // Bold "T" with the rising candle of the Toobit mark — blue identity.
      return (
        <svg {...common}>
          {plate}
          <path d="M12 15h20" stroke={c} strokeWidth="3.6" strokeLinecap="round" />
          <path d="M22 15v19" stroke={c} strokeWidth="3.6" strokeLinecap="round" />
          <rect x="30" y="21" width="5.4" height="13" rx="1.8" fill={c} />
          <path d="M32.7 17.5v3.5M32.7 34v3.2" stroke={c} strokeWidth="2.1" strokeLinecap="round" />
        </svg>
      );
    case "lbank":
      // "L" + ledger bars, yellow on black.
      return (
        <svg {...common}>
          {plate}
          <path
            d="M13 12.5v22.5h9.5"
            stroke={c}
            strokeWidth="3.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <rect x="26" y="22" width="3.6" height="13" rx="1.4" fill={c} />
          <rect x="32.5" y="17" width="3.6" height="18" rx="1.4" fill={c} opacity="0.8" />
        </svg>
      );
    case "xt":
      // Interlocked "X" + "T" — XT green.
      return (
        <svg {...common}>
          {plate}
          <path d="M11.5 14l11.5 20M23 14L11.5 34" stroke={c} strokeWidth="3.6" strokeLinecap="round" />
          <path d="M26.5 14h11M32 14v20" stroke={c} strokeWidth="3.6" strokeLinecap="round" />
        </svg>
      );
    case "ourbit":
      // "O" ring with an orbiting dot — Ourbit purple.
      return (
        <svg {...common}>
          {plate}
          <circle cx="21.5" cy="24.5" r="9" fill="none" stroke={c} strokeWidth="3.6" />
          <circle cx="34" cy="15.5" r="3.8" fill={c} />
          <path d="M28.5 18.5l2.8 -2" stroke={c} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        </svg>
      );
    case "weex":
      // "W" stroke with a rising tail, yellow on black.
      return (
        <svg {...common}>
          {plate}
          <path
            d="M10.5 14.5l4.6 19.5L21.8 22l6.7 12L33 14.5"
            fill="none"
            stroke={c}
            strokeWidth="3.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M35 22.5l3.2 -3.2v7"
            fill="none"
            stroke={c}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.85"
          />
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
      style={
        brand.darkPlate
          ? {
              color: brand.hex,
              background: brand.ink,
              border: `1px solid rgba(${brand.tint},0.9)`,
            }
          : {
              color: brand.hex,
              background: `rgba(${brand.tint},0.14)`,
              border: `1px solid rgba(${brand.tint},0.5)`,
            }
      }
      title={`این معامله از صرافی ${brand.label} همگام‌سازی شده است`}
    >
      {brand.label}
    </span>
  );
}
