"use client";

/**
 * Journal list (/journals).
 * Table with columns: checkbox, #, نماد, جهت, VOL, TF, تاریخ, زمان, R:R انتظار,
 * R:R کسب, نتیجه, تگ‌ها, وضعیت.
 * Features: search, status/tag filter, sort, group, table/card toggle, bulk delete.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Paginator, Spinner, StatusDot, usePagination } from "@/components/ui";
import { exportUrl, tradesApi, publicApi } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { DemoTradesPanel } from "@/components/DemoTradesPanel";
import type { Trade, TradeStatus } from "@/lib/types";
import {
  faNum,
  formatPct,
  formatRatio,
  formatSignedUsd,
  formatUsd,
  pnlColorClass,
} from "@/lib/format";
import { formatJalaliDate, formatTime } from "@/lib/jalali";

type SortKey = "number" | "symbol" | "pnl" | "rrExpected";
type GroupKey = "none" | "status" | "direction" | "symbol";

// ─── Glass / pastel design tokens (shared with the dashboard look) ────────────
const TINTS = {
  mint: "94,234,212",
  violet: "167,139,250",
  sky: "125,211,252",
  rose: "244,114,182",
} as const;

/** Neutral frosted-glass surface. */
function glassStyle(): React.CSSProperties {
  return {
    background: "var(--glass-bg)",
    backdropFilter: "blur(20px) saturate(160%)",
    WebkitBackdropFilter: "blur(20px) saturate(160%)",
    border: "1px solid var(--glass-border)",
    boxShadow: "0 20px 56px -24px rgba(56,189,248,0.22), inset 0 1px 0 rgba(255,255,255,0.08)",
  };
}

/** Frosted glass with a soft pastel wash of the given "R,G,B" tint. */
function glassTint(rgb: string): React.CSSProperties {
  return {
    background: `linear-gradient(150deg, rgba(${rgb},0.16) 0%, rgba(${rgb},0.05) 48%, var(--glass-bg) 100%)`,
    border: `1px solid rgba(${rgb},0.24)`,
    backdropFilter: "blur(18px) saturate(155%)",
    WebkitBackdropFilter: "blur(18px) saturate(155%)",
    boxShadow: `0 16px 48px -20px rgba(${rgb},0.4), inset 0 1px 0 rgba(255,255,255,0.10)`,
  };
}

const TAG_BG = [
  "bg-blue-100 text-blue-700",
  "bg-green-100 text-green-700",
  "bg-yellow-100 text-yellow-700",
  "bg-red-100 text-red-700",
  "bg-purple-100 text-purple-700",
  "bg-pink-100 text-pink-700",
  "bg-indigo-100 text-indigo-700",
  "bg-orange-100 text-orange-700",
];

function tagColorClass(tag: string, colorMap: Map<string, number>): string {
  const idx = colorMap.get(tag);
  if (idx !== undefined) return TAG_BG[idx % TAG_BG.length];
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xffffffff;
  return TAG_BG[Math.abs(h) % TAG_BG.length];
}

export default function JournalsPage() {
  return (
    <AppShell>
      <JournalsInner />
    </AppShell>
  );
}

const DEMO_KEY = "tj_demo_on";

function JournalsInner() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  // Demo mode mirrors the dashboard toggle: when on, show the showcase account's
  // journals read-only (clicking a row opens the full read-only detail).
  const [demoOn, setDemoOn] = useState(false);
  const [demoTrades, setDemoTrades] = useState<Trade[] | null>(null);

  useEffect(() => {
    const on = typeof window !== "undefined" && localStorage.getItem(DEMO_KEY) === "1";
    if (!on) return;
    setDemoOn(true);
    publicApi.demoTrades().then(setDemoTrades).catch(() => setDemoTrades([]));
  }, []);

  const exitDemo = () => {
    if (typeof window !== "undefined") localStorage.removeItem(DEMO_KEY);
    setDemoOn(false);
    setDemoTrades(null);
  };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TradeStatus | "ALL">("ALL");
  const [tagFilter, setTagFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("number");
  const [sortDesc, setSortDesc] = useState(true);
  const [group, setGroup] = useState<GroupKey>("none");
  const [view, setView] = useState<"table" | "card">("table");

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagColorMap, setTagColorMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    tradesApi
      .list()
      .then(setTrades)
      .catch(() => setError("بارگذاری ژورنال‌ها با خطا مواجه شد."));
  }, []);

  useEffect(() => {
    if (!user) return;
    try {
      const key = `tj_global_tags_${user.id}`;
      const stored = JSON.parse(localStorage.getItem(key) || "[]") as { name: string; colorIdx: number }[];
      setTagColorMap(new Map(stored.map((t) => [t.name, t.colorIdx])));
    } catch {}
  }, [user?.id]);

  const createTrade = async () => {
    setCreating(true);
    try {
      const t = await tradesApi.create();
      router.push(`/journals/${t.id}`);
    } catch {
      setError("ساخت معامله جدید ناموفق بود.");
      setCreating(false);
    }
  };

  const bulkDelete = async () => {
    if (!confirm(`${selected.size} معامله حذف شود؟`)) return;
    // Delete sequentially (not in parallel) so the server's renumbering
    // logic runs one at a time and produces a consistent gap-free sequence.
    const ids = [...selected];
    for (const id of ids) await tradesApi.remove(id);
    // Re-fetch so trade numbers are up to date after renumbering.
    const refreshed = await tradesApi.list();
    setTrades(refreshed);
    setSelected(new Set());
  };

  // All unique tags across trades for the filter dropdown
  const allTags = useMemo(() => {
    if (!trades) return [];
    const s = new Set<string>();
    trades.forEach((t) => (t.tags ?? []).forEach((tag) => s.add(tag)));
    return [...s].sort();
  }, [trades]);

  const filtered = useMemo(() => {
    if (!trades) return [];
    let rows = trades.filter((t) => {
      const matchSearch =
        !search ||
        t.symbol?.toLowerCase().includes(search.toLowerCase()) ||
        String(t.number).includes(search);
      const matchStatus = statusFilter === "ALL" || t.status === statusFilter;
      const matchTag =
        !tagFilter || (t.tags ?? []).includes(tagFilter);
      return matchSearch && matchStatus && matchTag;
    });
    rows = [...rows].sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      if (sortKey === "symbol") {
        av = a.symbol || "";
        bv = b.symbol || "";
      } else if (sortKey === "pnl") {
        av = a.calc?.realizedPnl ?? a.realizedPnl ?? 0;
        bv = b.calc?.realizedPnl ?? b.realizedPnl ?? 0;
      } else if (sortKey === "rrExpected") {
        av = a.calc?.rrExpected ?? a.rrExpected ?? 0;
        bv = b.calc?.rrExpected ?? b.rrExpected ?? 0;
      } else {
        av = a.number;
        bv = b.number;
      }
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : av - (bv as number);
      return sortDesc ? -cmp : cmp;
    });
    return rows;
  }, [trades, search, statusFilter, tagFilter, sortKey, sortDesc]);

  const pagination = usePagination(filtered, "journals");

  // Reset to page 1 whenever filters change
  // (filtering re-creates `filtered`, so pagination.slice auto-adjusts via safePage)

  const groups = useMemo(() => {
    // Paginate the filtered list first, then group the visible page
    const pageRows = pagination.slice;
    if (group === "none") return [{ key: "all", label: "", rows: pageRows }];
    const map = new Map<string, Trade[]>();
    for (const t of pageRows) {
      let k = "—";
      if (group === "status") k = statusLabel(t.status);
      else if (group === "direction") k = t.direction;
      else if (group === "symbol") k = t.symbol || "—";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return [...map.entries()].map(([key, rows]) => ({ key, label: key, rows }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.slice, group]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = (rows: Trade[]) => {
    const ids = rows.map((r) => r.id);
    const allSel = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allSel ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  // ── Demo mode: show the showcase account's journals read-only ──
  if (demoOn) {
    return (
      <div className="relative space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1
              className="text-3xl font-extrabold tracking-tight"
              style={{
                backgroundImage: "linear-gradient(120deg, rgb(167,139,250), rgb(125,211,252))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              ژورنال‌ها
            </h1>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "rgba(167,139,250,0.16)", color: "rgb(167,139,250)" }}>دمو</span>
          </div>
          <button
            type="button"
            onClick={exitDemo}
            className="rounded-xl px-4 py-2 text-sm font-bold text-white transition-all hover:-translate-y-0.5 active:scale-95"
            style={{ background: "linear-gradient(120deg, rgb(248,68,68), rgb(219,39,39))", boxShadow: "0 12px 28px -12px rgba(248,68,68,0.8)" }}
          >
            ✕ حذف دمو
          </button>
        </div>

        <div
          className="flex flex-wrap items-center gap-3 rounded-2xl px-5 py-3.5"
          style={{ background: "linear-gradient(150deg, rgba(167,139,250,0.16), rgba(125,211,252,0.06) 60%, var(--glass-bg))", border: "1px solid rgba(167,139,250,0.3)" }}
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl text-lg" style={{ background: "rgba(167,139,250,0.2)" }}>🎬</span>
          <div className="text-sm">
            <div className="font-bold">حالت دمو — نمونهٔ یک ژورنالِ کامل</div>
            <div className="text-xs text-muted">این معاملاتِ نمونه‌اند تا ببینید ژورنال چطور پر می‌شود. روی هر ردیف بزنید تا جزئیات کامل باز شود.</div>
          </div>
        </div>

        {demoTrades === null ? (
          <Spinner label="در حال بارگذاری دمو…" />
        ) : (
          <DemoTradesPanel trades={demoTrades} />
        )}
      </div>
    );
  }

  if (error) return <p className="text-loss">{error}</p>;
  if (!trades) return <Spinner label="در حال بارگذاری ژورنال‌ها…" />;

  return (
    <div className="relative space-y-5">
      {/* Ambient pastel glow backdrop */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="animate-blob absolute -right-32 top-0 h-[460px] w-[460px] rounded-full blur-[120px]" style={{ background: `rgba(${TINTS.sky},0.14)` }} />
        <div className="animate-blob-slow absolute -left-32 top-1/3 h-[420px] w-[420px] rounded-full blur-[120px]" style={{ background: `rgba(${TINTS.violet},0.12)` }} />
        <div className="animate-blob absolute bottom-0 right-1/4 h-[380px] w-[380px] rounded-full blur-[120px]" style={{ background: `rgba(${TINTS.mint},0.10)` }} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1
            className="text-3xl font-extrabold tracking-tight"
            style={{
              backgroundImage: `linear-gradient(120deg, rgb(${TINTS.sky}), rgb(${TINTS.mint}), rgb(${TINTS.violet}))`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            ژورنال‌ها
          </h1>
          <span className="h-2.5 w-2.5 rounded-full animate-pulse-dot" style={{ background: `rgb(${TINTS.mint})` }} />
        </div>
        <div className="flex flex-wrap gap-2">
          {selected.size > 0 && (
            <Button variant="danger" onClick={bulkDelete}>
              حذف {faNum(selected.size)} مورد
            </Button>
          )}
          <a href={exportUrl()} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost">خروجی اکسل</Button>
          </a>
          <Button onClick={createTrade} disabled={creating}>
            {creating ? "در حال ساخت…" : "+ ثبت معامله جدید"}
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-3 rounded-3xl p-4" style={glassStyle()}>
        <div className="min-w-[160px] flex-1">
          <label className="tj-label">جستجو</label>
          <input
            className="tj-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="نماد یا شماره"
          />
        </div>
        <div>
          <label className="tj-label">وضعیت</label>
          <select className="tj-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="ALL">همه</option>
            <option value="PLANNED">برنامه‌ریزی‌شده</option>
            <option value="OPEN">باز</option>
            <option value="CLOSED">بسته‌شده</option>
          </select>
        </div>
        {allTags.length > 0 && (
          <div>
            <label className="tj-label">تگ</label>
            <select className="tj-input" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
              <option value="">همه تگ‌ها</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="tj-label">مرتب‌سازی</label>
          <select className="tj-input" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="number">شماره</option>
            <option value="symbol">نماد</option>
            <option value="pnl">نتیجه</option>
            <option value="rrExpected">R:R مورد انتظار</option>
          </select>
        </div>
        <div>
          <label className="tj-label">گروه‌بندی</label>
          <select className="tj-input" value={group} onChange={(e) => setGroup(e.target.value as GroupKey)}>
            <option value="none">بدون گروه</option>
            <option value="status">وضعیت</option>
            <option value="direction">جهت</option>
            <option value="symbol">نماد</option>
          </select>
        </div>
        <Button variant="ghost" onClick={() => setSortDesc((d) => !d)}>
          {sortDesc ? "نزولی ↓" : "صعودی ↑"}
        </Button>
        <Button variant="ghost" onClick={() => setView((v) => (v === "table" ? "card" : "table"))}>
          {view === "table" ? "نمای کارت" : "نمای جدول"}
        </Button>
      </div>

      {/* Paginator top */}
      <Paginator
        page={pagination.page}
        totalPages={pagination.totalPages}
        pageSize={pagination.pageSize}
        total={pagination.total}
        start={pagination.start}
        setPage={pagination.setPage}
        setPageSize={pagination.setPageSize}
      />

      {filtered.length === 0 && (
        <div className="rounded-3xl p-10 text-center text-muted" style={glassStyle()}>
          معامله‌ای یافت نشد.
        </div>
      )}

      {groups.map((g) => (
        <div key={g.key} className="space-y-3">
          {g.label && (
            <h2 className="px-1 text-sm font-bold text-muted">
              {g.label} ({faNum(g.rows.length)})
            </h2>
          )}
          {view === "table" ? (
            <TradeTable
              rows={g.rows}
              selected={selected}
              onToggle={toggleSelect}
              onToggleAll={() => toggleAll(g.rows)}
              onOpen={(id) => router.push(`/journals/${id}`)}
              colorMap={tagColorMap}
            />
          ) : (
            <TradeCards rows={g.rows} onOpen={(id) => router.push(`/journals/${id}`)} colorMap={tagColorMap} />
          )}
        </div>
      ))}

      {/* Paginator bottom */}
      {filtered.length > 0 && (
        <Paginator
          page={pagination.page}
          totalPages={pagination.totalPages}
          pageSize={pagination.pageSize}
          total={pagination.total}
          start={pagination.start}
          setPage={pagination.setPage}
          setPageSize={pagination.setPageSize}
        />
      )}
    </div>
  );
}

function statusLabel(s: TradeStatus) {
  return s === "PLANNED" ? "برنامه‌ریزی‌شده" : s === "OPEN" ? "باز" : "بسته‌شده";
}

function pnlOf(t: Trade) {
  // Imported Toobit trades carry the exchange's exact realized PnL (fees
  // included); prefer it over the price-derived recomputation.
  if (t.source === "toobit" && t.realizedPnl != null) return t.realizedPnl;
  return t.calc?.realizedPnl ?? t.realizedPnl ?? null;
}
function pctOf(t: Trade) {
  return t.calc?.resultPct ?? null;
}

function DirCell({ dir }: { dir: Trade["direction"] }) {
  return dir === "LONG" ? <Badge tone="profit">Long</Badge> : <Badge tone="loss">Short</Badge>;
}

function TagChips({ tags, colorMap }: { tags: string[]; colorMap: Map<string, number> }) {
  if (!tags || tags.length === 0) return <span className="text-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className={`rounded-full px-2 py-0.5 text-xs font-medium ${tagColorClass(t, colorMap)}`}>{t}</span>
      ))}
    </div>
  );
}

function TradeTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
  colorMap,
}: {
  rows: Trade[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
  colorMap: Map<string, number>;
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className="overflow-x-auto rounded-3xl" style={glassStyle()}>
      <table className="w-full text-sm">
        <thead className="text-muted">
          <tr className="border-b border-white/10 text-center">
            <th className="p-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                className="cursor-pointer"
              />
            </th>
            <th className="p-3">#</th>
            <th className="p-3">ش.معامله</th>
            <th className="p-3">نماد</th>
            <th className="p-3">جهت</th>
            <th className="p-3">VOL</th>
            <th className="p-3">TF</th>
            <th className="p-3">تاریخ</th>
            <th className="p-3">زمان</th>
            <th className="p-3">R:R انتظار</th>
            <th className="p-3">R:R کسب</th>
            <th className="p-3">نتیجه</th>
            <th className="p-3">تگ‌ها</th>
            <th className="p-3">وضعیت</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr
              key={t.id}
              className={`border-b border-white/5 transition-colors ${
                t.isLocked
                  ? "opacity-60 bg-gray-100 dark:bg-gray-800/40"
                  : selected.has(t.id)
                    ? "bg-primary-soft"
                    : t.source === "toobit"
                      ? "bg-sky-400/10 hover:bg-sky-400/20 backdrop-blur-sm"
                      : "hover:bg-white/5"
              }`}
            >
              <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                {!t.isLocked && (
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => onToggle(t.id)}
                    className="cursor-pointer"
                  />
                )}
              </td>
              <td className="cursor-pointer p-3 text-center font-medium" onClick={() => onOpen(t.id)}>
                {faNum(t.number)}
                {t.isLocked && (
                  <span className="mr-1 rounded bg-gray-300 px-1 py-0.5 text-[9px] font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    قفل شده
                  </span>
                )}
              </td>
              <td className="cursor-pointer p-3 text-center" dir="ltr" onClick={() => onOpen(t.id)}>
                {t.tradeNumber != null ? <span className="font-medium text-primary">{faNum(t.tradeNumber)}</span> : <span className="text-muted">—</span>}
              </td>
              <td className="cursor-pointer p-3 text-center font-medium" dir="ltr" onClick={() => onOpen(t.id)}>
                {t.symbol || "—"}
                {t.source === "toobit" && (
                  <span className="ml-1 inline-block rounded-md border border-sky-400/40 bg-sky-400/15 px-1.5 py-0.5 align-middle text-[9px] font-bold text-sky-500">
                    toobit
                  </span>
                )}
              </td>
              <td className="cursor-pointer p-3 text-center" onClick={() => onOpen(t.id)}>
                <DirCell dir={t.direction} />
              </td>
              <td className="cursor-pointer p-3 text-center" dir="ltr" onClick={() => onOpen(t.id)}>
                {formatUsd(t.calc?.positionSize, 0)}
              </td>
              <td className="cursor-pointer p-3 text-center" dir="ltr" onClick={() => onOpen(t.id)}>
                {t.triggerTf || t.analysisTf || "—"}
              </td>
              <td className="cursor-pointer p-3 text-center" onClick={() => onOpen(t.id)}>
                {formatJalaliDate(t.openDate)}
              </td>
              <td className="cursor-pointer p-3 text-center" onClick={() => onOpen(t.id)}>
                {formatTime(t.openDate)}
              </td>
              <td className="cursor-pointer p-3 text-center" dir="ltr" onClick={() => onOpen(t.id)}>
                {formatRatio(t.calc?.rrExpected ?? t.rrExpected)}
              </td>
              <td className="cursor-pointer p-3 text-center" dir="ltr" onClick={() => onOpen(t.id)}>
                {formatRatio(t.calc?.rrAchieved ?? t.rrAchieved)}
              </td>
              <td className="cursor-pointer p-3 text-center" dir="ltr" onClick={() => onOpen(t.id)}>
                <div className={pnlColorClass(pnlOf(t))}>{formatSignedUsd(pnlOf(t))}</div>
                <div className={`text-xs ${pnlColorClass(pctOf(t))}`}>{formatPct(pctOf(t))}</div>
                {t.calc?.capitalPct != null && t.calc.capitalPct !== 0 && (
                  <div className={`text-xs font-medium ${pnlColorClass(t.calc.capitalPct)}`}>
                    {t.calc.capitalPct > 0 ? "+" : ""}{t.calc.capitalPct.toFixed(2)}٪ سرمایه
                  </div>
                )}
              </td>
              <td className="p-3">
                <TagChips tags={t.tags ?? []} colorMap={colorMap} />
              </td>
              <td className="cursor-pointer p-3 text-center" onClick={() => onOpen(t.id)}>
                <StatusDot status={t.status} pnl={pnlOf(t)} exitType={t.exitType} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TradeCards({ rows, onOpen, colorMap }: { rows: Trade[]; onOpen: (id: string) => void; colorMap: Map<string, number> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((t) => {
        const pnl = pnlOf(t);
        const rgb = t.isLocked
          ? "148,163,184"
          : pnl != null && pnl > 0
          ? TINTS.mint
          : pnl != null && pnl < 0
          ? TINTS.rose
          : TINTS.sky;
        return (
        <div
          key={t.id}
          onClick={() => onOpen(t.id)}
          className="group relative cursor-pointer overflow-hidden rounded-3xl p-4 transition-all duration-300 hover:-translate-y-1"
          style={t.isLocked ? { ...glassTint("148,163,184"), opacity: 0.7 } : glassTint(rgb)}
        >
          {/* animated top sheen */}
          <div
            className="absolute inset-x-6 top-0 h-px animate-sheen"
            style={{ background: `linear-gradient(90deg, transparent, rgba(${rgb},0.8), transparent)` }}
          />
          {t.isLocked && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-gray-400/20 dark:bg-gray-700/30">
              <span className="rounded-lg bg-gray-500/80 px-3 py-1.5 text-sm font-bold text-white">
                قفل شده
              </span>
            </div>
          )}
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusDot status={t.status} pnl={pnlOf(t)} exitType={t.exitType} />
              <span className="font-bold" dir="ltr">{t.symbol || "—"}</span>
              {t.source === "toobit" && (
                <span className="rounded-md border border-sky-400/40 bg-sky-400/15 px-1.5 py-0.5 text-[9px] font-bold text-sky-500">
                  toobit
                </span>
              )}
              <span className="text-xs text-muted">#{faNum(t.number)}</span>
              {t.tradeNumber != null && (
                <span className="text-xs font-medium text-primary" dir="ltr">ش.{faNum(t.tradeNumber)}</span>
              )}
            </div>
            <DirCell dir={t.direction} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Info label="VOL" value={formatUsd(t.calc?.positionSize, 0)} />
            <Info label="TF" value={t.triggerTf || t.analysisTf || "—"} />
            <Info label="R:R انتظار" value={formatRatio(t.calc?.rrExpected ?? t.rrExpected)} />
            <Info label="R:R کسب" value={formatRatio(t.calc?.rrAchieved ?? t.rrAchieved)} />
            <Info label="تاریخ" value={formatJalaliDate(t.openDate)} />
            <Info label="نتیجه" value={formatSignedUsd(pnlOf(t))} cls={pnlColorClass(pnlOf(t))} />
            {t.calc?.capitalPct != null && t.calc.capitalPct !== 0 && (
              <Info
                label="% سرمایه"
                value={`${t.calc.capitalPct > 0 ? "+" : ""}${t.calc.capitalPct.toFixed(2)}%`}
                cls={pnlColorClass(t.calc.capitalPct)}
              />
            )}
          </div>
          {(t.tags ?? []).length > 0 && (
            <div className="mt-2">
              <TagChips tags={t.tags ?? []} colorMap={colorMap} />
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}

function Info({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={`font-medium ${cls}`} dir="ltr">{value}</div>
    </div>
  );
}
