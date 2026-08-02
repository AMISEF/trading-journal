"use client";

/**
 * Registration page. On success: store session + go to dashboard.
 *
 * دعوت دوستان: اگر کاربر با لینک ?ref=CODE آمده باشد، کد خوانده، در
 * localStorage نگه داشته و داخل فرم نمایش داده می‌شود؛ همچنین کاربر می‌تواند
 * کد معرف را دستی وارد یا ویرایش کند.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";
import { REF_KEY } from "@/lib/referrals";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui";
import { AuthLayout } from "@/components/AuthLayout";

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    phone: "",
    password: "",
    passwordConfirm: "",
  });
  const [refCode, setRefCode] = useState("");
  const [fromLink, setFromLink] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Read ?ref= once on mount (window.location keeps this out of Suspense).
  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("ref");
      const code = (fromUrl || window.localStorage.getItem(REF_KEY) || "").trim();
      if (code) {
        setRefCode(code);
        setFromLink(Boolean(fromUrl));
        window.localStorage.setItem(REF_KEY, code);
      }
    } catch {
      /* private mode / SSR guard */
    }
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onRefChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const code = e.target.value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16);
    setRefCode(code);
    try {
      if (code) window.localStorage.setItem(REF_KEY, code);
      else window.localStorage.removeItem(REF_KEY);
    } catch {
      /* ignore */
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^09\d{9}$/.test(form.phone.trim())) {
      setError("شماره تماس باید به صورت 09121234567 و ۱۱ رقم باشد.");
      return;
    }
    if (form.password !== form.passwordConfirm) {
      setError("رمز عبور و تکرار آن یکسان نیستند.");
      return;
    }
    const code = refCode.trim();
    if (code && code.length < 3) {
      setError("کد معرف باید حداقل ۳ کاراکتر باشد (یا خالی بماند).");
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.register({
        ...form,
        ...(code ? { referralCode: code } : {}),
      });
      setSession(res.accessToken, res.user);
      try {
        window.localStorage.removeItem(REF_KEY);
      } catch {
        /* ignore */
      }
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "ثبت‌نام ناموفق بود.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="ساخت حساب جدید">
      {fromLink && refCode && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 backdrop-blur">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="8" width="18" height="4" rx="1" />
              <path d="M12 8v13M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
              <path d="M12 8S9.5 3 7.5 3a2.5 2.5 0 0 0 0 5M12 8s2.5-5 4.5-5a2.5 2.5 0 0 1 0 5" />
            </svg>
          </span>
          <div className="text-xs leading-5">
            <div className="font-bold">با لینک دعوت وارد شدی 🎉</div>
            <div className="text-muted">
              کد دعوت <span dir="ltr" className="font-mono text-primary">{refCode}</span> ثبت شد؛ بعد از ثبت ۳ معامله، جایزهٔ دعوت‌کننده‌ات فعال می‌شود.
            </div>
          </div>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="tj-label">نام</label>
            <input className="tj-input" value={form.firstName} onChange={set("firstName")} required />
          </div>
          <div>
            <label className="tj-label">نام خانوادگی</label>
            <input className="tj-input" value={form.lastName} onChange={set("lastName")} required />
          </div>
        </div>
        <div>
          <label className="tj-label">نام کاربری</label>
          <input className="tj-input" dir="ltr" value={form.username} onChange={set("username")} required />
        </div>
        <div>
          <label className="tj-label">ایمیل</label>
          <input type="email" className="tj-input" dir="ltr" value={form.email} onChange={set("email")} required />
        </div>
        <div>
          <label className="tj-label">شماره تماس</label>
          <input
            type="tel"
            className="tj-input"
            dir="ltr"
            inputMode="numeric"
            maxLength={11}
            pattern="09[0-9]{9}"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/[^\d]/g, "") }))}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="tj-label">رمز عبور</label>
            <input type="password" className="tj-input" dir="ltr" value={form.password} onChange={set("password")} required />
          </div>
          <div>
            <label className="tj-label">تکرار رمز</label>
            <input type="password" className="tj-input" dir="ltr" value={form.passwordConfirm} onChange={set("passwordConfirm")} required />
          </div>
        </div>
        <div>
          <label className="tj-label">
            کد معرف <span className="text-muted">(اختیاری)</span>
          </label>
          <div className="relative">
            <input
              className="tj-input pl-24 font-mono tracking-widest"
              dir="ltr"
              placeholder="CRYPTOSMART"
              maxLength={16}
              value={refCode}
              onChange={onRefChange}
              autoComplete="off"
              spellCheck={false}
            />
            {refCode.length >= 3 && (
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 rounded-lg bg-primary/15 px-2 py-1 text-[10px] font-bold text-primary">
                ثبت می‌شود
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-5 text-muted">
            اگر کسی شما را دعوت کرده، کد معرفش را اینجا بنویسید (مثلاً Cryptosmart). بزرگ یا کوچک بودن حروف مهم نیست.
          </p>
        </div>
        {error && <p className="text-sm text-loss">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "در حال ثبت‌نام…" : "ثبت‌نام"}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        قبلاً ثبت‌نام کرده‌اید؟{" "}
        <Link href="/login" className="text-primary font-medium">
          ورود
        </Link>
      </p>
    </AuthLayout>
  );
}
