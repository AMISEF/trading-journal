"use client";

/**
 * Settings page (/settings).
 * Tabbed settings screen. First tab: Toobit API key management — the user pastes
 * their Toobit "Access API Key", saves it (stored encrypted server-side), and is
 * sent back to the dashboard. Built with a tab bar so more tabs can be added.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui";
import { settingsApi, passwordApi } from "@/lib/api";
import { useAuth } from "@/store/auth";

type TabKey = "toobit" | "password";

const TABS: { key: TabKey; label: string }[] = [
  { key: "toobit", label: "اتصال به صرافی توبیت" },
  { key: "password", label: "تغییر رمز ورود" },
];

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsInner />
    </AppShell>
  );
}

function SettingsInner() {
  const [tab, setTab] = useState<TabKey>("toobit");

  return (
    <div className="mx-auto max-w-2xl">
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

      {tab === "toobit" && <ToobitTab />}
      {tab === "password" && <PasswordTab />}
    </div>
  );
}

function ToobitTab() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);

  const [value, setValue] = useState("");
  const [secret, setSecret] = useState("");
  const [show, setShow] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [busy, setBusy] = useState("");

  const hasKey = !!user?.hasToobitApiKey;
  const hasSecret = !!user?.hasToobitSecretKey;
  const connected = hasKey && hasSecret;

  // Toobit connection is a gold-only feature.
  const tier = (user?.subscriptionTier ?? "bronze").toLowerCase();
  const isGold =
    tier === "gold" &&
    (!user?.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > new Date());

  async function syncNow() {
    setSyncMsg("");
    setSyncing(true);
    try {
      const updated = await settingsApi.syncToobitNow();
      setUser(updated);
      setSyncMsg("همگام‌سازی انجام شد. معاملاتِ فیوچرزِ شما در ژورنال به‌روزرسانی شد.");
    } catch (e: any) {
      setSyncMsg(e?.response?.data?.detail || "همگام‌سازی ناموفق بود.");
    } finally {
      setSyncing(false);
    }
  }

  async function removeKey() {
    if (!window.confirm("کلید API توبیت حذف شود؟ همگام‌سازیِ خودکار متوقف می‌شود.")) return;
    setBusy("delete");
    try {
      const updated = await settingsApi.deleteToobitKey();
      setUser(updated);
      setValue("");
      setSecret("");
      setSyncMsg("کلید API حذف شد.");
    } catch {
      setSyncMsg("حذف کلید ناموفق بود.");
    } finally {
      setBusy("");
    }
  }

  async function save() {
    setError("");
    if (!value.trim()) {
      setError("لطفاً Access API Key را وارد کنید.");
      return;
    }
    if (!secret.trim() && !hasSecret) {
      setError("برای دریافتِ خودکارِ معاملاتِ فیوچرز، Secret Key هم لازم است.");
      return;
    }
    setSaving(true);
    try {
      const updated = await settingsApi.saveToobitKey(value.trim(), secret.trim() || undefined);
      setUser(updated);
      // ذخیره شد → بازگشت به داشبورد
      router.push("/dashboard");
    } catch (e: any) {
      setError(
        e?.response?.data?.detail ||
          "ذخیرهٔ کلید API ناموفق بود. لطفاً دوباره تلاش کنید."
      );
      setSaving(false);
    }
  }

  if (!isGold) {
    return (
      <div className="tj-card space-y-4 p-5">
        <h2 className="text-base font-bold">اتصال پنل به صرافی توبیت</h2>
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm leading-7 text-amber-700 dark:text-amber-300">
          <div className="mb-1 font-bold">این قابلیت مخصوصِ پلن طلایی است</div>
          <p>
            اتصالِ پنل به صرافیِ توبیت و ثبتِ خودکارِ معاملاتِ فیوچرز فقط برای کاربرانِ
            پلنِ <b>طلایی</b> فعال است. برای استفاده، اشتراکِ خود را به طلایی ارتقا دهید.
          </p>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => router.push("/subscription")}>ارتقا به طلایی</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="tj-card space-y-5 p-5">
      <div>
        <h2 className="text-base font-bold">اتصال پنل به صرافی توبیت</h2>
        <p className="mt-1 text-sm text-muted">
          کلید <span dir="ltr" className="font-mono">Access API Key</span> اکانتِ
          صرافیِ توبیتِ خود را که از توبیت دریافت کرده‌اید، در کادرِ زیر وارد کنید و
          دکمهٔ ذخیره را بزنید.
        </p>
      </div>

      {/* هشدارِ رسمیِ امنیتی */}
      <div className="rounded-lg border border-border bg-surface-2 p-4 text-sm leading-7">
        <div className="mb-1 flex items-center gap-2 font-bold text-primary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          محرمانگی و امنیت
        </div>
        <p>
          کلید API شما نزدِ ما کاملاً محفوظ است و به‌صورتِ <b>رمزنگاری‌شده
          (Encrypted)</b> ذخیره می‌شود؛ این کلید هرگز به‌صورتِ متنِ ساده نمایش داده
          نمی‌شود و در دسترسِ هیچ‌کس قرار نمی‌گیرد.
        </p>
        <p className="mt-2">
          لطفاً کلید API خود را تحتِ <b>هیچ شرایطی</b> برای هیچ شخص یا مجموعه‌ای
          ارسال نکنید. تیمِ پشتیبانیِ ما نیز هرگز کلید API شما را از شما درخواست
          نخواهد کرد.
        </p>
      </div>

      {hasKey && (
        <div className="rounded-lg border border-border bg-surface p-3 text-sm">
          <span className="text-muted">کلیدِ ثبت‌شدهٔ فعلی: </span>
          <span dir="ltr" className="font-mono">
            {user?.toobitApiKeyMasked || "••••••••"}
          </span>
          <span className="text-muted"> — با ثبتِ کلیدِ جدید جایگزین می‌شود.</span>
        </div>
      )}

      {connected && (
        <div className="rounded-lg border border-sky-400/40 bg-sky-400/10 p-4 text-sm">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-bold text-sky-500">اتصال به توبیت فعال است</span>
            <button
              type="button"
              onClick={syncNow}
              disabled={syncing}
              className="rounded-lg border border-sky-400/50 bg-sky-400/15 px-3 py-1.5 text-xs font-bold text-sky-600 transition hover:bg-sky-400/25 disabled:opacity-50"
            >
              {syncing ? "در حال همگام‌سازی…" : "همگام‌سازیِ الان"}
            </button>
          </div>
          <p className="text-muted">
            معاملاتِ فیوچرزِ شما هر ۶۰ ثانیه به‌صورتِ خودکار در ژورنال ثبت می‌شوند
            (با برچسبِ آبیِ <span dir="ltr">toobit</span>).
          </p>
          {user?.toobitSyncedAt && (
            <p className="mt-1 text-xs text-muted">
              آخرین همگام‌سازی: {new Date(user.toobitSyncedAt).toLocaleString("fa-IR")}
            </p>
          )}
          {user?.toobitSyncError && (
            <p className="mt-1 text-xs text-loss">خطای آخرین همگام‌سازی: {user.toobitSyncError}</p>
          )}
          {syncMsg && <p className="mt-2 text-xs text-sky-600">{syncMsg}</p>}
          <div className="mt-3 flex flex-wrap gap-2 border-t border-sky-400/20 pt-3">
            <button
              type="button"
              onClick={removeKey}
              disabled={busy !== ""}
              className="rounded-lg border border-loss/40 bg-loss/10 px-3 py-1.5 text-xs font-bold text-loss transition hover:bg-loss/20 disabled:opacity-50"
            >
              {busy === "delete" ? "در حال حذف…" : "حذف کلید API"}
            </button>
          </div>
        </div>
      )}

      <div>
        <label className="tj-label" htmlFor="toobitKey">
          Access API Key
        </label>
        <div className="relative">
          <input
            id="toobitKey"
            dir="ltr"
            type={show ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Access API Key"
            className="tj-input pr-16 font-mono"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-muted hover:text-primary"
          >
            {show ? "پنهان" : "نمایش"}
          </button>
        </div>
      </div>

      <div>
        <label className="tj-label" htmlFor="toobitSecret">
          Secret Key
        </label>
        <div className="relative">
          <input
            id="toobitSecret"
            dir="ltr"
            type={showSecret ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={hasSecret ? "ثبت‌شده — برای تغییر، Secret جدید را وارد کنید" : "Secret Key"}
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
        <p className="mt-1 text-xs text-muted">
          Secret Key برای دریافتِ خودکارِ معاملاتِ فیوچرزِ شما لازم است. هنگامِ
          ساختِ کلید در توبیت، دسترسیِ <b>Read</b> روی بخشِ Futures کافی است
          (دسترسیِ برداشت/Withdraw لازم نیست و نباید فعال شود).
        </p>
      </div>

      {error && <p className="text-sm text-loss">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? "در حال ذخیره…" : "ذخیره"}
        </Button>
      </div>
    </div>
  );
}

function PasswordTab() {
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
