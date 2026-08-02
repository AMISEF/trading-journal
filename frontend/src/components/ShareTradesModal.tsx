"use client";

/**
 * «اشتراک‌گذاری معاملات» — ساخت و مدیریتِ کارنامهٔ عمومی معامله‌گر.
 * فقط پلن طلایی و الماسی؛ بقیه پیامِ ارتقا می‌بینند.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
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
import { SUBSCRIPTION_PATH } from "@/lib/plans";

const MODE_ICON: Record<string, string> = {
  dashboard: "📊",
  journal: "📋",
  journal_full: "📖",
  all: "✨",
};

type Status = "idle" | "checking" | "ok" | "bad";

export function ShareTradesModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<ShareSettings | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);

  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [hint, setHint] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }, []);

  const apply = useCallback((s: ShareSettings) => {
    setData(s);
    setSlug(s.slug || s.suggested || "");
    setTitle(s.title || "");
    setBio(s.bio || "");
  }, []);

  useEffect(() => {
    if (!open) return;
    setError("");
    loadShare()
      .then(apply)
      .catch(() => setError("بارگذاری تنظیمات اشتراک‌گذاری ممکن نشد."));
  }, [open, apply]);

  // کلید Escape برای بستن.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const onSlugChange = (raw: string) => {
    const value = sanitizeSlug(raw);
    setSlug(value);
    setStatus("idle");
    setHint("");
    if (timer.current) clearTimeout(timer.current);
    if (value.length < SLUG_MIN) {
      if (value) {
        setStatus("bad");
        setHint(`نشانی باید حداقل ${SLUG_MIN} کاراکتر باشد.`);
      }
      return;
    }
    setStatus("checking");
    timer.current = setTimeout(() => {
      checkSlug(value)
        .then((r) => {
          setStatus(r.available ? "ok" : "bad");
          setHint(r.reason);
        })
        .catch(() => {
          setStatus("idle");
          setHint("");
        });
    }, 400);
  };

  const persist = async (patch: Parameters<typeof saveShare>[0], msg?: string) => {
    setSaving(true);
    setError("");
    try {
      const s = await saveShare(patch);
      apply(s);
      if (msg) flash(msg);
      return true;
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data
        ?.detail;
      setError(typeof detail === "string" && detail ? detail.replace("[UPGRADE]", "").trim() : "ذخیره ناموفق بود.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const link = data?.slug ? profileUrl(data.slug) : "";
  const msg = shareMessage(link, data?.name ?? null);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      flash("لینک کپی شد ✓");
    } catch {
      flash("کپی نشد؛ دستی انتخاب کن.");
    }
  };

  return (
    <div className="tjs-backdrop" onClick={onClose}>
      <style>{CSS}</style>
      <div className="tjs-panel" onClick={(e) => e.stopPropagation()}>
        {/* ── head ── */}
        <div className="tjs-head">
          <div className="flex items-center gap-3">
            <span className="tjs-badge">
              <ShareIcon />
            </span>
            <div>
              <div className="tjs-title">اشتراک‌گذاری معاملات</div>
              <div className="tjs-sub">یک لینک عمومی از کارنامه‌ات بساز و هرجا خواستی بفرست</div>
            </div>
          </div>
          <button type="button" className="tjs-x" onClick={onClose} aria-label="بستن">
            ✕
          </button>
        </div>

        <div className="tjs-body">
          {!data && !error && <div className="tjs-skel" />}

          {error && <div className="tjs-error">{error}</div>}

          {data && !data.canShare && (
            <div className="tjs-lock">
              <div className="tjs-lock-icon">💎</div>
              <div className="tjs-lock-title">مخصوص پلن طلایی و الماسی</div>
              <p className="tjs-lock-text">
                «کارنامهٔ عمومی» یک صفحهٔ اختصاصی است که برایند، وین‌ریت، منحنی سرمایه و
                جزئیات معاملاتت را به دنبال‌کننده‌ها نشان می‌دهد. برای فعال‌سازی، اشتراکت را به
                طلایی یا الماسی ارتقا بده.
              </p>
              <a className="tjs-btn tjs-btn-gold" href={SUBSCRIPTION_PATH}>
                خرید / ارتقای اشتراک
              </a>
              <div className="tjs-plan">پلن فعلی تو: {data.planLabel}</div>
            </div>
          )}

          {data && data.canShare && (
            <>
              {/* ── کلید فعال‌سازی ── */}
              <div className="tjs-row">
                <div>
                  <div className="tjs-row-title">لینک عمومی کارنامه</div>
                  <div className="tjs-row-sub">
                    {data.enabled
                      ? "فعال است — هرکسی لینک را داشته باشد می‌تواند ببیند."
                      : "غیرفعال است — هیچ‌کس به کارنامه‌ات دسترسی ندارد."}
                  </div>
                </div>
                <button
                  type="button"
                  className={`tjs-switch ${data.enabled ? "on" : ""}`}
                  disabled={saving}
                  onClick={() =>
                    persist(
                      { enabled: !data.enabled },
                      !data.enabled ? "لینک عمومی فعال شد ✓" : "لینک عمومی خاموش شد.",
                    )
                  }
                  aria-label="فعال/غیرفعال"
                >
                  <span className="tjs-knob" />
                </button>
              </div>

              {/* ── چه چیزی دیده شود ── */}
              <div className="tjs-section-title">چه چیزی به اشتراک گذاشته شود؟</div>
              <div className="tjs-modes">
                {data.modes.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={saving}
                    onClick={() => persist({ mode: m.id as ShareMode }, "حالت اشتراک‌گذاری ذخیره شد ✓")}
                    className={`tjs-mode ${data.mode === m.id ? "sel" : ""}`}
                  >
                    <span className="tjs-mode-ico">{MODE_ICON[m.id] || "✨"}</span>
                    <span className="tjs-mode-body">
                      <span className="tjs-mode-label">{m.label}</span>
                      <span className="tjs-mode-desc">{m.desc}</span>
                    </span>
                    <span className="tjs-radio" />
                  </button>
                ))}
              </div>

              {/* ── نشانی اختصاصی ── */}
              <div className="tjs-section-title">نشانی اختصاصی</div>
              <div className="tjs-slug">
                <span className="tjs-prefix" dir="ltr">/u/</span>
                <input
                  className="tjs-input"
                  dir="ltr"
                  value={slug}
                  maxLength={30}
                  placeholder="cryptosmart"
                  onChange={(e) => onSlugChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && status !== "bad" && slug.length >= SLUG_MIN) {
                      persist({ slug }, "نشانی ذخیره شد ✓");
                    }
                  }}
                />
                <span className={`tjs-dot ${status}`} />
                <button
                  type="button"
                  className="tjs-btn tjs-btn-sm"
                  disabled={saving || status === "bad" || slug.length < SLUG_MIN}
                  onClick={() => persist({ slug }, "نشانی ذخیره شد ✓")}
                >
                  ثبت نشانی
                </button>
              </div>
              {hint && <div className={`tjs-hint ${status}`}>{hint}</div>}

              {/* ── عنوان / معرفی / ناشناس ── */}
              <div className="tjs-grid2">
                <label className="tjs-field">
                  <span>عنوان صفحه (اختیاری)</span>
                  <input
                    className="tjs-text"
                    value={title}
                    maxLength={80}
                    placeholder="مثلاً: کارنامهٔ فیوچرز من"
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => title !== (data.title || "") && persist({ title })}
                  />
                </label>
                <label className="tjs-field">
                  <span>معرفی کوتاه (اختیاری)</span>
                  <input
                    className="tjs-text"
                    value={bio}
                    maxLength={300}
                    placeholder="مثلاً: تریدر فیوچرز کریپتو، پرایس اکشن"
                    onChange={(e) => setBio(e.target.value)}
                    onBlur={() => bio !== (data.bio || "") && persist({ bio })}
                  />
                </label>
              </div>

              <div className="tjs-row">
                <div>
                  <div className="tjs-row-title">نمایش ناشناس</div>
                  <div className="tjs-row-sub">به‌جای نام و نام خانوادگی، فقط نام کاربری نشان داده شود.</div>
                </div>
                <button
                  type="button"
                  className={`tjs-switch ${data.anonymous ? "on" : ""}`}
                  disabled={saving}
                  onClick={() => persist({ anonymous: !data.anonymous })}
                  aria-label="ناشناس"
                >
                  <span className="tjs-knob" />
                </button>
              </div>

              {/* ── لینک و دکمه‌های اشتراک ── */}
              {data.slug && (
                <div className="tjs-linkbox">
                  <div className="tjs-link" dir="ltr">{link}</div>
                  <div className="tjs-actions">
                    <button type="button" className="tjs-btn tjs-btn-primary" onClick={copy}>
                      کپی لینک
                    </button>
                    <a
                      className="tjs-btn tjs-btn-tg"
                      href={telegramShareUrl(link, msg)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      تلگرام
                    </a>
                    <a
                      className="tjs-btn tjs-btn-wa"
                      href={whatsappShareUrl(msg)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      واتس‌اپ
                    </a>
                    <a className="tjs-btn tjs-btn-ghost" href={link} target="_blank" rel="noreferrer">
                      پیش‌نمایش
                    </a>
                  </div>
                  <div className="tjs-views">👁 بازدید: {data.views.toLocaleString("fa-IR")}</div>
                </div>
              )}
            </>
          )}
        </div>

        {toast && <div className="tjs-toast">{toast}</div>}
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

const CSS = `
.tjs-backdrop{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:16px;
  background:rgba(3,10,20,.62);backdrop-filter:blur(10px);animation:tjsFade .18s ease}
@keyframes tjsFade{from{opacity:0}to{opacity:1}}
@keyframes tjsUp{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}
.tjs-panel{position:relative;width:min(720px,100%);max-height:88vh;overflow:auto;border-radius:26px;
  border:1px solid var(--glass-border,rgba(255,255,255,.14));background:var(--glass-bg,rgba(15,23,42,.86));
  box-shadow:0 40px 90px -30px rgba(0,0,0,.75);animation:tjsUp .24s cubic-bezier(.2,.8,.3,1)}
.tjs-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:18px 20px;border-bottom:1px solid var(--glass-border,rgba(255,255,255,.1));
  background:linear-gradient(120deg,rgba(103,232,249,.14),rgba(167,139,250,.10) 60%,transparent);backdrop-filter:blur(8px)}
.tjs-badge{display:grid;place-items:center;width:38px;height:38px;border-radius:14px;color:#06121f;
  background:linear-gradient(120deg,rgb(103,232,249),rgb(167,139,250));box-shadow:0 12px 26px -14px rgba(103,232,249,.9)}
.tjs-title{font-weight:800;font-size:1.05rem}
.tjs-sub{font-size:.75rem;opacity:.7}
.tjs-x{width:34px;height:34px;border-radius:12px;border:1px solid var(--glass-border,rgba(255,255,255,.14));
  background:transparent;opacity:.75;transition:.15s}
.tjs-x:hover{opacity:1;transform:rotate(90deg)}
.tjs-body{padding:18px 20px 22px;display:flex;flex-direction:column;gap:14px}
.tjs-skel{height:180px;border-radius:18px;background:linear-gradient(90deg,rgba(255,255,255,.05),rgba(255,255,255,.11),rgba(255,255,255,.05));
  background-size:200% 100%;animation:tjsSkel 1.2s linear infinite}
@keyframes tjsSkel{from{background-position:200% 0}to{background-position:-200% 0}}
.tjs-error{border-radius:14px;padding:10px 14px;font-size:.85rem;color:#fecaca;
  background:rgba(248,68,68,.12);border:1px solid rgba(248,68,68,.35)}
.tjs-section-title{margin-top:4px;font-weight:800;font-size:.92rem;opacity:.92}
.tjs-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 15px;border-radius:18px;
  border:1px solid var(--glass-border,rgba(255,255,255,.12));background:rgba(255,255,255,.04)}
.tjs-row-title{font-weight:700;font-size:.92rem}
.tjs-row-sub{font-size:.75rem;opacity:.68;margin-top:2px}
.tjs-switch{position:relative;flex:none;width:52px;height:30px;border-radius:999px;border:1px solid rgba(255,255,255,.16);
  background:rgba(255,255,255,.08);transition:.2s}
.tjs-switch.on{background:linear-gradient(120deg,rgb(52,211,153),rgb(103,232,249));border-color:transparent}
.tjs-knob{position:absolute;top:3px;right:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:.2s;
  box-shadow:0 6px 14px -6px rgba(0,0,0,.7)}
.tjs-switch.on .tjs-knob{right:calc(100% - 25px)}
.tjs-modes{display:grid;gap:10px}
@media(min-width:640px){.tjs-modes{grid-template-columns:1fr 1fr}}
.tjs-mode{display:flex;align-items:flex-start;gap:11px;text-align:right;padding:13px 14px;border-radius:18px;
  border:1px solid var(--glass-border,rgba(255,255,255,.12));background:rgba(255,255,255,.03);transition:.18s}
.tjs-mode:hover{transform:translateY(-2px);border-color:rgba(103,232,249,.45)}
.tjs-mode.sel{border-color:rgba(103,232,249,.75);background:linear-gradient(140deg,rgba(103,232,249,.15),rgba(167,139,250,.08))}
.tjs-mode-ico{font-size:1.15rem;line-height:1.4}
.tjs-mode-body{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0}
.tjs-mode-label{font-weight:800;font-size:.88rem}
.tjs-mode-desc{font-size:.72rem;opacity:.7;line-height:1.7}
.tjs-radio{flex:none;width:16px;height:16px;border-radius:50%;margin-top:3px;border:2px solid rgba(255,255,255,.28)}
.tjs-mode.sel .tjs-radio{border-color:rgb(103,232,249);background:radial-gradient(circle,rgb(103,232,249) 42%,transparent 46%)}
.tjs-slug{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:16px;
  border:1px solid var(--glass-border,rgba(255,255,255,.14));background:rgba(255,255,255,.05)}
.tjs-prefix{font-family:ui-monospace,Menlo,monospace;opacity:.6;font-size:.85rem}
.tjs-input{flex:1;min-width:0;background:transparent;border:none;outline:none;font-family:ui-monospace,Menlo,monospace;
  font-weight:700;letter-spacing:.5px;font-size:.95rem;color:inherit}
.tjs-dot{flex:none;width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,.25)}
.tjs-dot.ok{background:rgb(52,211,153);box-shadow:0 0 10px rgba(52,211,153,.8)}
.tjs-dot.bad{background:rgb(248,113,113);box-shadow:0 0 10px rgba(248,113,113,.8)}
.tjs-dot.checking{background:rgb(251,191,36);animation:tjsBlink .9s ease-in-out infinite}
@keyframes tjsBlink{50%{opacity:.25}}
.tjs-hint{font-size:.75rem;opacity:.8;padding-right:4px}
.tjs-hint.bad{color:#fca5a5}
.tjs-hint.ok{color:#6ee7b7}
.tjs-grid2{display:grid;gap:10px}
@media(min-width:640px){.tjs-grid2{grid-template-columns:1fr 1fr}}
.tjs-field{display:flex;flex-direction:column;gap:6px;font-size:.75rem;opacity:.95}
.tjs-text{padding:10px 13px;border-radius:14px;font-size:.85rem;color:inherit;
  border:1px solid var(--glass-border,rgba(255,255,255,.14));background:rgba(255,255,255,.05);outline:none}
.tjs-text:focus{border-color:rgba(103,232,249,.6)}
.tjs-linkbox{display:flex;flex-direction:column;gap:11px;padding:15px;border-radius:20px;
  border:1px solid rgba(103,232,249,.3);background:linear-gradient(140deg,rgba(103,232,249,.12),rgba(167,139,250,.06))}
.tjs-link{overflow:auto;white-space:nowrap;font-family:ui-monospace,Menlo,monospace;font-size:.82rem;
  padding:10px 12px;border-radius:13px;background:rgba(0,0,0,.28)}
.tjs-actions{display:flex;flex-wrap:wrap;gap:8px}
.tjs-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 15px;border-radius:13px;
  font-size:.82rem;font-weight:800;transition:.16s;border:1px solid transparent}
.tjs-btn:hover{transform:translateY(-2px)}
.tjs-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.tjs-btn-sm{padding:7px 13px;font-size:.78rem;background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.16)}
.tjs-btn-primary{color:#06121f;background:linear-gradient(120deg,rgb(103,232,249),rgb(52,211,153))}
.tjs-btn-gold{color:#2a1200;background:linear-gradient(120deg,rgb(251,191,36),rgb(244,114,182))}
.tjs-btn-tg{color:#fff;background:linear-gradient(120deg,#2AABEE,#229ED9)}
.tjs-btn-wa{color:#04231a;background:linear-gradient(120deg,#25D366,#12B855)}
.tjs-btn-ghost{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.16)}
.tjs-views{font-size:.74rem;opacity:.7}
.tjs-lock{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:26px 18px;border-radius:22px;
  border:1px solid rgba(103,232,249,.3);background:linear-gradient(150deg,rgba(103,232,249,.14),rgba(167,139,250,.07))}
.tjs-lock-icon{font-size:2.4rem}
.tjs-lock-title{font-weight:900;font-size:1.05rem}
.tjs-lock-text{font-size:.83rem;line-height:2;opacity:.8;max-width:44ch}
.tjs-plan{font-size:.74rem;opacity:.65}
.tjs-toast{position:sticky;bottom:12px;margin:0 20px 12px;padding:10px 15px;border-radius:14px;text-align:center;
  font-size:.82rem;font-weight:700;color:#06121f;background:linear-gradient(120deg,rgb(103,232,249),rgb(52,211,153));
  animation:tjsUp .2s ease}
`;
