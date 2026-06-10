"use client";

/** Admin: list of all users. Click a user to see their journals. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Badge, Spinner } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { formatUsd } from "@/lib/format";
import { formatJalaliDate } from "@/lib/jalali";
import type { User } from "@/lib/types";

export default function AdminPage() {
  return (
    <AppShell requireAdmin>
      <AdminUsers />
    </AppShell>
  );
}

function AdminUsers() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi
      .users()
      .then(setUsers)
      .catch(() => setError("بارگذاری کاربران با خطا مواجه شد."));
  }, []);

  if (error) return <p className="text-loss">{error}</p>;
  if (!users) return <Spinner label="در حال بارگذاری کاربران…" />;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">پنل ادمین — کاربران</h1>
      <div className="tj-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted">
            <tr className="border-b border-border text-right">
              <th className="p-3">نام</th>
              <th className="p-3">نام کاربری</th>
              <th className="p-3">ایمیل</th>
              <th className="p-3">نقش</th>
              <th className="p-3">موجودی</th>
              <th className="p-3">عضویت</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border/60 hover:bg-surface-2">
                <td className="p-3">
                  <Link href={`/admin/users/${u.id}`} className="font-medium text-primary">
                    {u.firstName} {u.lastName}
                  </Link>
                </td>
                <td className="p-3" dir="ltr">@{u.username}</td>
                <td className="p-3" dir="ltr">{u.email}</td>
                <td className="p-3">
                  <Badge tone={u.role === "ADMIN" ? "neutral" : "muted"}>{u.role}</Badge>
                </td>
                <td className="p-3" dir="ltr">{formatUsd(u.currentBalance)}</td>
                <td className="p-3">{formatJalaliDate(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
