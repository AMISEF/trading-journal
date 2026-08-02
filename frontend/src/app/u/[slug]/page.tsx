"use client";

/**
 * کارنامهٔ عمومی معامله‌گر — /journal/u/<slug>
 *
 * بدون لاگین. بالای صفحه دو کلید انتخاب بخش: «برایند» (داشبورد کامل)
 * و «ژورنال» (لیست معاملات). با کلیک روی هر معامله، تمام جزئیات — همان تب‌هایی
 * که خودِ کاربر داخل سایت می‌بیند — فقط‌خواندنی باز می‌شود.
 *
 * تمام رنگ‌ها از متغیرهای تم می‌آیند تا در هر هفت تمِ سایت خوانا باشد.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { BASE_PATH, publicApi } from "@/lib/api";
import { DashboardView } from "@/components/DashboardView";
import { TradeTabs } from "@/components/editor/TradeTabs";
import { useTrade } from "@/store/trade";
import { Badge, Spinner, StatusDot } from "@/components/ui";
import { loadPublicProfile, type PublicProfile } from "@/lib/share";
import { brandOf } from "@/lib/exchanges";
import { ExchangeTag } from "@/components/ExchangeLogo";
import type { ChecklistTemplate, Trade } from "@/lib/types";
import {
  faNum,
  formatPct,
  formatRatio,
  formatSignedUsd,
  formatUsd,
  pnlColorClass,
} from "@/lib/format";
import { formatJalaliDate, formatTime } from "@/lib/jalali";

const PAGE_SIZE = 15;

/** کارتِ هماهنگ با تم (روشن/تاریک خودکار). */
function card(): React.CSSProperties {
  return {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    boxShadow: "var(--glass-shadow)",
  };
}

const primaryBtn: React.CSSProperties = {
  background: "var(--primary)",
  color: "var(--surface)",
  border: "1px solid var(--primary)",
};

function pnlOf(t: Trade): number | null {
  if (t.source && t.realizedPnl != null) return t.realizedPnl;
  return t.calc?.realizedPnl ?? t.realizedPnl ?? null;
}

export default function PublicProfilePage() {
  const params = useParams<{ slug: string }>();
  const slug =
    typeof params?.slug === "string"
      ? params.slug
      : Array.isArray(params?.slug)
      ? params!.slug[0]
      : "";

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState("");
  const [section, setSection] = useState<"dashboard" | "journal">("dashboard");

  useEffect(() => {
    if (!slug) return;
    loadPublicProfile(slug)
      .then((p) => {
        setProfile(p);
        setSection(p.showDashboard ? "dashboard" : "journal");
      })
      .catch((e: any) => {
        const detail = e?.response?.data?.detail;
        setError(
          typeof detail === "string" && detail.trim()
            ? detail
            : "این کارنامه پیدا نشد یا دیگر عمومی نیست."
        );
      });
  }, [slug]);

  if (error) {
    return (
      <main dir="rtl" className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="text-5xl">🔎</div>
        <h1 className="text-xl font-extrabold" style={{ color: "var(--text)" }}>{error}</h1>
        <a href={`${BASE_PATH}/register`} className="rounded-xl px-5 py-2.5 text-sm font-extrabold" style={primaryBtn}>
          ساخت کارنامهٔ رایگان
        </a>
      </main>
    );
  }

  if (!profile) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center p-6">
        <Spinner label="در حال بارگذاری کارنامه…" />
      </main>
    );
  }

  const both = profile.showDashboard && profile.showJournal;

  const switcher = both ? (
    <div
      className="inline-flex items-center gap-2 rounded-2xl p-1.5"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      {([
        { id: "dashboard" as const, label: "برایند", icon: "📊" },
        { id: "journal" as const, label: "ژورنال", icon: "📒" },
      ]).map((s) => {
        const active = section === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className="flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-extrabold transition-all"
            style={
              active
                ? { background: "var(--primary)", color: "var(--surface)" }
                : { background: "transparent", color: "var(--muted)" }
            }
          >
            <span>{s.icon}</span>
            {s.label}
          </button>
        );
      })}
    </div>
  ) : null;

  const hero = (
    <div className="relative overflow-hidden rounded-3xl p-6" style={card()}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
              {profile.name}
            </h1>
            <span
              className="rounded-full px-3 py-1 text-xs font-bold"
              style={{ background: "var(--primary-soft)", color: "var(--primary)", border: "1px solid var(--primary)" }}
            >
              {profile.planLabel}
            </span>
          </div>
          {profile.title && (
            <div className="mt-1 text-sm font-bold" style={{ color: "var(--muted)" }}>{profile.title}</div>
          )}
          {profile.bio && <p className="mt-2 max-w-xl text-sm" style={{ color: "var(--muted)" }}>{profile.bio}</p>}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className="rounded-xl px-3 py-2"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--muted)" }}
          >
            تعداد معاملات: <b style={{ color: "var(--text)" }}>{faNum(profile.tradeCount)}</b>
          </span>
          <span
            className="rounded-xl px-3 py-2"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--muted)" }}
          >
            بازدید: <b style={{ color: "var(--text)" }}>{faNum(profile.views)}</b>
          </span>
        </div>
      </div>
      {switcher && <div className="mt-5 flex justify-start">{switcher}</div>}
    </div>
  );

  const cta = (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6" style={card()}>
      <div>
        <div className="text-lg font-extrabold" style={{ color: "var(--text)" }}>کارنامهٔ خودت را بساز</div>
        <div className="text-sm" style={{ color: "var(--muted)" }}>
          ژورنال تریدینگ کریپتو اسمارت — ثبت معاملات، تحلیل هوش مصنوعی و کارنامهٔ قابل اشتراک.
        </div>
      </div>
      <a href={`${BASE_PATH}/register`} className="rounded-xl px-5 py-2.5 text-sm font-extrabold" style={primaryBtn}>
        ساخت کارنامهٔ رایگان
      </a>
    </div>
  );

  const showDash = profile.showDashboard && (section === "dashboard" || !both);
  const showJournal = profile.showJournal && (section === "journal" || !both);

  return (
    <main dir="rtl" className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      {showDash && profile.dashboard ? (
        <DashboardView
          data={profile.dashboard}
          header={hero}
          footer={showJournal ? <PublicJournal profile={profile} /> : null}
        />
      ) : (
        <>
          {hero}
          {showJournal && <PublicJournal profile={profile} />}
        </>
      )}
      {cta}
    </main>
  );
}

/** لیست معاملات + بازکردن جزئیات کامل با کلیک. */
function PublicJournal({ profile }: { profile: PublicProfile }) {
  const trades = useMemo(() => profile.trades ?? [], [profile.trades]);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Trade | null>(null);

  const totalPages = Math.max(1, Math.ceil(trades.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = trades.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const clickable = profile.showDetails;

  if (trades.length === 0) {
    return (
      <div className="mt-6 rounded-3xl p-8 text-center" style={{ ...card(), color: "var(--muted)" }}>
        معامله‌ای برای نمایش وجود ندارد.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-extrabold" style={{ color: "var(--text)" }}>معاملات</h2>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {clickable
            ? "برای مشاهدهٔ جزئیات کاملِ هر معامله روی آن کلیک کنید"
            : "این کارنامه بدون جزئیاتِ معاملات به اشتراک گذاشته شده است"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-3xl" style={card()}>
        <table className="w-full text-sm">
          <thead style={{ color: "var(--muted)" }}>
            <tr className="text-center" style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="p-3">#</th>
              <th className="p-3">نماد</th>
              <th className="p-3">جهت</th>
              <th className="p-3">VOL</th>
              <th className="p-3">تاریخ</th>
              <th className="p-3">زمان</th>
              <th className="p-3">R:R کسب</th>
              <th className="p-3">نتیجه</th>
              <th className="p-3">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const brand = brandOf(t.source);
              const pnl = pnlOf(t);
              return (
                <tr
                  key={t.id}
                  onClick={clickable ? () => setDetail(t) : undefined}
                  className={clickable ? "cursor-pointer transition-colors" : ""}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background: brand ? `rgba(${brand.tint},0.10)` : "transparent",
                    color: "var(--text)",
                  }}
                >
                  <td className="p-3 text-center">{faNum(t.number)}</td>
                  <td className="p-3 text-center font-medium" dir="ltr">
                    {t.symbol || "—"}
                    {brand && <ExchangeTag slug={brand.slug} className="ml-1 align-middle" />}
                  </td>
                  <td className="p-3 text-center">
                    {t.direction === "LONG" ? <Badge tone="profit">Long</Badge> : <Badge tone="loss">Short</Badge>}
                  </td>
                  <td className="p-3 text-center" dir="ltr">{formatUsd(t.calc?.positionSize, 0)}</td>
                  <td className="p-3 text-center">{formatJalaliDate(t.openDate)}</td>
                  <td className="p-3 text-center">{formatTime(t.openDate)}</td>
                  <td className="p-3 text-center" dir="ltr">{formatRatio(t.calc?.rrAchieved ?? t.rrAchieved)}</td>
                  <td className="p-3 text-center" dir="ltr">
                    <div className={pnlColorClass(pnl)}>{formatSignedUsd(pnl)}</div>
                    <div className={`text-xs ${pnlColorClass(t.calc?.resultPct ?? null)}`}>
                      {formatPct(t.calc?.resultPct ?? null)}
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <StatusDot status={t.status} pnl={pnl} exitType={t.exitType} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            قبلی
          </button>
          <span className="px-2 text-sm" style={{ color: "var(--muted)" }}>
            صفحهٔ {faNum(safePage)} از {faNum(totalPages)}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            بعدی
          </button>
        </div>
      )}

      {detail && <PublicTradeDetail trade={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

/** جزئیات کاملِ یک معامله — همان تب‌های ادیتور، فقط‌خواندنی و بدون نیاز به لاگین. */
function PublicTradeDetail({ trade, onClose }: { trade: Trade; onClose: () => void }) {
  const setTrade = useTrade((s) => s.setTrade);
  const reset = useTrade((s) => s.reset);
  const [checklists, setChecklists] = useState<ChecklistTemplate[]>([]);

  useEffect(() => {
    setTrade(trade);
    return () => reset();
  }, [trade, setTrade, reset]);

  useEffect(() => {
    publicApi
      .teamChecklists(trade.userId)
      .then(setChecklists)
      .catch(() => setChecklists([]));
  }, [trade.userId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pnl = pnlOf(trade);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto p-4"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
      dir="rtl"
    >
      <div className="tj-card my-6 w-full max-w-3xl space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex flex-wrap items-center gap-3">
            <StatusDot status={trade.status} pnl={pnl} exitType={trade.exitType} />
            <div className="font-bold" style={{ color: "var(--text)" }}>
              معامله #{faNum(trade.number)}{" "}
              <span dir="ltr" style={{ color: "var(--muted)" }}>{trade.symbol || ""}</span>
            </div>
            <Badge tone="muted">حالت فقط‌خواندنی</Badge>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--muted)" }}
          >
            بستن ✕
          </button>
        </div>
        <TradeTabs readOnly checklistTemplates={checklists} />
      </div>
    </div>
  );
}
