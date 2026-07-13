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
import { settingsApi } from "@/lib/api";
import { useAuth } from "@/store/auth";

type TabKey = "toobit";

const TABS: { key: TabKey; label: string }[] = [
  { key: "toobit", label: "مدیریت API توبیت" },
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

  const hasKey = !!user?.hasToobitApiKey;
  const hasSecret = !!user?.hasToobitSecretKey;
  const connected = hasKey && hasSecret;

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

  return (
    <div className="tj-card space-y-5 p-5">
      <div>
        <h2 className="text-base font-bold">مدیریت API توبیت</h2>
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
