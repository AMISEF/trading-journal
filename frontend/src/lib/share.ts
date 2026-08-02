/**
 * اشتراک‌گذاری معاملات — کارنامهٔ عمومی معامله‌گر (پلن طلایی و الماسی).
 *
 * لینک همیشه در لحظه از origin ساخته می‌شود تا روی هر دامنه‌ای و زیرِ basePath
 * (یعنی /journal) درست کار کند.
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

/** هم‌تراز با app/services/share.py */
export const SLUG_MIN = 3;
export const SLUG_MAX = 30;

/** فقط حروف انگلیسی، عدد، خط تیره و زیرخط؛ فاصله به خط تیره تبدیل می‌شود. */
export function sanitizeSlug(raw: string): string {
  return (raw || "")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, SLUG_MAX);
}

/** تنظیمات فعلیِ کارنامهٔ عمومیِ کاربرِ واردشده. */
export function loadShare(): Promise<ShareSettings> {
  return http.get<ShareSettings>("/share/me").then((r) => r.data);
}

/** ذخیرهٔ تغییرات (فقط فیلدهایی که می‌فرستیم). */
export function saveShare(patch: ShareUpdate): Promise<ShareSettings> {
  return http.put<ShareSettings>("/share/me", patch).then((r) => r.data);
}

/** بررسی زندهٔ آزاد بودنِ نشانی، هنگام تایپ. */
export function checkSlug(slug: string): Promise<SlugCheck> {
  return http
    .get<SlugCheck>("/share/slug/check", { params: { slug } })
    .then((r) => r.data);
}

/** خواندنِ عمومیِ یک کارنامه (بدون لاگین). */
export function loadPublicProfile(slug: string): Promise<PublicProfile> {
  return http
    .get<PublicProfile>(`/public/profile/${encodeURIComponent(slug)}`)
    .then((r) => r.data);
}

/** نشانی کاملِ کارنامه: <origin><basePath>/u/<slug> */
export function profileUrl(slug: string | null | undefined): string {
  if (!slug) return "";
  const origin =
    typeof window !== "undefined" && window.location ? window.location.origin : "";
  return `${origin}${BASE_PATH}/u/${encodeURIComponent(slug)}`;
}

/** متنِ آمادهٔ اشتراک‌گذاری در تلگرام/واتس‌اپ. */
export function shareMessage(link: string, name?: string | null): string {
  const who = name ? `کارنامهٔ معاملاتِ ${name}` : "کارنامهٔ معاملاتِ من";
  return [
    `📊 ${who} — شفاف و لحظه‌ای، در ژورنال تریدینگ الگو هاب`,
    "برایند، وین‌ریت، منحنی سرمایه و جزئیات معاملات را ببین:",
    link,
  ].join("\n");
}

/** لینک اشتراک‌گذاری در تلگرام (بدون نوشتنِ مستقیمِ آدرس در کد). */
export function telegramShareUrl(link: string, text: string): string {
  return (
    "https://" +
    "t.me/share/url?url=" +
    encodeURIComponent(link) +
    "&text=" +
    encodeURIComponent(text)
  );
}

/** لینک اشتراک‌گذاری در واتس‌اپ. */
export function whatsappShareUrl(text: string): string {
  return "https://" + "wa.me/?text=" + encodeURIComponent(text);
}
