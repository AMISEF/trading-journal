"use client";

/**
 * کارنامهٔ عمومی معامله‌گر — /journal/u/<slug>
 *
 * بدون لاگین و بدون AppShell. بسته به حالتی که خودِ کاربر انتخاب کرده،
 * داشبورد و/یا لیست معاملات (با یا بدون جزئیات) نمایش داده می‌شود.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BASE_PATH } from "@/lib/api";
import { DashboardView } from "@/components/DashboardView";
import { Badge, Spinner, StatusDot } from "@/components/ui";
import { loadPublicProfile, type PublicProfile } from "@/lib/share";
import { brandOf } from "@/lib/exchanges";
import { ExchangeTag } from "@/components/ExchangeLogo";
import type { Trade } from "@/lib/types";
import {
  faNum,
  formatPct,
  formatRatio,
  formatSignedUsd,
  formatUsd,
  pnlColorClass,
} from "@/lib/format";
import { formatJalaliDate, formatTime } from "@/lib/jalali";

const TINTS = {
  mint: "94,234,212",
  violet: "167,139,250",
  sky: "125,211,252",
} as const;

function glass(): React.CSSProperties {
  return {
    background: "var(--glass-bg)",
    backdropFilter: "blur(20px) saturate(160%)",
    WebkitBackdropFilter: "blur(20px) saturate(160%)",
    border: "1px solid var(--glass-border)",
    boxShadow: "0 20px 56px -24px rgba(56,189,248,0.22)",
  };
}

export default function PublicProfilePage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : Array.isArray(params?.slug) ? params!.slug[0] : "";

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    loadPublicProfile(slug)
      .then(setProfile)
      .catch((e: any) => {
        const detail = e?.response?.data?.detail;
        setError(typeof detail === "string" && detail.trim() ? detail : "این کارنامه پیدا نشد یا دیگر عمومی نیست.");
      });
  }, [slug]);

  if (error) {
    return (
      <main dir="rtl" className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="text-5xl">🔎</div>
        <h1 className="text-xl font-extrabold">{error}</h1>
        <a
          href={`${BASE_PATH}/register`}
          className="rounded-xl px-5 py-2.5 text-sm font-extrabold text-[#06121f]"
          style={{ background: "linear-gradient(120deg, rgb(103,232,249), rgb(52,211,153))" }}
        >
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

  const hero = (
    <div className="space-y-4">
      <div
        className="relative overflow-hidden rounded-3xl p-6"
        style={{
          background: `linear-gradient(150deg, rgba(${TINTS.sky},0.16), rgba(${TINTS.violet},0.06) 55%, var(--glass-bg))`,
          border: `1px solid rgba(${TINTS.sky},0.28)`,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1
                className="text-3xl font-extrabold tracking-tight"
                style={{
                  backgroundImage: `linear-gradient(120deg, rgb(${TINTS.mint}), rgb(${TINTS.sky}), rgb(${TINTS.violet}))`,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {profile.name}
              </h1>
              <span
                className="rounded-full px-3 py-1 text-xs font-bold"
                style={{ background: "rgba(251,191,36,0.16)", color: "rgb(251,191,36)" }}
              >
                {profile.planLabel}
              </span>
            </div>
            {profile.title && <div className="mt-1 text-sm font-bold text-muted">{profile.title}</div>}
            {profile.bio && <p className="mt-2 max-w-xl text-sm text-muted">{profile.bio}</p>}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-xl px-3 py-2" style={glass()}>تعداد معاملات: <b>{faNum(profile.tradeCount)}</b></span>
            <span className="rounded-xl px-3 py-2" style={glass()}>بازدید: <b>{faNum(profile.views)}</b></span>
            <span className="rounded-xl px-3 py-2" style={glass()}>{profile.modeLabel}</span>
          </div>
        </div>
        <div className="mt-4 text-xs text-muted">
          این کارنامه به صورت عمومی توسط خودِ معامله‌گر منتشر شده و مستقیماً از ژورنال تریدینگ الگو هاب خوانده می‌شود.
        </div>
      </div>
    </div>
  );

  const cta = (
    <div
      className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6"
      style={{
        background: `linear-gradient(150deg, rgba(${TINTS.mint},0.14), rgba(${TINTS.violet},0.06) 60%, var(--glass-bg))`,
        border: `1px solid rgba(${TINTS.mint},0.28)`,
      }}
    >
      <div>
        <div className="text-lg font-extrabold">کارنامهٔ خودت را بساز</div>
        <div className="text-sm text-muted">ژورنال تریدینگ کریپتو اسمارت — ثبت معاملات، تحلیل هوش مصنوعی و کارنامهٔ قابل اشتراک.</div>
      </div>
      <a
        href={`${BASE_PATH}/register`}
        className="rounded-xl px-5 py-2.5 text-sm font-extrabold text-[#06121f]"
        style={{ background: "linear-gradient(120deg, rgb(103,232,249), rgb(52,211,153))" }}
      >
        ساخت کارنامهٔ رایگان
      </a>
    </div>
  );

  const trades = profile.showJournal ? profile.trades ?? [] : [];

  const journalBlock = profile.showJournal ? (
    <div className="mt-6 space-y-3">
      <h2 className="text-xl font-extrabold">معاملات</h2>
      {trades.length === 0 ? (
        <div className="rounded-3xl p-8 text-center text-muted" style={glass()}>معامله‌ای برای نمایش وجود ندارد.</div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-3xl md:block" style={glass()}>
            <table className="w-full text-sm">
              <thead className="text-muted">
                <tr className="border-b border-white/10 text-center">
                  <th className="p-3">#</th>
                  <th className="p-3">نماد</th>
                  <th className="p-3">جهت</th>
                  <th className="p-3">VOL</th>
                  <th className="p-3">TF</th>
                  <th className="p-3">تاریخ</th>
                  <th className="p-3">زمان</th>
                  <th className="p-3">R:R انتظار</th>
                  <th className="p-3">R:R کسب</th>
                  <th className="p-3">نتیجه</th>
                  <th className="p-3">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => {
                  const brand = brandOf(t.source);
                  const pnl = brand && t.realizedPnl != null ? t.realizedPnl : t.calc?.realizedPnl ?? t.realizedPnl ?? null;
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-white/5"
                      style={brand ? { background: `rgba(${brand.tint},0.08)` } : undefined}
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
                      <td className="p-3 text-center" dir="ltr">{t.triggerTf || t.analysisTf || "—"}</td>
                      <td className="p-3 text-center">{formatJalaliDate(t.openDate)}</td>
                      <td className="p-3 text-center">{formatTime(t.openDate)}</td>
                      <td className="p-3 text-center" dir="ltr">{formatRatio(t.calc?.rrExpected ?? t.rrExpected)}</td>
                      <td className="p-3 text-center" dir="ltr">{formatRatio(t.calc?.rrAchieved ?? t.rrAchieved)}</td>
                      <td className="p-3 text-center" dir="ltr">
                        <div className={pnlColorClass(pnl)}>{formatSignedUsd(pnl)}</div>
                        <div className={`text-xs ${pnlColorClass(t.calc?.resultPct ?? null)}`}>{formatPct(t.calc?.resultPct ?? null)}</div>
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

          {/* نمای کارتی در موبایل */}
          <div className="grid gap-3 sm:grid-cols-2 md:hidden">
            {trades.map((t) => (
              <PublicTradeCard key={t.id} trade={t} showDetails={false} />
            ))}
          </div>

          {/* جزئیات کامل */}
          {profile.showDetails && (
            <div className="space-y-3">
              <h3 className="text-lg font-extrabold">جزئیات معاملات</h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {trades.map((t) => (
                  <PublicTradeCard key={`d-${t.id}`} trade={t} showDetails />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  ) : null;

  return (
    <main dir="rtl" className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      {profile.showDashboard && profile.dashboard ? (
        <DashboardView data={profile.dashboard} header={hero} footer={<>{journalBlock}{cta}</>} />
      ) : (
        <>
          {hero}
          {journalBlock}
          {cta}
        </>
      )}
    </main>
  );
}

/** کارت یک معامله — در حالت جزئیات، یادداشت‌ها و دلایل هم دیده می‌شوند. */
function PublicTradeCard({ trade, showDetails }: { trade: Trade; showDetails: boolean }) {
  const t = trade as any;
  const brand = brandOf(trade.source);
  const pnl = brand && trade.realizedPnl != null ? trade.realizedPnl : trade.calc?.realizedPnl ?? trade.realizedPnl ?? null;
  const list = (v: any): string => (Array.isArray(v) ? v.filter(Boolean).join("، ") : typeof v === "string" ? v : "");

  return (
    <div className="space-y-2 rounded-3xl p-4" style={glass()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusDot status={trade.status} pnl={pnl} exitType={trade.exitType} />
          <span className="font-bold" dir="ltr">{trade.symbol || "—"}</span>
          {brand && <ExchangeTag slug={brand.slug} />}
          <span className="text-xs text-muted">#{faNum(trade.number)}</span>
        </div>
        {trade.direction === "LONG" ? <Badge tone="profit">Long</Badge> : <Badge tone="loss">Short</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <Cell label="تاریخ" value={formatJalaliDate(trade.openDate)} />
        <Cell label="زمان" value={formatTime(trade.openDate)} />
        <Cell label="VOL" value={formatUsd(trade.calc?.positionSize, 0)} />
        <Cell label="TF" value={trade.triggerTf || trade.analysisTf || "—"} />
        <Cell label="R:R انتظار" value={formatRatio(trade.calc?.rrExpected ?? trade.rrExpected)} />
        <Cell label="R:R کسب" value={formatRatio(trade.calc?.rrAchieved ?? trade.rrAchieved)} />
        <Cell label="نتیجه" value={formatSignedUsd(pnl)} cls={pnlColorClass(pnl)} />
        <Cell label="درصد" value={formatPct(trade.calc?.resultPct ?? null)} cls={pnlColorClass(trade.calc?.resultPct ?? null)} />
      </div>

      {showDetails && (
        <div className="space-y-2 border-t border-white/10 pt-2 text-sm">
          {t.stopLoss != null && t.stopLoss !== "" && <Row label="حد ضرر" value={String(t.stopLoss)} />}
          {list(t.entryReasons) && <Row label="دلایل ورود" value={list(t.entryReasons)} />}
          {list(t.exitReasons) && <Row label="دلایل خروج" value={list(t.exitReasons)} />}
          {list(t.emotions) && <Row label="احساسات" value={list(t.emotions)} />}
          {t.entryNote && <Row label="یادداشت ورود" value={String(t.entryNote)} />}
          {t.exitNote && <Row label="یادداشت خروج" value={String(t.exitNote)} />}
          {t.generalNote && <Row label="یادداشت کلی" value={String(t.generalNote)} />}
          {Array.isArray(trade.tags) && trade.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {trade.tags.map((tag) => (
                <span key={tag} className="rounded-full px-2 py-0.5 text-xs" style={{ background: "rgba(125,211,252,0.14)" }}>{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={`font-medium ${cls}`} dir="ltr">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-muted">{label}: </span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
