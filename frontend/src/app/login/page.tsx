"use client";

/** Login page. username may be email. On success: store session + go to dashboard. */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui";
import { AuthLayout } from "@/components/AuthLayout";

export default function LoginPage() {
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
      setError(
        err?.response?.data?.detail || "نام کاربری یا رمز عبور نادرست است."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="ورود به حساب">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="tj-label">نام کاربری یا ایمیل</label>
          <input
            className="tj-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div>
          <label className="tj-label">رمز عبور</label>
          <input
            type="password"
            className="tj-input"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
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

