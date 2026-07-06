"use client";

/** Registration page. On success: store session + go to dashboard. */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";
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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

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
    setLoading(true);
    try {
      const res = await authApi.register(form);
      setSession(res.accessToken, res.user);
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "ثبت‌نام ناموفق بود.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="ساخت حساب جدید">
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
