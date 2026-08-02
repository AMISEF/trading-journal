"use client";

/**
 * اشتراک‌گذاری معاملات — ساخت و مدیریتِ «کارنامهٔ عمومی».
 *
 * تمام رنگ‌ها از متغیرهای تم (‑‑surface / ‑‑text / ‑‑primary …) خوانده می‌شوند،
 * پس در هر هفت تمِ سایت (روشن، روشن ملایم، باربی، سیندرلا، دارک،
 * اوشن و کلاسیک) خوانا و هماهنگ است.
 */
import { useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/api";
import { SUBSCRIPTION_PATH } from "@/lib/plans";
import {
  SLUG_MAX,
  SLUG_MIN,
  checkSlug,
  loadShare,
  profileUrl,
  sanitizeSlug,
  saveShare,
  shareMessage,
  telegramShareUrl,
  whatsappShareUrl,
  type ShareMode,
  type ShareSettings,
} from "@/lib/share";

const MODE_ICON: Record<ShareMode, string> = {
  dashboard: "📊",
  journal: "📋",
  journal_full: "📖",
  all: "✨",
};

type Status = "idle" | "checking" | "ok" | "bad";

/** دکمهٔ اصلی — رنگِ تم با متنِ متضاد، در همهٔ تم‌ها خوانا. */
const primaryBtn: React.CSSProperties = {
  background: "var(--primary)",
  color: "var(--surface)",
  border: "1px solid var(--primary)",
};

const softBtn: React.CSSProperties = {
  background: "var(--surface-2)",
  color: "var(--text)",
  border: "1px solid var(--border)",
};

export function ShareTradesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<ShareSettings | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);

  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [hint, setHint] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");

  const timer = useRef<any>(null);

  useEffect(() => {
    if (!open) return;
    setError("");
    loadShare()
      .then(apply)
      .catch(() => setError("بارگذاری تنظیمات اشتراک‌گذاری با خطا مواجه شد."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function apply(d: ShareSettings) {
    setData(d);
    setSlug(d.slug || d.suggested || "");
    setTitle(d.title || "");
    setBio(d.bio || "");
    setStatus("idle");
    setHint("");
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2400);
  }

  function onSlugChange(raw: string) {
    const v = sanitizeSlug(raw);
    setSlug(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.length < SLUG_MIN) {
      setStatus("bad");
      setHint(`نشانی باید حداقل ${SLUG_MIN} کاراکتر باشد.`);
      return;
    }
    setStatus("checking");
    setHint("در حال بررسی…");
    timer.current = setTimeout(async () => {
      try {
        const res = await checkSlug(v);
        setStatus(res.available ? "ok" : "bad");
        setHint(res.reason);
      } catch {
        setStatus("idle");
        setHint("");
      }
    }, 400);
  }

  async function persist(patch: Parameters<typeof saveShare>[0], okMsg: string) {
    setSaving(true);
    setError("");
    try {
      const d = await saveShare(patch);
      apply(d);
      flash(okMsg);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === "string" && detail.trim() ? detail : "ذخیرهٔ تغییرات ناموفق بود.");
    } finally {
      setSaving(false);
    }
  }

  const link = data?.slug ? profileUrl(data.slug) : "";

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      flash("لینک کپی شد ✓");
    } catch {
      flash("کپی نشد؛ دستی انتخاب کنید.");
    }
  }

  if (!open) return null;

  const locked = data != null && !data.canShare;
  const msg = shareMessage(link, null);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-4 pt-10"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        className="w-full max-w-2xl rounded-3xl p-5 sm:p-6"
        style={{
          background: "var(--surface)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          boxShadow: "var(--glass-shadow)",
        }}
      >
        {/* سربرگ */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold" style={{ color: "var(--text)" }}>
              اشتراک‌گذاری معاملات
            </h2>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              یک لینک عمومی از «کارنامهٔ من» بسازید و هر جا خواستید به اشتراک بگذارید.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg"
            style={softBtn}
            aria-label="بستن"
          >
            ✕
          </button>
        </div>

        {error && (
          <p
            className="mb-3 rounded-xl px-3 py-2 text-sm"
            style={{ background: "var(--loss-soft)", color: "var(--loss)" }}
          >
            {error}
          </p>
        )}

        {!data && !error && (
          <p className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>در حال بارگذاری…</p>
        )}

        {/* قفل پلن */}
        {locked && (
          <div
            className="space-y-3 rounded-2xl p-5 text-center"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            <div className="text-3xl">🔒</div>
            <div className="font-extrabold" style={{ color: "var(--text)" }}>
              کارنامهٔ عمومی ویژهٔ پلن طلایی و الماسی است
            </div>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              پلن فعلی شما: <b style={{ color: "var(--text)" }}>{data?.planLabel}</b> — با ارتقای پلن، لینک اختصاصی کارنامه‌تان فعال می‌شود.
            </p>
            <a
              href={`${BASE_PATH}${SUBSCRIPTION_PATH}`}
              className="inline-block rounded-xl px-5 py-2.5 text-sm font-extrabold"
              style={primaryBtn}
            >
              خرید اشتراک
            </a>
          </div>
        )}

        {data && data.canShare && (
          <div className="space-y-5">
            {/* روشن/خاموش */}
            <div
              className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
            >
              <div>
                <div className="font-bold" style={{ color: "var(--text)" }}>لینک عمومی فعال باشد</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  با خاموش کردن، لینک برای همه غیرفعال می‌شود (نشانی حفظ می‌شود).
                </div>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  persist(
                    { enabled: !data.enabled, slug: data.slug || slug },
                    !data.enabled ? "کارنامهٔ عمومی فعال شد ✓" : "کارنامهٔ عمومی خاموش شد."
                  )
                }
                className="relative h-8 w-14 shrink-0 rounded-full transition-colors"
                style={{ background: data.enabled ? "var(--profit)" : "var(--border)" }}
                aria-label="فعال‌سازی"
              >
                <span
                  className="absolute top-1 h-6 w-6 rounded-full transition-all"
                  style={{ right: data.enabled ? 4 : 32, background: "var(--surface)" }}
                />
              </button>
            </div>

            {/* حالت اشتراک‌گذاری */}
            <div className="space-y-2">
              <div className="text-sm font-bold" style={{ color: "var(--text)" }}>چه چیزی دیده شود؟</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {data.modes.map((m) => {
                  const active = data.mode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={saving}
                      onClick={() => persist({ mode: m.id, slug: data.slug || slug }, "حالت اشتراک‌گذاری ذخیره شد ✓")}
                      className="flex items-start gap-3 rounded-2xl p-3 text-right transition-all hover:-translate-y-0.5"
                      style={{
                        background: active ? "var(--primary-soft)" : "var(--surface-2)",
                        border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                        color: "var(--text)",
                      }}
                    >
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg"
                        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                      >
                        {MODE_ICON[m.id] || "✨"}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold" style={{ color: "var(--text)" }}>{m.label}</span>
                        <span className="block text-xs" style={{ color: "var(--muted)" }}>{m.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* نشانی اختصاصی */}
            <div className="space-y-2">
              <div className="text-sm font-bold" style={{ color: "var(--text)" }}>نشانی اختصاصی لینک</div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded-xl px-3 py-2 text-xs"
                  dir="ltr"
                  style={{ background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border)" }}
                >
                  {BASE_PATH}/u/
                </span>
                <input
                  className="tj-input min-w-[180px] flex-1"
                  dir="ltr"
                  value={slug}
                  maxLength={SLUG_MAX}
                  onChange={(e) => onSlugChange(e.target.value)}
                  placeholder="cryptosmart"
                />
                <button
                  type="button"
                  disabled={saving || status === "bad" || slug.length < SLUG_MIN}
                  onClick={() => persist({ slug }, "نشانی ذخیره شد ✓")}
                  className="rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50"
                  style={primaryBtn}
                >
                  ذخیرهٔ نشانی
                </button>
              </div>
              {hint && (
                <div
                  className="text-xs"
                  style={{
                    color:
                      status === "ok" ? "var(--profit)" : status === "bad" ? "var(--loss)" : "var(--muted)",
                  }}
                >
                  {hint}
                </div>
              )}
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                فقط حروف انگلیسی، عدد، خط تیره و زیرخط — بین {SLUG_MIN} تا {SLUG_MAX} کاراکتر.
              </div>
            </div>

            {/* عنوان و معرفی */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="tj-label">عنوان کارنامه (اختیاری)</label>
                <input
                  className="tj-input"
                  value={title}
                  maxLength={80}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثلاً: معامله‌گر فیوچرز ارز دیجیتال"
                />
              </div>
              <div>
                <label className="tj-label">معرفی کوتاه (اختیاری)</label>
                <input
                  className="tj-input"
                  value={bio}
                  maxLength={300}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="یکی دو خط دربارهٔ سبک معامله‌گری شما"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => persist({ title, bio, slug: data.slug || slug }, "ذخیره شد ✓")}
                className="rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50"
                style={primaryBtn}
              >
                ذخیرهٔ متن‌ها
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  persist(
                    { anonymous: !data.anonymous, slug: data.slug || slug },
                    data.anonymous ? "نام واقعی نمایش داده می‌شود." : "نام مخفی شد ✓"
                  )
                }
                className="rounded-xl px-4 py-2 text-sm font-bold"
                style={softBtn}
              >
                {data.anonymous ? "👤 نمایش نام واقعی" : "🕶️ مخفی کردن نام"}
              </button>
              <span className="text-xs" style={{ color: "var(--muted)" }}>بازدید: {data.views}</span>
            </div>

            {/* لینک نهایی */}
            {data.slug && (
              <div
                className="space-y-3 rounded-2xl p-4"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                <div
                  className="break-all rounded-xl px-3 py-2 text-sm"
                  dir="ltr"
                  style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }}
                >
                  {link}
                </div>
                {!data.enabled && (
                  <div className="text-xs" style={{ color: "var(--loss)" }}>
                    این لینک فعلاً خاموش است؛ برای نمایش به دیگران، کلید بالا را روشن کنید.
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={copy} className="rounded-xl px-4 py-2 text-sm font-bold" style={primaryBtn}>
                    📋 کپی لینک
                  </button>
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl px-4 py-2 text-sm font-bold"
                    style={softBtn}
                  >
                    👁️ پیش‌نمایش
                  </a>
                  <a
                    href={telegramShareUrl(link, msg)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl px-4 py-2 text-sm font-bold text-white"
                    style={{ background: "rgb(41,171,226)" }}
                  >
                    ارسال در تلگرام
                  </a>
                  <a
                    href={whatsappShareUrl(msg)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl px-4 py-2 text-sm font-bold text-white"
                    style={{ background: "rgb(37,211,102)" }}
                  >
                    ارسال در واتس‌اپ
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {toast && (
          <div
            className="mt-4 rounded-xl px-3 py-2 text-center text-sm font-bold"
            style={{ background: "var(--profit-soft)", color: "var(--profit)" }}
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

export default ShareTradesModal;
