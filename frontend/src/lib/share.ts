/**
 * اشتراک‌گذاری معاملات — کارنامهٔ عمومی معامله‌گر (طلایی و الماسی).
 *
 * لینک همیشه در لحظه از origin ساخته می‌شود تا روی هر دامنه‌ای (و زیرِ basePath
 * یعنی /journal) درست کار کند.
 */
import http, { BASE_PATH } from "./api";
import type { DashboardData, Trade } from "./types";

/** چه چیزی به اشتراک گذاشته می‌شود. */
export type ShareMode = "dashboard" | "journal" | "journal_full" | "all";

export interface ShareModeInfo {
  id: ShareMode;
  label: string;
  desc: string;
  icon: string;
}

export interface ShareSettings {
  canShare: boolean;
  plan: string;
  planLabel: string;
  enabled: boolean;
  slug: string | null;
  suggested: string;
  mode: ShareMode;
  title: string | null;
  bio: string | null;
  anonymous: boolean;
  views: number;
  createdAt: string | null;
  slugMin: number;
  slugMax: number;
  path: string | null;
  modes: ShareModeInfo[];
}

export interface ShareUpdate {
  enabled?: boolean;
  mode?: ShareMode;
  slug?: string;
  title?: string;
  bio?: string;
  anonymous?: boolean;
}

export interface SlugCheck {
  slug: string;
  available: boolean;
  reason: string;
}

export interface PublicProfile {
  slug: string;
  name: string;
  username: string | null;
  title: string | null;
  bio: string | null;
  plan: string;
  planLabel: string;
  mode: ShareMode;
  modeLabel: string;
  showDashboard: boolean;
  showJournal: boolean;
  showDetails: boolean;
  joinedAt: string | null;
  sharedAt: string | null;
  views: number;
  tradeCount: number;
  dashboard: DashboardData | null;
  trades: Trade[] | null;
}

/** حداقل و حداکثر طولِ نشانی (هم‌تراز با بک‌اند). */
export const SLUG_MIN = 3;
export const SLUG_MAX = 30;

/** فقط حروف انگلیسی، عدد، خط تیره و زیرخط؛ فاصله به - تبدیل می‌شود. */
export function sanitizeSlug(raw: string): string {
  return (raw || "")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, SLUG_MAX);
}

/** تنظیمات فعلیِ کارنامهٔ عمومی کاربر. */
export function loadShare(): Promise<ShareSettings> {
  return http.get<ShareSettings>("/share/me").then((r) => r.data);
}

/** ذخیرهٔ تغییرات (فقط فیلدهایی که می‌فرستیم عوض می‌شوند). */
export function saveShare(payload: ShareUpdate): Promise<ShareSettings> {
  return http.put<ShareSettings>("/share/me", payload).then((r) => r.data);
}

/** بررسی زندهٔ آزاد بودنِ نشانی هنگام تایپ. */
export function checkSlug(slug: string): Promise<SlugCheck> {
  return http
    .get<SlugCheck>("/share/slug/check", { params: { slug } })
    .then((r) => r.data);
}

/** خواندنِ یک کارنامهٔ عمومی (بدون نیاز به ورود). */
export function loadProfile(slug: string): Promise<PublicProfile> {
  return http
    .get<PublicProfile>(`/public/profile/${encodeURIComponent(slug)}`)
    .then((r) => r.data);
}

/** لینک عمومی: <origin><basePath>/u/<slug> */
export function profileLink(slug: string | null | undefined): string {
  if (!slug) return "";
  const origin =
    typeof window !== "undefined" && window.location ? window.location.origin : "";
  return `${origin}${BASE_PATH}/u/${encodeURIComponent(slug)}`;
}

/** متنی که کاربر کنار لینک می‌فرستد. */
export function shareMessage(link: string, name?: string): string {
  const who = name ? `کارنامهٔ معاملاتی ${name}` : "کارنامهٔ معاملاتی من";
  return [
    `${who} رو ببین — شفاف و بدون روتوش ✨`,
    "هر معامله با تمام جزئیات، منحنی سرمایه، وین‌ریت و دراوداون، مستقیم از ژورنال:",
    link,
  ].join("\n");
}

/** اعداد فارسی. */
export function faNum(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "۰";
  const s = typeof value === "number" ? value.toLocaleString("en-US") : String(value);
  return s.replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}
