"use client";

/**
 * Client-side auth guard.
 * - Boots the auth store (reads token + fetches /auth/me).
 * - Redirects to /login if there's no authenticated user.
 * - Optionally enforces ADMIN role.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/store/auth";
import { Spinner } from "./ui";

export function AuthGuard({
  children,
  requireAdmin = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
}) {
  const { user, loading, init } = useAuth();
  const router = useRouter();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (requireAdmin && user.role !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [loading, user, requireAdmin, router]);

  if (loading || !user || (requireAdmin && user.role !== "ADMIN")) {
    return <Spinner label="در حال بارگذاری…" />;
  }
  return <>{children}</>;
}
