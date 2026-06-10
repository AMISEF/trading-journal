"use client";

/**
 * "حجم ولت فیوچرز" modal.
 * Shown once after first login if the user hasn't explicitly set a wallet size.
 * We detect "unset" via a localStorage flag (so it only nags once per browser).
 * Default is 1000 if the user skips.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/store/auth";
import { authApi } from "@/lib/api";
import { Button } from "./ui";

export function WalletModal() {
  const { user, setUser } = useAuth();
  const [show, setShow] = useState(false);
  const [value, setValue] = useState("1000");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const seenKey = `tj_wallet_prompted_${user.id}`;
    // Only show on fresh registrations (createdAt within 2 minutes) and not yet seen.
    const seen = localStorage.getItem(seenKey) === "1";
    if (seen) return;
    const age = Date.now() - new Date(user.createdAt).getTime();
    if (age < 2 * 60 * 1000) {
      setValue(String(user.walletMargin || 1000));
      setShow(true);
    } else {
      // Existing user logging in — mark as seen so modal never nags.
      localStorage.setItem(seenKey, "1");
    }
  }, [user?.id]); // only re-run when the logged-in user changes

  const finish = () => {
    if (user) localStorage.setItem(`tj_wallet_prompted_${user.id}`, "1");
    setShow(false);
  };

  const save = async () => {
    const amount = Number(value) || 1000;
    setSaving(true);
    try {
      const updated = await authApi.setWallet(amount);
      setUser(updated);
    } catch {
      // ignore — keep UX simple
    } finally {
      setSaving(false);
      finish();
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="tj-card w-full max-w-md p-6">
        <h2 className="text-lg font-bold">حجم ولت فیوچرز</h2>
        <p className="mt-2 text-sm text-muted">
          مبلغ کل سرمایه‌ای که برای معاملات فیوچرز در نظر گرفته‌اید را وارد کنید.
          این مقدار مبنای محاسبه‌ی حجم و ریسک معاملات است. اگر رد کنید، مقدار
          پیش‌فرض ۱۰۰۰ دلار در نظر گرفته می‌شود.
        </p>
        <div className="mt-4">
          <label className="tj-label">مبلغ (دلار)</label>
          <input
            type="number"
            className="tj-input"
            dir="ltr"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            min={0}
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={finish} disabled={saving}>
            رد کردن (۱۰۰۰)
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "در حال ذخیره…" : "ذخیره"}
          </Button>
        </div>
      </div>
    </div>
  );
}
