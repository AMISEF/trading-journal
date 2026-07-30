/**
 * Exchange brand catalogue (single source of truth for the UI).
 *
 * `slug` matches the backend registry (`app/services/exchanges/__init__.py`)
 * and the value stored in `Trade.source`, so a journal row can be coloured and
 * tagged straight from its source field.
 *
 * `tint` is the same colour as `hex` but as bare "r,g,b" numbers, so it can be
 * dropped into `rgba(var,alpha)` for soft borders/backgrounds — the pattern the
 * rest of the app already uses for plan colours.
 */

export type ExchangeSlug = "toobit" | "lbank" | "xt" | "ourbit" | "weex";

export interface ExchangeBrand {
  slug: ExchangeSlug;
  label: string;
  /** Brand colour. */
  hex: string;
  /** Same colour as "r,g,b" for rgba() composition. */
  tint: string;
  /** Readable text colour on top of a solid `hex` chip. */
  on: string;
  needsPassphrase: boolean;
  docsUrl: string;
  /** Short Persian hint shown under the card. */
  hint: string;
}

export const EXCHANGES: Record<ExchangeSlug, ExchangeBrand> = {
  toobit: {
    slug: "toobit",
    label: "Toobit",
    hex: "#F5C542",
    tint: "245,197,66",
    on: "#1a1400",
    needsPassphrase: false,
    docsUrl: "https://toobit-docs.github.io/",
    hint: "در پنل توبیت کلید API بسازید و فقط دسترسیِ Read روی Futures را فعال کنید.",
  },
  lbank: {
    slug: "lbank",
    label: "LBank",
    hex: "#00C8B4",
    tint: "0,200,180",
    on: "#00201d",
    needsPassphrase: false,
    docsUrl: "https://www.lbank.com/docs/contract.html",
    hint: "در LBank از بخش API Management کلید بسازید و حتماً نوعِ امضا را HmacSHA256 انتخاب کنید.",
  },
  xt: {
    slug: "xt",
    label: "XT.COM",
    hex: "#0052FF",
    tint: "0,82,255",
    on: "#ffffff",
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
    needsPassphrase: false,
    docsUrl: "https://www.ourbit.com/",
    hint: "در Ourbit از بخش API کلید بسازید و دسترسیِ Futures Read را فعال کنید.",
  },
  weex: {
    slug: "weex",
    label: "WEEX",
    hex: "#00E0A1",
    tint: "0,224,161",
    on: "#00231a",
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
