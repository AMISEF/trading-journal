"use client";

/**
 * Settings page (/settings).
 *
 * Two tabs:
 *   1. «اطلاعات کاربری» — the full, read-only profile plus password change.
 *   2. «تنظیمات API»  — one brand-coloured card per supported exchange
 *      (Toobit / LBank / XT / Ourbit / WEEX). Saving a key starts the 60-second
 *      automatic import of the user's futures trades into the journal.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DiamondIcon } from "@/components/DiamondIcon";
import { ExchangeLogo } from "@/components/ExchangeLogo";
import { Button } from "@/components/ui";
import { exchangesApi, passwordApi, type ExchangeStatus } from "@/lib/api";
import { EXCHANGES } from "@/lib/exchanges";
import { effectiveTier, limitsOf, PLAN_BY_TIER } from "@/lib/plans";
import { useAuth } from "@/store/auth";

type TabKey = "profile" | "api";

const TABS: { key: TabKey; label: string }[] = [
  { key: "profile", label: "اطلاعات کاربری" },
  { key: "api", label: "تنظیمات API" },
];

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsInner />
    </AppShell>
  );
}

function SettingsInner() {
  const [tab, setTab] = useState<TabKey>("profile");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center gap-2">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <h1 className="text-xl font-bold">تنظیمات</h1>
      </div>

      {/* Tab bar */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px rounded-t-lg px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? "border-b-2 border-primary text-primary"
                : "text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "profile" && <ProfileTab />}
      {tab === "api" && <ApiTab />}
    </div>
  );
}

/* ========================================================================== */
/* Tab 1 — اطلاعات کاربری (read-only) + تغییر رمز                              */
/* ========================================================================== */

const ROLE_FA: Record<string, string> = {
  admin: "مدیر (Admin)",
  user: "کاربرِ عادی",
};

const GROUP_FA: Record<string, string> = {
  CRYPTO_SMART: "تیم کریپتو اسمارت",
  LIVE_TRADE: "لایو ترید",
};

function faDate(value?: string | null, withTime = false): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return withTime ? d.toLocaleString("fa-IR") : d.toLocaleDateString("fa-IR");
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2.5 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}

function ProfileTab() {
  const authUser = useAuth((s) => s.user);
  const user = authUser as any;
  // `effectiveTier` already downgrades an expired paid plan to bronze, exactly
  // like the server does, so the badge never over-promises.
  const plan = PLAN_BY_TIER[effectiveTier(authUser)];

  const groups: string[] = Array.isArray(user?.userGroups)
    ? user.userGroups
    : user?.userGroup
    ? [user.userGroup]
    : [];

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "—";

  return (
    <div className="space-y-4">
      <div className="tj-card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold">اطلاعات حساب کاربری</h2>
          <span className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] text-muted">
            فقط نمایشی — قابل ویرایش نیست
          </span>
        </div>

        <div className="grid gap-x-8 sm:grid-cols-2">
          <div>
            <Row label="نام و نام خانوادگی">{fullName}</Row>
            <Row label="نام کاربری">
              <span dir="ltr" className="font-mono">{user?.username || "—"}</span>
            </Row>
            <Row label="ایمیل">
              <span dir="ltr" className="font-mono">{user?.email || "—"}</span>
            </Row>
            <Row label="شمارهٔ تماس">
              <span dir="ltr" className="font-mono">{user?.phone || "—"}</span>
            </Row>
            <Row label="نقش کاربر">{ROLE_FA[user?.role] || user?.role || "—"}</Row>
          </div>

          <div>
            <Row label="پلن اشتراک">
              <span style={{ color: plan.hex }}>{plan.name}</span>
            </Row>
            <Row label="انقضای اشتراک">{faDate(user?.subscriptionExpiresAt)}</Row>
            <Row label="سرمایهٔ ثبت‌شده">
              <span dir="ltr" className="font-mono">
                {typeof user?.walletMargin === "number" ? `$${user.walletMargin.toLocaleString("en-US")}` : "—"}
              </span>
            </Row>
            <Row label="موجودی فعلی">
              <span dir="ltr" className="font-mono">
                {typeof user?.currentBalance === "number" ? `$${user.currentBalance.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}
              </span>
            </Row>
            <Row label="عضویت در تیم">
              {groups.length
                ? groups.map((g) => GROUP_FA[g] || g).join("، ")
                : "—"}
            </Row>
          </div>
        </div>

        <div className="mt-2 grid gap-x-8 sm:grid-cols-2">
          <Row label="تاریخ عضویت">{faDate(user?.createdAt, true)}</Row>
          <Row label="آخرین ریست سرمایه">{faDate(user?.capitalResetDate, true)}</Row>
        </div>
      </div>

      <PasswordCard />
    </div>
  );
}

function PasswordCard() {
  const user = useAuth((s) => s.user);
  const [step, setStep] = useState<"request" | "verify">("request");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function requestCode() {
    setError("");
    setMsg("");
    setBusy(true);
    try {
      const r = await passwordApi.requestChangeCode();
      setStep("verify");
      setMsg(`کد تأیید به ایمیلِ ${r.email} ارسال شد.`);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "ارسال کد ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setError("");
    if (!code.trim()) return setError("کد تأیید را وارد کنید.");
    if (pw.length < 6) return setError("رمز عبور باید حداقل ۶ کاراکتر باشد.");
    if (pw !== pw2) return setError("رمز عبور و تکرارِ آن یکسان نیستند.");
    setBusy(true);
    try {
      await passwordApi.change(code.trim(), pw);
      setMsg("رمز عبور با موفقیت تغییر کرد.");
      setStep("request");
      setCode("");
      setPw("");
      setPw2("");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "تغییر رمز ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tj-card space-y-5 p-5">
      <div>
        <h2 className="text-base font-bold">تغییر رمز ورود</h2>
        <p className="mt-1 text-sm text-muted">
          برای تغییرِ رمز، ابتدا یک کدِ تأیید به ایمیلِ حسابِ شما
          {user?.email ? ` (${user.email})` : ""} ارسال می‌شود؛ سپس با واردکردنِ کد،
          رمز جدید را تنظیم کنید.
        </p>
      </div>

      {step === "request" ? (
        <div className="flex justify-end">
          <Button onClick={requestCode} disabled={busy}>
            {busy ? "در حال ارسال…" : "ارسالِ کدِ تأیید به ایمیل"}
          </Button>
        </div>
      ) : (
        <>
          <div>
            <label className="tj-label" htmlFor="pwCode">کد تأیید</label>
            <input id="pwCode" dir="ltr" inputMode="numeric" value={code}
              onChange={(e) => setCode(e.target.value)} placeholder="------"
              className="tj-input text-center font-mono tracking-widest" />
          </div>
          <div>
            <label className="tj-label" htmlFor="pwNew">رمز عبور جدید</label>
            <input id="pwNew" type="password" autoComplete="new-password" value={pw}
              onChange={(e) => setPw(e.target.value)} className="tj-input" />
          </div>
          <div>
            <label className="tj-label" htmlFor="pwNew2">تکرارِ رمز عبور جدید</label>
            <input id="pwNew2" type="password" autoComplete="new-password" value={pw2}
              onChange={(e) => setPw2(e.target.value)} className="tj-input" />
          </div>
          <div className="flex items-center justify-between">
            <button type="button" onClick={requestCode} disabled={busy}
              className="text-xs text-muted hover:text-primary">
              ارسالِ دوبارهٔ کد
            </button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "در حال ثبت…" : "تغییرِ رمز"}
            </Button>
          </div>
        </>
      )}

      {msg && <p className="text-sm text-primary">{msg}</p>}
      {error && <p className="text-sm text-loss">{error}</p>}
    </div>
  );
}

/* ========================================================================== */
/* Tab 2 — تنظیمات API                                                          */
/* ========================================================================== */

function ApiTab() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const [rows, setRows] = useState<ExchangeStatus[] | null>(null);
  const [loadError, setLoadError] = useState("");

  // Diamond-only feature. `limitsOf` mirrors the backend quotas (and downgrades
  // an expired subscription), so this gate can never drift from the API.
  const canUse = limitsOf(user).toobit;
  const diamond = PLAN_BY_TIER.diamond;

  const load = useCallback(async () => {
    try {
      const data = await exchangesApi.list();
      setRows(data.exchanges);
      setLoadError("");
    } catch (e: any) {
      setLoadError(e?.response?.data?.detail || "دریافتِ وضعیتِ صرافی‌ها ناموفق بود.");
    }
  }, []);

  useEffect(() => {
    if (canUse) void load();
  }, [canUse, load]);

  if (!canUse) {
    return (
      <div className="tj-card space-y-4 p-5" style={{ borderColor: `rgba(${diamond.tint},0.35)` }}>
        <h2 className="text-base font-bold">اتصال پنل به صرافی‌ها</h2>
        <div
          className="flex items-start gap-4 rounded-xl p-4 text-sm leading-7"
          style={{
            border: `1px solid rgba(${diamond.tint},0.4)`,
            background: `rgba(${diamond.tint},0.10)`,
          }}
        >
          <DiamondIcon size={44} id="settings-api-lock" className="shrink-0" />
          <div>
            <div className="mb-1 font-bold" style={{ color: diamond.hex }}>
              این قابلیت مخصوصِ پلن الماسی است
            </div>
            <p className="text-muted">
              اتصالِ پنل به صرافی‌های Toobit، LBank، XT، Ourbit و WEEX و ثبتِ خودکارِ
              معاملاتِ فیوچرز فقط برای کاربرانِ پلنِ{" "}
              <b style={{ color: diamond.hex }}>الماسی</b> فعال است؛ در این پلن معاملاتِ
              شما هر ۶۰ ثانیه خودکار واردِ ژورنال می‌شوند و دیگر نیازی به ثبتِ دستی نیست.
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => router.push("/subscription")}>ارتقا به الماسی</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Security notice — applies to every exchange. */}
      <div className="rounded-lg border border-border bg-surface-2 p-4 text-sm leading-7">
        <div className="mb-1 flex items-center gap-2 font-bold text-primary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          محرمانگی و امنیت
        </div>
        <p>
          کلیدهای API شما به‌صورتِ <b>رمزنگاری‌شده (Encrypted)</b> ذخیره می‌شوند، هرگز
          به‌صورتِ متنِ ساده نمایش داده نمی‌شوند و در دسترسِ هیچ‌کس قرار نمی‌گیرند.
        </p>
        <p className="mt-2">
          هنگامِ ساختِ کلید در صرافی، فقط دسترسیِ <b>خواندن (Read)</b> روی بخشِ Futures را
          فعال کنید؛ دسترسیِ برداشت (Withdraw) لازم نیست و نباید فعال شود. تیمِ پشتیبانی
          هرگز کلید API شما را درخواست نمی‌کند.
        </p>
      </div>

      {loadError && <p className="text-sm text-loss">{loadError}</p>}
      {rows === null && !loadError && (
        <div className="tj-card p-5 text-sm text-muted">در حال بارگذاری…</div>
      )}

      {rows?.map((row) => (
        <ExchangeCard key={row.slug} row={row} onChanged={setRows} />
      ))}
    </div>
  );
}

function ExchangeCard({
  row,
  onChanged,
}: {
  row: ExchangeStatus;
  onChanged: (rows: ExchangeStatus[]) => void;
}) {
  const brand = (EXCHANGES as any)[row.slug] ?? {
    hex: row.color,
    tint: "120,120,120",
    hint: "",
  };
  const [open, setOpen] = useState(!row.connected);
  const [apiKey, setApiKey] = useState("");
  const [secret, setSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setError("");
    setMsg("");
    if (!apiKey.trim()) return setError("API Key را وارد کنید.");
    if (!secret.trim()) return setError("Secret Key را وارد کنید.");
    if (row.needsPassphrase && !passphrase.trim())
      return setError("برای این صرافی وارد کردن Passphrase الزامی است.");
    setBusy("save");
    try {
      const res = await exchangesApi.saveKey(row.slug, {
        apiKey: apiKey.trim(),
        secretKey: secret.trim(),
        passphrase: passphrase.trim() || undefined,
      });
      onChanged(res.exchanges);
      setApiKey("");
      setSecret("");
      setPassphrase("");
      setOpen(false);
      setMsg("کلید ذخیره شد. همگام‌سازیِ خودکار هر ۶۰ ثانیه انجام می‌شود.");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "ذخیرهٔ کلید ناموفق بود.");
    } finally {
      setBusy("");
    }
  }

  async function syncNow() {
    setError("");
    setMsg("");
    setBusy("sync");
    try {
      const res = await exchangesApi.syncNow(row.slug);
      onChanged(res.exchanges);
      setMsg(`همگام‌سازی انجام شد (${res.touched} معامله به‌روزرسانی شد).`);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "همگام‌سازی ناموفق بود.");
    } finally {
      setBusy("");
    }
  }

  async function removeKey() {
    if (!window.confirm(`کلید API صرافی ${row.label} حذف شود؟ همگام‌سازیِ خودکار متوقف می‌شود.`)) return;
    setBusy("delete");
    try {
      const res = await exchangesApi.deleteKey(row.slug);
      onChanged(res.exchanges);
      setOpen(true);
      setMsg("کلید API حذف شد.");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "حذف کلید ناموفق بود.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div
      className="tj-card overflow-hidden p-0"
      style={{ borderColor: `rgba(${brand.tint},0.45)` }}
    >
      {/* Brand header */}
      <div
        className="flex flex-wrap items-center gap-3 p-4"
        style={{ background: `rgba(${brand.tint},0.10)`, borderBottom: `1px solid rgba(${brand.tint},0.3)` }}
      >
        <ExchangeLogo slug={row.slug} size={38} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span dir="ltr" className="text-sm font-bold" style={{ color: brand.hex }}>
              {row.label}
            </span>
            {row.connected ? (
              <span
                className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                style={{ color: brand.hex, background: `rgba(${brand.tint},0.18)` }}
              >
                متصل
              </span>
            ) : (
              <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted">
                متصل نیست
              </span>
            )}
          </div>
          {row.connected && row.apiKeyMasked && (
            <div className="mt-0.5 text-xs text-muted">
              کلیدِ ثبت‌شده: <span dir="ltr" className="font-mono">{row.apiKeyMasked}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {row.connected && (
            <button
              type="button"
              onClick={syncNow}
              disabled={busy !== ""}
              className="rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-50"
              style={{
                color: brand.hex,
                background: `rgba(${brand.tint},0.15)`,
                border: `1px solid rgba(${brand.tint},0.45)`,
              }}
            >
              {busy === "sync" ? "در حال همگام‌سازی…" : "همگام‌سازیِ الان"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((s) => !s)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:text-text"
          >
            {open ? "بستن" : row.connected ? "تغییر کلید" : "اتصال"}
          </button>
        </div>
      </div>

      {/* Status line */}
      {row.connected && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-border/60 px-4 py-2 text-xs text-muted">
          <span>
            آخرین همگام‌سازی: {row.syncedAt ? new Date(row.syncedAt).toLocaleString("fa-IR") : "—"}
          </span>
          <span>همگام‌سازیِ خودکار هر ۶۰ ثانیه</span>
          {row.syncError && <span className="text-loss">خطا: {row.syncError}</span>}
        </div>
      )}

      {/* Key form */}
      {open && (
        <div className="space-y-4 p-4">
          {brand.hint && <p className="text-xs text-muted">{brand.hint}</p>}

          <div>
            <label className="tj-label" htmlFor={`${row.slug}-key`}>API Key</label>
            <div className="relative">
              <input
                id={`${row.slug}-key`}
                dir="ltr"
                type={showKey ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API Key"
                className="tj-input pr-16 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-muted hover:text-primary"
              >
                {showKey ? "پنهان" : "نمایش"}
              </button>
            </div>
          </div>

          <div>
            <label className="tj-label" htmlFor={`${row.slug}-secret`}>Secret Key</label>
            <div className="relative">
              <input
                id={`${row.slug}-secret`}
                dir="ltr"
                type={showSecret ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={row.hasSecret ? "ثبت‌شده — برای تغییر، Secret جدید را وارد کنید" : "Secret Key"}
                className="tj-input pr-16 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-muted hover:text-primary"
              >
                {showSecret ? "پنهان" : "نمایش"}
              </button>
            </div>
          </div>

          {row.needsPassphrase && (
            <div>
              <label className="tj-label" htmlFor={`${row.slug}-pass`}>Passphrase</label>
              <input
                id={`${row.slug}-pass`}
                dir="ltr"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Passphrase"
                className="tj-input font-mono"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {row.connected && (
                <button
                  type="button"
                  onClick={removeKey}
                  disabled={busy !== ""}
                  className="rounded-lg border border-loss/40 bg-loss/10 px-3 py-1.5 text-xs font-bold text-loss transition hover:bg-loss/20 disabled:opacity-50"
                >
                  {busy === "delete" ? "در حال حذف…" : "حذف کلید API"}
                </button>
              )}
              {row.docsUrl && (
                <a
                  href={row.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition hover:text-primary"
                >
                  مستندات API
                </a>
              )}
            </div>
            <Button onClick={save} disabled={busy !== ""}>
              {busy === "save" ? "در حال ذخیره…" : "ذخیره"}
            </Button>
          </div>
        </div>
      )}

      {(msg || error) && (
        <div className="px-4 pb-4">
          {msg && <p className="text-xs" style={{ color: brand.hex }}>{msg}</p>}
          {error && <p className="text-xs text-loss">{error}</p>}
        </div>
      )}
    </div>
  );
}
