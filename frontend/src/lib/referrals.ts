/**
 * دعوت دوستان — shared types + helpers for the referral program.
 *
 * The invite link is always built at runtime from the current origin so it keeps
 * working on every domain the journal is served from (and under the /journal
 * basePath).
 */
import { BASE_PATH } from "./api";

export interface ReferralFriend {
  id: number;
  username: string;
  name: string;
  joinedAt: string | null;
  trades: number;
  needed: number;
  qualified: boolean;
}

export interface ReferralMilestone {
  id: string;
  tier: "silver" | "gold" | "diamond" | string;
  need: number;
  days: number;
  title: string;
  reward: string;
  label: string;
  unlocked: boolean;
  remaining: number;
  progress: number;
}

export interface ReferralAiBonus {
  step: number;
  earned: number;
  nextIn: number;
  coachQuota: number | null;
  coachUsed: number;
  coachLeft: number | null;
  tradeQuota: number | null;
  tradeUsed: number;
  tradeLeft: number | null;
}

export interface ReferralStats {
  code: string;
  total: number;
  qualified: number;
  pending: number;
  qualifyTrades: number;
  friends: ReferralFriend[];
  milestones: ReferralMilestone[];
  plan: string;
  planLabel: string;
  planExpiresAt: string | null;
  aiBonus: ReferralAiBonus;
}

/** Where a new friend lands: <origin><basePath>/register?ref=CODE */
export function inviteLink(code: string): string {
  if (!code) return "";
  const origin =
    typeof window !== "undefined" && window.location
      ? window.location.origin
      : "";
  return `${origin}${BASE_PATH}/register?ref=${encodeURIComponent(code)}`;
}

/** localStorage key holding a code seen on /register before the user signs up. */
export const REF_KEY = "tj_ref";

/** Persian digits for any number-ish value. */
export function fa(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "۰";
  const s = typeof value === "number" ? value.toLocaleString("en-US") : String(value);
  return s.replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** Short Jalali date for the friends table. */
export function faDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

/** The marketing copy a user sends to a friend. */
export function inviteMessage(link: string): string {
  return [
    "من ژورنال تریدینگ الگو هاب رو استفاده می‌کنم و جدی میگم برایندم عوض شد ✨",
    "هر معامله رو ثبت می‌کنی، مربی هوش مصنوعی اشتباهاتت رو بهت نشون میده و برایندت رو حرفه‌ای تحلیل می‌کنه.",
    "با این لینک رایگان شروع کن:",
    link,
  ].join("\n");
}
