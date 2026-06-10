"use client";

/**
 * Authenticated app shell: a sidebar (nav + balance + logout) and a content area.
 * Wraps every page behind the auth guard.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/store/auth";
import { authApi } from "@/lib/api";
import { AuthGuard } from "./AuthGuard";
import { ThemeToggle } from "./ThemeToggle";
import { WalletModal } from "./WalletModal";
import { formatUsd } from "@/lib/format";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "داشبورد",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" />
        <rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" />
      </svg>
    ),
  },
  {
    href: "/journals",
    label: "ژورنال‌ها",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    href: "/admin",
    label: "ادمین",
    adminOnly: true,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" />
      </svg>
    ),
  },
];

export function AppShell({
  children,
  requireAdmin = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
}) {
  return (
    <AuthGuard requireAdmin={requireAdmin}>
      <Shell>{children}</Shell>
    </AuthGuard>
  );
}

function TopupModal({ onClose }: { onClose: () => void }) {
  const { user, setUser } = useAuth();
  const [value, setValue] = useState(String(user?.walletMargin ?? 1000));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const amount = Number(value) || 1000;
    setSaving(true);
    try { const u = await authApi.setWallet(amount); setUser(u); } catch {}
    setSaving(false);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="tj-card w-full max-w-sm p-6">
        <h2 className="mb-3 text-lg font-bold">شارژ/تغییر موجودی</h2>
        <input type="number" className="tj-input" dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} min={0} />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">انصراف</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "ذخیره…" : "ذخیره"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // mobile drawer
  const [topup, setTopup] = useState(false);

  const items = NAV.filter((n) => !n.adminOnly || user?.role === "ADMIN");

  const SidebarContent = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-white font-bold">
          CS
        </div>
        <div>
          <div className="text-sm font-bold leading-tight">کریپتو اسمارت</div>
          <div className="text-xs text-muted">ژورنال تریدینگ</div>
        </div>
      </div>

      {/* Balance card */}
      <div className="mx-4 mb-4 tj-card p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted">موجودی فعلی</div>
          <button
            onClick={() => setTopup(true)}
            className="grid h-6 w-6 place-items-center rounded-md bg-primary-soft text-primary hover:opacity-80"
            title="شارژ / تغییر موجودی"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        <div className="mt-1 text-xl font-bold text-profit" dir="ltr">
          {formatUsd(user?.currentBalance)}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${
                active
                  ? "bg-primary text-white"
                  : "text-text hover:bg-surface-2"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer: user + logout */}
      <div className="border-t border-border p-4">
        <div className="mb-3 text-sm">
          <div className="font-medium">
            {user?.firstName} {user?.lastName}
          </div>
          <div className="text-xs text-muted">@{user?.username}</div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm text-loss hover:opacity-90"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          خروج
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg text-text">
      <WalletModal />
      {topup && <TopupModal onClose={() => setTopup(false)} />}

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-64 border-l border-border bg-surface md:block">
        {SidebarContent}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 right-0 w-64 border-l border-border bg-surface">
            {SidebarContent}
          </aside>
        </div>
      )}

      {/* Content */}
      <div className="md:pr-64">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface/90 px-4 py-3 backdrop-blur md:justify-end md:px-8">
          <button
            className="md:hidden rounded-lg border border-border bg-surface-2 p-2"
            onClick={() => setOpen(true)}
            aria-label="منو"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <ThemeToggle />
        </header>

        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
