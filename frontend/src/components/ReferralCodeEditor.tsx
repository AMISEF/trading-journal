"use client";

/**
 * «لینک اختصاصی من» — لتِ ویرایشِ کدِ دعوت.
 *
 * کاربر می‌تواند کدِ رندومِ اولیه را با یک کدِ دلخواه (مثلاً Cryptosmart) عوض
 * کند. آزاد بودن کد هنگام تایپ به‌صورت زنده از سرور پرسیده می‌شود
 * (debounce ۴۰۰ms) و ثبتِ نهایی با PUT /api/referrals/code انجام می‌شود.
 */
import { useEffect, useRef, useState } from "react";
import {
  CODE_MAX,
  CODE_MIN,
  checkCode,
  inviteLink,
  sanitizeCode,
  saveCode,
  type ReferralStats,
} from "@/lib/referrals";

export function ReferralCodeEditor({
  code,
  onSaved,
  onToast,
}: {
  code: string;
  onSaved: (stats: ReferralStats) => void;
  onToast: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(code);
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "bad">("idle");
  const [hint, setHint] = useState("");
  const [saving, setSaving] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setValue(code);
  }, [code]);

  // Live availability check, debounced.
  useEffect(() => {
    if (!open) return;
    const next = value.trim();
    if (timer.current) window.clearTimeout(timer.current);
    if (!next || next === code) {
      setStatus("idle");
      setHint("");
      return;
    }
    if (next.length < CODE_MIN) {
      setStatus("bad");
      setHint(`حداقل ${CODE_MIN} کاراکتر`);
      return;
    }
    setStatus("checking");
    setHint("در حال بررسی…");
    timer.current = window.setTimeout(async () => {
      try {
        const res = await checkCode(next);
        setStatus(res.available ? "ok" : "bad");
        setHint(res.reason);
      } catch {
        setStatus("idle");
        setHint("");
      }
    }, 400);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [value, code, open]);

  const submit = async () => {
    const next = sanitizeCode(value).trim();
    if (!next || next === code) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      const stats = await saveCode(next);
      onSaved(stats);
      onToast("لینک اختصاصی‌ات ثبت شد 🎉");
      setOpen(false);
    } catch (e: any) {
      setStatus("bad");
      setHint(e?.response?.data?.detail || "ثبت کد ناموفق بود.");
    } finally {
      setSaving(false);
    }
  };

  const preview = inviteLink(sanitizeCode(value) || code);

  return (
    <div className="tj-codebox">
      <style>{CSS}</style>
      <button className="tj-codebox-head" onClick={() => setOpen((o) => !o)} type="button">
        <span className="tj-codebox-icon">✨</span>
        <span className="flex-1 text-right">
          <span className="block text-sm font-bold">لینک اختصاصی من</span>
          <span className="block text-[11px] text-muted">
            کد رندوم را با اسم خودت عوض کن، مثلاً Cryptosmart
          </span>
        </span>
        <span className={`tj-codebox-caret ${open ? "tj-open" : ""}`}>⌄</span>
      </button>

      {open && (
        <div className="tj-codebox-body">
          <div className="tj-codebox-row">
            <div className="tj-codebox-field">
              <span className="tj-codebox-prefix" dir="ltr">?ref=</span>
              <input
                dir="ltr"
                autoFocus
                spellCheck={false}
                autoComplete="off"
                maxLength={CODE_MAX}
                value={value}
                placeholder="Cryptosmart"
                onChange={(e) => setValue(sanitizeCode(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                  if (e.key === "Escape") setOpen(false);
                }}
                className="tj-codebox-input"
              />
              <span className={`tj-dot tj-dot-${status}`} />
            </div>
            <button
              type="button"
              className="tj-btn-primary shrink-0"
              onClick={submit}
              disabled={saving || status === "bad" || status === "checking" || !value.trim()}
            >
              {saving ? "در حال ثبت…" : "ثبت کد"}
            </button>
            <button type="button" className="tj-btn-ghost shrink-0" onClick={() => { setValue(code); setOpen(false); }}>
              انصراف
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            {hint && (
              <span className={status === "ok" ? "text-profit" : status === "bad" ? "text-loss" : "text-muted"}>
                {hint}
              </span>
            )}
            <span className="text-muted">
              مجاز: حروف انگلیسی، عدد، - و _ · بین {CODE_MIN} تا {CODE_MAX} کاراکتر
            </span>
          </div>

          <div className="tj-codebox-preview" dir="ltr">{preview}</div>
          <p className="mt-2 text-[11px] leading-6 text-muted">
            توجه: بعد از تغییر کد، لینک قبلی دیگر کار نمی‌کند؛ پس لینک جدید را جایگزین جاهایی کن که قبلاً منتشر کرده‌ای.
            بزرگ یا کوچک بودن حروف در لینک مهم نیست.
          </p>
        </div>
      )}
    </div>
  );
}

const CSS = `
.tj-codebox{margin-top:1rem;border-radius:1.1rem;border:1px solid rgba(255,255,255,.14);
  background:linear-gradient(140deg,rgba(192,132,252,.12),rgba(125,211,252,.06));overflow:hidden}
.tj-codebox-head{display:flex;align-items:center;gap:.7rem;width:100%;padding:.8rem 1rem;text-align:right;
  transition:background .2s}
.tj-codebox-head:hover{background:rgba(255,255,255,.06)}
.tj-codebox-icon{display:grid;place-items:center;width:2rem;height:2rem;border-radius:.7rem;
  background:linear-gradient(135deg,#C084FC,#7DD3FC);color:#04121f;font-size:.9rem}
.tj-codebox-caret{transition:transform .25s ease;opacity:.7}
.tj-codebox-caret.tj-open{transform:rotate(180deg)}
.tj-codebox-body{padding:0 1rem 1rem;animation:tjFade .3s ease both}
@keyframes tjFade{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.tj-codebox-row{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
.tj-codebox-field{position:relative;display:flex;align-items:center;gap:.35rem;flex:1;min-width:14rem;
  border-radius:.9rem;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.22);padding:.55rem .8rem}
.tj-codebox-prefix{font-family:ui-monospace,monospace;font-size:.75rem;opacity:.55}
.tj-codebox-input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:inherit;
  font-family:ui-monospace,monospace;font-size:.95rem;font-weight:700;letter-spacing:.08em}
.tj-dot{width:.55rem;height:.55rem;border-radius:50%;background:rgba(255,255,255,.22);flex:none}
.tj-dot-ok{background:#34D399;box-shadow:0 0 0 4px rgba(52,211,153,.18)}
.tj-dot-bad{background:#F87171;box-shadow:0 0 0 4px rgba(248,113,113,.18)}
.tj-dot-checking{background:#FBBF24;animation:tjBlink 1s ease-in-out infinite}
@keyframes tjBlink{50%{opacity:.25}}
.tj-codebox-preview{margin-top:.7rem;border-radius:.8rem;border:1px dashed rgba(255,255,255,.18);
  background:rgba(0,0,0,.18);padding:.55rem .8rem;font-family:ui-monospace,monospace;font-size:.72rem;
  overflow-wrap:anywhere;opacity:.85}
@media (prefers-reduced-motion:reduce){.tj-dot-checking{animation:none}}
`;
