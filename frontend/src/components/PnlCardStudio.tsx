"use client";

/**
 * استودیوی «ساخت تصویر برایند».
 *
 * کاربر ابعاد، تم و بازهٔ برایند را انتخاب می‌کند، پیش‌نمایش زنده می‌بیند و خروجی
 * را دانلود/کپی/اشتراک می‌کند. رندر کاملاً سمتِ کلاینت و روی canvas انجام می‌شود.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/store/auth";
import { getStoredTheme, type Theme } from "@/lib/theme";
import type { DashboardData } from "@/lib/types";
import {
  CARD_ASPECTS,
  CARD_PERIODS,
  CARD_THEMES,
  aspectDef,
  loadBrandLogo,
  renderPnlCard,
  shareCaption,
  SITE_URL,
  type CardAspect,
  type CardPeriod,
} from "@/lib/pnlCard";

interface Props {
  data: DashboardData;
  open: boolean;
  onClose: () => void;
  /** نامِ نمایشی دلخواه (حالت دمو). */
  nameOverride?: string;
}

const FILE_BASE = "algohub-pnl";
const TELEGRAM_SHARE = "https://" + "t.me/share/url";

export function PnlCardStudio({ data, open, onClose, nameOverride }: Props) {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [aspect, setAspect] = useState<CardAspect>("3x4");
  const [theme, setTheme] = useState<Theme>("classic");
  const [period, setPeriod] = useState<CardPeriod>("monthly");
  const [showMargin, setShowMargin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const fullName =
    nameOverride ??
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ??
    "";
  const username = nameOverride ? "" : user?.username ?? "";

  useEffect(() => {
    if (open) setTheme(getStoredTheme());
  }, [open]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3800);
  }, []);

  /** پیش‌نیازهای رندر: فونت‌ها و لوگو. */
  const prepare = useCallback(async () => {
    try {
      if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready;
    } catch {
      /* فونت آماده نشد — با فونتِ پیش‌فرض می‌کشیم */
    }
    return loadBrandLogo();
  }, []);

  /** رندرِ پیش‌نمایش. */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const draw = async () => {
      const logo = await prepare();
      if (cancelled || !canvasRef.current) return;
      renderPnlCard(canvasRef.current, data, {
        aspect,
        theme,
        period,
        showMargin,
        name: fullName,
        username,
        scale: 1,
        logo,
      });
    };
    void draw();
    return () => {
      cancelled = true;
    };
  }, [open, data, aspect, theme, period, showMargin, fullName, username, prepare]);

  /** خروجی با کیفیت ۲ برابر. */
  const makeBlob = useCallback(
    async (aspectOverride?: CardAspect): Promise<Blob | null> => {
      const logo = await prepare();
      const canvas = document.createElement("canvas");
      renderPnlCard(canvas, data, {
        aspect: aspectOverride ?? aspect,
        theme,
        period,
        showMargin,
        name: fullName,
        username,
        scale: 2,
        logo,
      });
      return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 1));
    },
    [data, aspect, theme, period, showMargin, fullName, username, prepare],
  );

  const fileName = (a: CardAspect) => `${FILE_BASE}-${period}-${a}.png`;

  const saveBlob = (blob: Blob, a: CardAspect) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName(a);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const caption = () => shareCaption(data, period, fullName);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      flash("انجام نشد. دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  };

  const doDownload = (a?: CardAspect) =>
    run(async () => {
      const target = a ?? aspect;
      const blob = await makeBlob(target);
      if (!blob) throw new Error("blob");
      saveBlob(blob, target);
      flash("تصویر دانلود شد ✅");
    });

  const doCopy = () =>
    run(async () => {
      const blob = await makeBlob();
      if (!blob) throw new Error("blob");
      const w = window as unknown as { ClipboardItem?: new (i: Record<string, Blob>) => ClipboardItem };
      if (navigator.clipboard && w.ClipboardItem) {
        await navigator.clipboard.write([new w.ClipboardItem({ "image/png": blob })]);
        flash("تصویر کپی شد — هرجا خواستید Paste کنید 📋");
      } else {
        saveBlob(blob, aspect);
        flash("مرورگر کپی تصویر را پشتیبانی نمی‌کند — تصویر دانلود شد.");
      }
    });

  /** تلاش برای اشتراک‌گذاری بومی (موبایل)؛ در غیر این صورت false. */
  const nativeShare = async (blob: Blob, a: CardAspect, textBody: string): Promise<boolean> => {
    const file = new File([blob], fileName(a), { type: "image/png" });
    const nav = navigator as Navigator & {
      canShare?: (d: { files?: File[] }) => boolean;
      share?: (d: { files?: File[]; text?: string; title?: string }) => Promise<void>;
    };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], text: textBody, title: "برایند من در الگو هاب" });
      return true;
    }
    return false;
  };

  const doTelegram = () =>
    run(async () => {
      const blob = await makeBlob();
      if (!blob) throw new Error("blob");
      const body = caption();
      if (await nativeShare(blob, aspect, body)) return;
      saveBlob(blob, aspect);
      try {
        await navigator.clipboard?.writeText(body);
      } catch {
        /* متن کپی نشد */
      }
      const url = `${TELEGRAM_SHARE}?url=${encodeURIComponent(SITE_URL)}&text=${encodeURIComponent(body)}`;
      window.open(url, "_blank", "noopener");
      flash("تصویر دانلود و متن کپی شد — در تلگرام تصویر را ضمیمه کنید.");
    });

  const doInstagram = (mode: "post" | "story") =>
    run(async () => {
      const target: CardAspect = mode === "story" ? "9x16" : aspect === "9x16" ? "3x4" : aspect;
      const blob = await makeBlob(target);
      if (!blob) throw new Error("blob");
      const body = caption();
      if (await nativeShare(blob, target, body)) return;
      saveBlob(blob, target);
      try {
        await navigator.clipboard?.writeText(body);
      } catch {
        /* متن کپی نشد */
      }
      flash(
        mode === "story"
          ? "تصویرِ استوری (۹:۱۶) ذخیره و کپشن کپی شد — در اینستاگرام آپلودش کنید."
          : "تصویرِ پست ذخیره و کپشن کپی شد — در اینستاگرام آپلودش کنید.",
      );
    });

  if (!open) return null;

  const def = aspectDef(aspect);
  const vertical = def.h > def.w;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto p-3 sm:p-6"
      style={{ background: "rgba(3,10,20,0.72)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="my-4 w-full max-w-6xl rounded-3xl p-4 sm:p-6"
        style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", boxShadow: "0 40px 90px -40px rgba(0,0,0,0.8)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* سربرگ */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl text-lg" style={{ background: "rgba(251,191,36,0.16)" }}>🖼️</span>
            <div>
              <h2 className="text-xl font-extrabold">ساخت تصویر برایند</h2>
              <p className="text-xs text-muted">خروجی حرفه‌ای و آمادهٔ انتشار از داشبورد شما</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-sm font-bold text-muted transition hover:text-white"
            style={{ border: "1px solid var(--glass-border)" }}
          >
            ✕ بستن
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          {/* ── تنظیمات ── */}
          <div className="space-y-4">
            <Section title="ابعاد تصویر">
              <div className="grid grid-cols-2 gap-2">
                {CARD_ASPECTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAspect(a.id)}
                    className="rounded-xl px-3 py-2 text-right text-xs font-bold transition"
                    style={{
                      background: aspect === a.id ? "rgba(56,189,248,0.18)" : "var(--glass-bg)",
                      border: `1px solid ${aspect === a.id ? "rgba(56,189,248,0.55)" : "var(--glass-border)"}`,
                    }}
                  >
                    <span className="block">{a.label}</span>
                    <span className="block text-[10px] font-medium text-muted">{a.hint}</span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="تم تصویر">
              <div className="flex flex-wrap gap-2">
                {CARD_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    title={t.label}
                    className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-bold transition"
                    style={{
                      background: theme === t.id ? "rgba(167,139,250,0.18)" : "var(--glass-bg)",
                      border: `1px solid ${theme === t.id ? "rgba(167,139,250,0.6)" : "var(--glass-border)"}`,
                    }}
                  >
                    <span
                      className="h-4 w-4 rounded-full"
                      style={{ background: `linear-gradient(135deg, ${t.bg[1]}, ${t.accent})`, border: "1px solid rgba(255,255,255,0.25)" }}
                    />
                    {t.label}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="بازهٔ برایند">
              <div className="grid grid-cols-4 gap-2">
                {CARD_PERIODS.map((pd) => (
                  <button
                    key={pd.id}
                    type="button"
                    onClick={() => setPeriod(pd.id)}
                    className="rounded-xl px-2 py-2 text-xs font-bold transition"
                    style={{
                      background: period === pd.id ? "rgba(52,211,153,0.18)" : "var(--glass-bg)",
                      border: `1px solid ${period === pd.id ? "rgba(52,211,153,0.55)" : "var(--glass-border)"}`,
                    }}
                  >
                    {pd.label}
                  </button>
                ))}
              </div>
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-bold">
                <input type="checkbox" checked={showMargin} onChange={(e) => setShowMargin(e.target.checked)} className="h-4 w-4 accent-sky-400" />
                نمایش مارجین (موجودی) روی تصویر
              </label>
            </Section>

            <Section title="خروجی و اشتراک‌گذاری">
              <div className="grid grid-cols-2 gap-2">
                <Action onClick={() => doDownload()} disabled={busy} tint="56,189,248" icon="⬇️" label="دانلود تصویر" />
                <Action onClick={doCopy} disabled={busy} tint="167,139,250" icon="📋" label="کپی تصویر" />
                <Action onClick={doTelegram} disabled={busy} tint="41,171,226" icon="✈️" label="اشتراک در تلگرام" />
                <Action onClick={() => doInstagram("post")} disabled={busy} tint="244,114,182" icon="📷" label="پست اینستاگرام" />
                <Action onClick={() => doInstagram("story")} disabled={busy} tint="251,146,60" icon="⚡" label="استوری اینستاگرام" />
                <Action onClick={() => doDownload("9x16")} disabled={busy} tint="148,163,184" icon="📱" label="دانلود نسخهٔ استوری" />
              </div>
              <p className="mt-2 text-[11px] leading-5 text-muted">
                در موبایل، دکمه‌های اشتراک‌گذاری مستقیم پنجرهٔ اشتراک گوشی را باز می‌کنند؛ در دسکتاپ
                تصویر دانلود و کپشن کپی می‌شود.
              </p>
            </Section>
          </div>

          {/* ── پیش‌نمایش ── */}
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-full overflow-hidden rounded-2xl p-3"
              style={{ background: "rgba(0,0,0,0.25)", border: "1px solid var(--glass-border)" }}
            >
              <canvas
                ref={canvasRef}
                className="mx-auto block h-auto w-full rounded-xl"
                style={{ maxHeight: vertical ? "70vh" : "56vh", width: "auto", maxWidth: "100%" }}
              />
            </div>
            <div className="text-xs text-muted">
              کیفیت خروجی: {def.w * 2} × {def.h * 2} پیکسل (۲ برابر)
            </div>
            {toast && (
              <div
                className="w-full rounded-xl px-4 py-2.5 text-center text-sm font-bold"
                style={{ background: "rgba(52,211,153,0.14)", border: "1px solid rgba(52,211,153,0.4)" }}
              >
                {toast}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-3.5" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
      <div className="mb-2.5 text-xs font-extrabold text-muted">{title}</div>
      {children}
    </div>
  );
}

function Action({
  onClick,
  disabled,
  tint,
  icon,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  tint: string;
  icon: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-extrabold transition-all hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
      style={{ background: `rgba(${tint},0.16)`, border: `1px solid rgba(${tint},0.45)`, color: `rgb(${tint})` }}
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}
