"use client";

/**
 * Admin panel: user management (create, edit, delete, reset password)
 * and per-user dashboard view.
 */
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Badge, Spinner } from "@/components/ui";
import { adminApi, type AdminUserCreatePayload, type AdminUserUpdatePayload } from "@/lib/api";
import { formatUsd, faNum } from "@/lib/format";
import { formatJalaliDate } from "@/lib/jalali";
import type { User, DashboardData } from "@/lib/types";

export default function AdminPage() {
  return (
    <AppShell requireAdmin>
      <AdminUsers />
    </AppShell>
  );
}

type Modal =
  | { kind: "create" }
  | { kind: "edit"; user: User }
  | { kind: "delete"; user: User }
  | { kind: "reset"; user: User }
  | { kind: "dashboard"; user: User };

function AdminUsers() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<Modal | null>(null);

  const load = () =>
    adminApi
      .users()
      .then(setUsers)
      .catch(() => setError("بارگذاری کاربران با خطا مواجه شد."));

  useEffect(() => { load(); }, []);

  const close = () => setModal(null);
  const refresh = () => { close(); load(); };

  if (error) return <p className="text-loss">{error}</p>;
  if (!users) return <Spinner label="در حال بارگذاری کاربران…" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">پنل ادمین — کاربران</h1>
        <button
          type="button"
          onClick={() => setModal({ kind: "create" })}
          className="rounded-xl bg-primary px-5 py-2 text-sm font-medium text-white shadow hover:opacity-90"
        >
          + کاربر جدید
        </button>
      </div>

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
              <th className="p-3">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border/60 hover:bg-surface-2">
                <td className="p-3 font-medium">{u.firstName} {u.lastName}</td>
                <td className="p-3" dir="ltr">@{u.username}</td>
                <td className="p-3" dir="ltr">{u.email}</td>
                <td className="p-3">
                  <Badge tone={u.role === "ADMIN" ? "neutral" : "muted"}>{u.role}</Badge>
                </td>
                <td className="p-3" dir="ltr">{formatUsd(u.currentBalance)}</td>
                <td className="p-3">{formatJalaliDate(u.createdAt)}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    <ActionBtn color="blue" onClick={() => setModal({ kind: "dashboard", user: u })}>
                      داشبورد
                    </ActionBtn>
                    <ActionBtn color="indigo" onClick={() => setModal({ kind: "edit", user: u })}>
                      ویرایش
                    </ActionBtn>
                    <ActionBtn color="amber" onClick={() => setModal({ kind: "reset", user: u })}>
                      رمز
                    </ActionBtn>
                    <ActionBtn color="red" onClick={() => setModal({ kind: "delete", user: u })}>
                      حذف
                    </ActionBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {modal?.kind === "create" && <CreateUserModal onDone={refresh} onClose={close} />}
      {modal?.kind === "edit" && <EditUserModal user={modal.user} onDone={refresh} onClose={close} />}
      {modal?.kind === "delete" && <DeleteUserModal user={modal.user} onDone={refresh} onClose={close} />}
      {modal?.kind === "reset" && <ResetPasswordModal user={modal.user} onClose={close} />}
      {modal?.kind === "dashboard" && <UserDashboardModal user={modal.user} onClose={close} />}
    </div>
  );
}

/* ─── Small action button ─────────────────────────────────────────────────── */
function ActionBtn({
  children,
  onClick,
  color,
}: {
  children: React.ReactNode;
  onClick: () => void;
  color: "blue" | "indigo" | "amber" | "red";
}) {
  const cls = {
    blue:   "border-blue-400/40 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20",
    indigo: "border-indigo-400/40 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20",
    amber:  "border-amber-400/40 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20",
    red:    "border-red-400/40 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20",
  }[color];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${cls}`}
    >
      {children}
    </button>
  );
}

/* ─── Modal shell ─────────────────────────────────────────────────────────── */
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative tj-card w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl"
        style={{ maxWidth: wide ? 800 : 480 }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-text text-xl leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ─── Form field helper ───────────────────────────────────────────────────── */
function FField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="tj-label">{label}</label>
      {children}
    </div>
  );
}

/* ─── Create user modal ───────────────────────────────────────────────────── */
function CreateUserModal({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [form, setForm] = useState<AdminUserCreatePayload>({
    email: "", username: "", firstName: "", lastName: "",
    password: "", role: "TRADER", walletMargin: 0,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: keyof AdminUserCreatePayload) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    setErr("");
    if (!form.email || !form.username || !form.firstName || !form.lastName || !form.password) {
      setErr("همه فیلدها الزامی هستند."); return;
    }
    setSaving(true);
    try {
      await adminApi.createUser({ ...form, walletMargin: Number(form.walletMargin) });
      onDone();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErr(msg || "خطا در ایجاد کاربر");
      setSaving(false);
    }
  };

  return (
    <Modal title="کاربر جدید" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FField label="نام"><input className="tj-input" value={form.firstName} onChange={set("firstName")} /></FField>
          <FField label="نام خانوادگی"><input className="tj-input" value={form.lastName} onChange={set("lastName")} /></FField>
        </div>
        <FField label="نام کاربری"><input className="tj-input" dir="ltr" value={form.username} onChange={set("username")} /></FField>
        <FField label="ایمیل"><input className="tj-input" type="email" dir="ltr" value={form.email} onChange={set("email")} /></FField>
        <FField label="رمز عبور"><input className="tj-input" type="password" dir="ltr" value={form.password} onChange={set("password")} /></FField>
        <div className="grid grid-cols-2 gap-4">
          <FField label="نقش">
            <select className="tj-input" value={form.role} onChange={set("role")}>
              <option value="TRADER">TRADER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </FField>
          <FField label="موجودی اولیه ($)">
            <input className="tj-input" type="number" dir="ltr" value={form.walletMargin}
              onChange={(e) => setForm((p) => ({ ...p, walletMargin: parseFloat(e.target.value) || 0 }))} />
          </FField>
        </div>
        {err && <p className="text-sm text-loss">{err}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" disabled={saving} onClick={save}
            className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "در حال ذخیره…" : "ایجاد کاربر"}
          </button>
          <button type="button" onClick={onClose}
            className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted hover:bg-surface-2">
            انصراف
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Edit user modal ─────────────────────────────────────────────────────── */
function EditUserModal({ user, onDone, onClose }: { user: User; onDone: () => void; onClose: () => void }) {
  const [form, setForm] = useState<AdminUserUpdatePayload>({
    email: user.email, username: user.username,
    firstName: user.firstName, lastName: user.lastName,
    role: user.role, walletMargin: user.walletMargin,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: keyof AdminUserUpdatePayload) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    setErr("");
    setSaving(true);
    try {
      await adminApi.updateUser(user.id, { ...form, walletMargin: Number(form.walletMargin) });
      onDone();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErr(msg || "خطا در ویرایش کاربر");
      setSaving(false);
    }
  };

  return (
    <Modal title={`ویرایش: ${user.firstName} ${user.lastName}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FField label="نام"><input className="tj-input" value={form.firstName} onChange={set("firstName")} /></FField>
          <FField label="نام خانوادگی"><input className="tj-input" value={form.lastName} onChange={set("lastName")} /></FField>
        </div>
        <FField label="نام کاربری"><input className="tj-input" dir="ltr" value={form.username} onChange={set("username")} /></FField>
        <FField label="ایمیل"><input className="tj-input" type="email" dir="ltr" value={form.email} onChange={set("email")} /></FField>
        <div className="grid grid-cols-2 gap-4">
          <FField label="نقش">
            <select className="tj-input" value={form.role} onChange={set("role")}>
              <option value="TRADER">TRADER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </FField>
          <FField label="موجودی اولیه ($)">
            <input className="tj-input" type="number" dir="ltr" value={form.walletMargin}
              onChange={(e) => setForm((p) => ({ ...p, walletMargin: parseFloat(e.target.value) || 0 }))} />
          </FField>
        </div>
        {err && <p className="text-sm text-loss">{err}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" disabled={saving} onClick={save}
            className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "در حال ذخیره…" : "ذخیره تغییرات"}
          </button>
          <button type="button" onClick={onClose}
            className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted hover:bg-surface-2">
            انصراف
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Delete user modal ───────────────────────────────────────────────────── */
function DeleteUserModal({ user, onDone, onClose }: { user: User; onDone: () => void; onClose: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState("");

  const confirm = async () => {
    setDeleting(true);
    try {
      await adminApi.deleteUser(user.id);
      onDone();
    } catch {
      setErr("حذف کاربر با خطا مواجه شد.");
      setDeleting(false);
    }
  };

  return (
    <Modal title="حذف کاربر" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm">
          آیا مطمئن هستید که می‌خواهید کاربر{" "}
          <span className="font-bold">{user.firstName} {user.lastName}</span> را حذف کنید؟
          این عمل برگشت‌پذیر نیست و تمام معاملات کاربر نیز حذف می‌شوند.
        </p>
        {err && <p className="text-sm text-loss">{err}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" disabled={deleting} onClick={confirm}
            className="flex-1 rounded-xl bg-loss py-2.5 text-sm font-medium text-white disabled:opacity-50">
            {deleting ? "در حال حذف…" : "بله، حذف شود"}
          </button>
          <button type="button" onClick={onClose}
            className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted hover:bg-surface-2">
            انصراف
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Reset password modal ────────────────────────────────────────────────── */
function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setErr("");
    if (!pw) { setErr("رمز عبور جدید را وارد کنید."); return; }
    if (pw !== pw2) { setErr("رمز عبور و تکرار آن یکسان نیستند."); return; }
    setSaving(true);
    try {
      await adminApi.resetPassword(user.id, pw);
      setDone(true);
    } catch {
      setErr("تغییر رمز با خطا مواجه شد.");
      setSaving(false);
    }
  };

  return (
    <Modal title={`بازنشانی رمز: ${user.firstName} ${user.lastName}`} onClose={onClose}>
      {done ? (
        <div className="space-y-4 text-center">
          <p className="text-profit font-medium">رمز عبور با موفقیت تغییر یافت.</p>
          <button type="button" onClick={onClose}
            className="rounded-xl bg-primary px-6 py-2 text-sm font-medium text-white">بستن</button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            از آنجا که رمزها به صورت هش شده ذخیره می‌شوند، امکان مشاهده رمز قدیمی وجود ندارد.
            می‌توانید رمز جدیدی تعیین کنید.
          </p>
          <FField label="رمز عبور جدید">
            <input className="tj-input" type="password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} />
          </FField>
          <FField label="تکرار رمز عبور">
            <input className="tj-input" type="password" dir="ltr" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </FField>
          {err && <p className="text-sm text-loss">{err}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" disabled={saving} onClick={save}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "در حال تغییر…" : "تغییر رمز عبور"}
            </button>
            <button type="button" onClick={onClose}
              className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted hover:bg-surface-2">
              انصراف
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ─── User dashboard modal ────────────────────────────────────────────────── */
function UserDashboardModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    adminApi
      .userDashboard(user.id)
      .then(setData)
      .catch(() => setErr("بارگذاری داشبورد با خطا مواجه شد."));
  }, [user.id]);

  return (
    <Modal wide title={`داشبورد: ${user.firstName} ${user.lastName}`} onClose={onClose}>
      {err ? (
        <p className="text-sm text-loss">{err}</p>
      ) : !data ? (
        <Spinner label="در حال بارگذاری…" />
      ) : (
        <div className="space-y-6">
          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiBox label="موجودی فعلی" value={formatUsd(data.currentBalance)} color="94,234,212" />
            <KpiBox label="کل معاملات" value={faNum(data.tradeCount)} color="167,139,250" />
            <KpiBox label="نرخ موفقیت" value={data.winRate != null ? `${faNum(Math.round(data.winRate * 100))}٪` : "—"} color="52,211,153" />
            <KpiBox label="میانگین RR" value={data.avgRR != null ? faNum(Number(data.avgRR.toFixed(2))) : "—"} color="251,191,36" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiBox label="معاملات بسته" value={faNum(data.closedCount)} color="125,211,252" />
            <KpiBox label="ضریب سود" value={data.profitFactor != null ? faNum(Number(data.profitFactor.toFixed(2))) : "—"} color="244,114,182" />
            <KpiBox label="انضباط چک‌لیست" value={data.checklistDiscipline != null ? `${faNum(Math.round(data.checklistDiscipline * 100))}٪` : "—"} color="251,146,160" />
          </div>

          {/* Direction stats */}
          <div className="tj-card p-4">
            <h3 className="mb-3 font-semibold text-sm">آمار جهت معاملات</h3>
            <div className="flex gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-profit">{faNum(data.directionStats.long)}</div>
                <div className="text-xs text-muted mt-1">لانگ</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-loss">{faNum(data.directionStats.short)}</div>
                <div className="text-xs text-muted mt-1">شورت</div>
              </div>
            </div>
          </div>

          {/* Top symbols */}
          {data.topSymbols.length > 0 && (
            <div className="tj-card p-4">
              <h3 className="mb-3 font-semibold text-sm">برترین نمادها</h3>
              <div className="space-y-2">
                {data.topSymbols.map((s) => (
                  <div key={s.symbol} className="flex items-center justify-between text-sm">
                    <span dir="ltr" className="font-medium">{s.symbol}</span>
                    <div className="flex gap-4 text-muted text-xs">
                      <span>{faNum(s.count)} معامله</span>
                      <span className={s.pnl >= 0 ? "text-profit font-medium" : "text-loss font-medium"}>
                        {formatUsd(s.pnl)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function KpiBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="rounded-2xl p-4 text-center"
      style={{
        background: `linear-gradient(135deg, rgba(${color},0.18) 0%, rgba(${color},0.05) 100%)`,
        border: `1px solid rgba(${color},0.28)`,
      }}
    >
      <div className="text-xl font-bold" dir="ltr">{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}
