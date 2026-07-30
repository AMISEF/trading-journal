/**
 * Exchange brand catalogue (single source of truth for the UI).
 *
 * `slug` matches the backend registry (`app/services/exchanges/__init__.py`)
 * and the value stored in `Trade.source`, so a journal row can be coloured and
 * tagged straight from its source field.
 *
 * Colours follow each exchange's official brand guide:
 *   Toobit  -> blue            #0059FB
 *   LBank   -> yellow + black  #FFCC00 / #0B0B0B
 *   XT.COM  -> green           #00C853
 *   Ourbit  -> purple          #7B4DFF
 *   WEEX    -> yellow + black  #D8AE15 / #151515
 *
 * `logo` points at the official artwork the user dropped in `frontend/public`.
 * It is stored WITHOUT the base path; `ExchangeLogo` prefixes `BASE_PATH` so
 * the same file works both on the root domain and under `/journal`.
 *
 * `tint` is the same colour as `hex` but as bare "r,g,b" numbers, so it can be
 * dropped into `rgba(var,alpha)` for soft borders/backgrounds — the pattern the
 * rest of the app already uses for plan colours.
 */

export type ExchangeSlug = "toobit" | "lbank" | "xt" | "ourbit" | "weex";

export interface ExchangeBrand {
  slug: ExchangeSlug;
  label: string;
  /** Primary brand colour. */
  hex: string;
  /** Same colour as "r,g,b" for rgba() composition. */
  tint: string;
  /** Readable text colour on top of a solid `hex` chip. */
  on: string;
  /**
   * Secondary brand colour — the dark half of the identity. Brands whose guide
   * pairs the primary colour with black (LBank, WEEX) get a true black plate so
   * the mark reads exactly like the official logo.
   */
  ink: string;
  /** True when the official identity is "colour on black". */
  darkPlate: boolean;
  /** Official logo file inside `frontend/public` (no base path). */
  logo: string;
  needsPassphrase: boolean;
  docsUrl: string;
  /** Short Persian hint shown under the card. */
  hint: string;
}

export const EXCHANGES: Record<ExchangeSlug, ExchangeBrand> = {
  toobit: {
    slug: "toobit",
    label: "Toobit",
    hex: "#0059FB",
    tint: "0,89,251",
    on: "#ffffff",
    ink: "#04122e",
    darkPlate: false,
    logo: "/toobit.png",
    needsPassphrase: false,
    docsUrl: "https://toobit-docs.github.io/",
    hint: "در پنل توبیت کلید API بسازید و فقط دسترسیِ Read روی Futures را فعال کنید.",
  },
  lbank: {
    slug: "lbank",
    label: "LBank",
    hex: "#FFCC00",
    tint: "255,204,0",
    on: "#0B0B0B",
    ink: "#0B0B0B",
    darkPlate: true,
    logo: "/Lbank.png",
    needsPassphrase: false,
    docsUrl: "https://www.lbank.com/docs/contract.html",
    hint: "در LBank از بخش API Management کلید بسازید و حتماً نوعِ امضا را HmacSHA256 انتخاب کنید.",
  },
  xt: {
    slug: "xt",
    label: "XT.COM",
    hex: "#00C853",
    tint: "0,200,83",
    on: "#04180d",
    ink: "#04180d",
    darkPlate: false,
    logo: "/XT.webp",
    needsPassphrase: false,
    docsUrl: "https://doc.xt.com/",
    hint: "در XT کلیدِ Futures بسازید؛ دسترسیِ فقط‌خواندنی کافی است.",
  },
  ourbit: {
    slug: "ourbit",
    label: "Ourbit",
    hex: "#7B4DFF",
    tint: "123,77,255",
    on: "#ffffff",
    ink: "#160a33",
    darkPlate: false,
    logo: "/ourbit.png",
    needsPassphrase: false,
    docsUrl: "https://www.ourbit.com/",
    hint: "در Ourbit از بخش API کلید بسازید و دسترسیِ Futures Read را فعال کنید.",
  },
  weex: {
    slug: "weex",
    label: "WEEX",
    hex: "#D8AE15",
    tint: "216,174,21",
    on: "#151515",
    ink: "#151515",
    darkPlate: true,
    logo: "/weex.png",
    needsPassphrase: true,
    docsUrl: "https://www.weex.com/api-doc/contract/intro",
    hint: "WEEX علاوه بر API Key و Secret، یک Passphrase هم می‌دهد که وارد کردنِ آن الزامی است.",
  },
};

export const EXCHANGE_ORDER: ExchangeSlug[] = [
  "toobit",
  "lbank",
  "xt",
  "ourbit",
  "weex",
];

/** Brand for a `Trade.source` value — null for "manual" or anything unknown. */
export function brandOf(source?: string | null): ExchangeBrand | null {
  const key = (source || "").trim().toLowerCase();
  if (!key || key === "manual") return null;
  return (EXCHANGES as Record<string, ExchangeBrand>)[key] ?? null;
}
