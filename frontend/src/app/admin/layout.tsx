"use client";

/** نوار ناوبری پنل مدیریت — دسترسی سریع به بخش‌های ادمین. */

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "\u062f\u0627\u0634\u0628\u0648\u0631\u062f" },
  { href: "/admin/users", label: "\u06a9\u0627\u0631\u0628\u0631\u0627\u0646" },
  { href: "/admin/trades", label: "\u0645\u0639\u0627\u0645\u0644\u0627\u062a" },
  { href: "/admin/funnel", label: "\u0642\u06cc\u0641 \u0645\u062d\u0635\u0648\u0644" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";

  return (
    <>
      <nav
        className="sticky top-0 z-30 w-full backdrop-blur"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2">
          {LINKS.map((l) => {
            const active =
              l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition"
                style={
                  active
                    ? { background: "var(--primary)", color: "#06121d", fontWeight: 700 }
                    : { color: "var(--muted)" }
                }
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {children}
    </>
  );
}
