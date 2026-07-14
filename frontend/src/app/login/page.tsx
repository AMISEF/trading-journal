"use client";

/** Login page. username may be email. On success: store session + go to dashboard.
 *  Also hosts the "forgot password" flow (email a code, then set a new password). */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui";
import { AuthLayout } from "@/components/AuthLayout";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "forgot">("login");
  return mode === "login" ? (
    <LoginForm onForgot={() => setMode("forgot")} />
  ) : (
    <ForgotForm onBack={() => setMode("login")} />
  );
}

function LoginForm({ onForgot }: { onForgot: () => void }) {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authApi.login(username, password);
      setSession(res.accessToken, res.user);
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "نام کاربری یا رمز عبور نادرست است.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="ورود به حساب">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="tj-label">نام کاربری یا ایمیل</label>
          <input className="tj-input" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="tj-label">رمز عبور</label>
          <input type="password" className="tj-input" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="text-left">
          <button type="button" onClick={onForgot} className="text-xs text-muted hover:text-primary">
            فراموشی رمز ورود؟
          </button>
        </div>
        {error && <p className="text-sm text-loss">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "در حال ورود…" : "ورود"}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        حساب ندارید؟{" "}
        <Link href="/register" className="text-primary font-medium">
          ثبت‌نام
        </Link>
      </p>
    </AuthLayout>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function sendCode() {
    setError("");
    setMsg("");
    if (!email.trim()) return setError("ایمیل خود را وارد کنید.");
    setBusy(true);
    try {
      await authApi.forgotPassword(email.trim());
      setStep("reset");
      setMsg("اگر این ایمیل ثبت شده باشد، کدِ تأیید برایتان ارسال شد.");
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
      await authApi.resetPassword(email.trim(), code.trim(), pw);
      setMsg("رمز عبور تغییر کرد. اکنون می‌توانید وارد شوید.");
      setTimeout(onBack, 1200);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "تغییر رمز ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="بازیابی رمز عبور">
      {step === "email" ? (
        <div className="space-y-4">
          <div>
            <label className="tj-label">ایمیل حساب</label>
            <input className="tj-input" dir="ltr" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          {msg && <p className="text-sm text-primary">{msg}</p>}
          {error && <p className="text-sm text-loss">{error}</p>}
          <Button onClick={sendCode} className="w-full" disabled={busy}>
            {busy ? "در حال ارسال…" : "ارسالِ کدِ تأیید"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="tj-label">کد تأیید</label>
            <input className="tj-input text-center font-mono tracking-widest" dir="ltr"
              inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="------" autoFocus />
          </div>
          <div>
            <label className="tj-label">رمز عبور جدید</label>
            <input className="tj-input" type="password" dir="ltr" autoComplete="new-password"
              value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div>
            <label className="tj-label">تکرارِ رمز عبور جدید</label>
            <input className="tj-input" type="password" dir="ltr" autoComplete="new-password"
              value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>
          {msg && <p className="text-sm text-primary">{msg}</p>}
          {error && <p className="text-sm text-loss">{error}</p>}
          <div className="flex items-center justify-between">
            <button type="button" onClick={sendCode} disabled={busy}
              className="text-xs text-muted hover:text-primary">ارسالِ دوبارهٔ کد</button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "در حال ثبت…" : "تغییرِ رمز"}
            </Button>
          </div>
        </div>
      )}
      <p className="mt-5 text-center text-sm text-muted">
        <button type="button" onClick={onBack} className="text-primary font-medium">
          بازگشت به ورود
        </button>
      </p>
    </AuthLayout>
  );
}
