"use client";

/**
 * Exchange logos.
 *
 * The official artwork lives in `frontend/public` (toobit.png, Lbank.png,
 * XT.webp, ourbit.png, weex.png) and is rendered here inside a CIRCULAR badge
 * drawn in the exchange's own brand colour, so all five look consistent no
 * matter what shape/padding the source file has:
 *
 *   Toobit  blue circle          #0059FB
 *   LBank   yellow on black      #FFCC00 / #0B0B0B
 *   XT.COM  green circle         #00C853
 *   Ourbit  purple circle        #7B4DFF
 *   WEEX    yellow on black      #D8AE15 / #151515
 *
 * Performance notes:
 *  - every file is tiny (1.6–24 KB) and is rendered at its real display size,
 *  - `loading="lazy"` + `decoding="async"` keep them off the critical path,
 *  - `next/image` is used the same way as the app logo so the `/journal`
 *    base path is applied automatically (images are `unoptimized` in
 *    next.config.js, so the raw file is served — no optimizer round-trip),
 *  - if a file is ever missing the component falls back to a vector mark, so
 *    the UI never shows a broken image.
 */
import Image from "next/image";
import { useState } from "react";
import { EXCHANGES, type ExchangeSlug } from "@/lib/exchanges";
import { BASE_PATH } from "@/lib/api";

interface Props {
  slug: ExchangeSlug | string;
  size?: number;
  className?: string;
}

export function ExchangeLogo({ slug, size = 34, className = "" }: Props) {
  const key = (slug || "").toLowerCase() as ExchangeSlug;
  const brand = EXCHANGES[key];
  const [broken, setBroken] = useState(false);
  if (!brand) return null;

  // Inside a circle the usable area is smaller than in a square, so the
  // artwork is inset a little more to keep it clear of the ring.
  const inner = Math.round(size * 0.62);

  return (
    <span
      className={`inline-grid shrink-0 place-items-center overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: "9999px",
        background: brand.darkPlate ? brand.ink : `rgba(${brand.tint},0.14)`,
        border: `1px solid rgba(${brand.tint},${brand.darkPlate ? 0.9 : 0.5})`,
        boxShadow: `0 0 0 1px rgba(${brand.tint},0.12), 0 2px 8px rgba(${brand.tint},0.18)`,
      }}
      title={brand.label}
    >
      {broken ? (
        <ExchangeGlyph slug={key} size={size} />
      ) : (
        <Image
          src={`${BASE_PATH}${brand.logo}`}
          alt={`${brand.label} logo`}
          width={inner}
          height={inner}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          style={{
            width: inner,
            height: inner,
            objectFit: "contain",
            borderRadius: "9999px",
          }}
        />
      )}
    </span>
  );
}

/**
 * Vector fallback — a lightweight monogram in the brand colour, used only when
 * the logo file cannot be loaded.
 */
export function ExchangeGlyph({
  slug,
  size = 34,
}: {
  slug: ExchangeSlug | string;
  size?: number;
}) {
  const key = (slug || "").toLowerCase() as ExchangeSlug;
  const brand = EXCHANGES[key];
  if (!brand) return null;
  const c = brand.hex;
  const common = {
    width: Math.round(size * 0.62),
    height: Math.round(size * 0.62),
    viewBox: "0 0 48 48",
    "aria-hidden": true as const,
    focusable: "false" as const,
  };

  switch (key) {
    case "toobit":
      return (
        <svg {...common}>
          <path d="M8 12h24" stroke={c} strokeWidth="4.2" strokeLinecap="round" />
          <path d="M20 12v24" stroke={c} strokeWidth="4.2" strokeLinecap="round" />
          <rect x="31" y="19" width="6" height="15" rx="2" fill={c} />
        </svg>
      );
    case "lbank":
      return (
        <svg {...common}>
          <path d="M11 10v26h11" stroke={c} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x="27" y="20" width="4" height="16" rx="1.6" fill={c} />
          <rect x="34" y="14" width="4" height="22" rx="1.6" fill={c} opacity="0.8" />
        </svg>
      );
    case "xt":
      return (
        <svg {...common}>
          <path d="M9 12l13 24M22 12L9 36" stroke={c} strokeWidth="4.2" strokeLinecap="round" />
          <path d="M26 12h13M32.5 12v24" stroke={c} strokeWidth="4.2" strokeLinecap="round" />
        </svg>
      );
    case "ourbit":
      return (
        <svg {...common}>
          <circle cx="21" cy="25" r="11" fill="none" stroke={c} strokeWidth="4.2" />
          <circle cx="36" cy="13" r="4.5" fill={c} />
        </svg>
      );
    case "weex":
      return (
        <svg {...common}>
          <path
            d="M8 12l5.5 24L22 21l8.5 15L36 12"
            fill="none"
            stroke={c}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
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
  withLogo = false,
}: {
  slug: ExchangeSlug | string;
  className?: string;
  /** Show the tiny official logo inside the chip as well. */
  withLogo?: boolean;
}) {
  const key = (slug || "").toLowerCase() as ExchangeSlug;
  const brand = EXCHANGES[key];
  if (!brand) return null;
  return (
    <span
      dir="ltr"
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none ${className}`}
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
      {withLogo && (
        <Image
          src={`${BASE_PATH}${brand.logo}`}
          alt=""
          width={12}
          height={12}
          loading="lazy"
          decoding="async"
          style={{ width: 12, height: 12, objectFit: "contain", borderRadius: "9999px" }}
        />
      )}
      {brand.label}
    </span>
  );
}
