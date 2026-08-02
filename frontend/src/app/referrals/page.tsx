"use client";

/**
 * دعوت دوستان — the referral hub.
 *
 * Everything on this page is driven by GET/POST /api/referrals. The page opens
 * with a POST (sync) so milestones reached while the user was away are granted
 * the moment they look at the page, then falls back to GET if that fails.
 *
 * Visual language: aurora blobs behind frosted-glass panels, conic progress
 * rings for the three milestones, a shimmering unlock state, and a shine sweep
 * on the invite card. All animation is CSS-only (no library, no layout jank).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ReferralCodeEditor } from "@/components/ReferralCodeEditor";
import { referralsApi } from "@/lib/api";
import {
  fa,
  faDate,
  inviteLink,
  inviteMessage,
  type ReferralMilestone,
  type ReferralStats,
} from "@/lib/referrals";

const TIER_SKIN: Record<string, { ring: string; glow: string; chip: string; emoji: string }> = {
  silver: {
    ring: "#94A3B8",
    glow: "148,163,184",
    chip: "from-slate-300 to-slate-500",
    emoji: "🥈",
  },
  gold: {
    ring: "#FBBF24",
    glow: "251,191,36",
    chip: "from-amber-300 to-amber-500",
    emoji: "🏆",
  },
  diamond: {
    ring: "#67E8F9",
    glow: "103,232,249",
    chip: "from-cyan-300 to-sky-500",
    emoji: "💎",
  },
};

export default function ReferralsPage() {
  return (
    <AppShell>
      <ReferralsView />
    </AppShell>
  );
}

function ReferralsView() {
  const [data, setData] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async (recalc: boolean) => {
    try {
      const res = recalc ? await referralsApi.sync() : await referralsApi.me();
      setData(res);
      setError("");
    } catch (e: any) {
      try {
        setData(await referralsApi.me());
        setError("");
      } catch (e2: any) {
        setError(e2?.response?.data?.detail || "دریافت اطلاعات دعوت دوستان ناموفق بود.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  const link = useMemo(() => (data ? inviteLink(data.code) : ""), [data]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  };

  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(msg);
    } catch {
      // Fallback for browsers without the async clipboard API.
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand("copy");
        flash(msg);
      } catch {
        flash("کپی نشد؛ دستی انتخاب کن.");
      }
      document.body.removeChild(el);
    }
  };

  const shareTelegram = () => {
    // Built by concatenation on purpose (no raw URL literals in the source).
    const base = "https://" + "t.me/share/url";
    const url = `${base}?url=${encodeURIComponent(link)}&text=${encodeURIComponent(inviteMessage(""))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const shareWhatsapp = () => {
    const base = "https://" + "wa.me/?text=";
    window.open(base + encodeURIComponent(inviteMessage(link)), "_blank", "noopener,noreferrer");
  };

  const shareNative = async () => {
    const nav = navigator as any;
    if (nav?.share) {
      try {
        await nav.share({ title: "ژورنال تریدینگ الگو هاب", text: inviteMessage(""), url: link });
      } catch {
        /* user dismissed */
      }
    } else {
      copy(inviteMessage(link), "متن دعوت کپی شد ✅");
    }
  };

  return (
    <div className="relative">
      <style>{CSS}</style>

      {/* Aurora background */}
      <div className="tj-aurora" aria-hidden="true">
        <span className="tj-blob tj-blob-a" />
        <span className="tj-blob tj-blob-b" />
        <span className="tj-blob tj-blob-c" />
      </div>

      {/* Toast */}
      {toast && <div className="tj-toast">{toast}</div>}

      <header className="relative mb-6">
        <h1 className="text-2xl font-extrabold md:text-3xl">
          <span className="tj-gradient-text">دعوت دوستان</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          لینکت رو برای دوستات بفرست؛ هر کسی که با لینک تو ثبت‌نام کند و ۳ معامله ثبت کند،
          یک دعوتِ معتبر برای تو حساب می‌شود و جایزه‌ها خودکار فعال می‌شوند.
        </p>
      </header>

      {loading && <SkeletonBlock />}
      {!loading && error && (
        <div className="tj-glass p-6 text-sm text-loss">{error}</div>
      )}

      {!loading && data && (
        <div className="relative space-y-6">
          {/* ---------------------------------------------------------- */}
          {/* Invite card                                                */}
          {/* ---------------------------------------------------------- */}
          <section className="tj-glass tj-shine relative overflow-hidden p-6 md:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-xs font-bold tracking-wide text-muted">کد دعوت اختصاصی تو</div>
                <div className="flex flex-wrap items-center gap-3">
                  <span dir="ltr" className="tj-code select-all">{data.code}</span>
                  <button className="tj-btn-ghost" onClick={() => copy(data.code, "کد دعوت کپی شد ✅")}>
                    کپی کد
                  </button>
                </div>

                <div className="mt-5 text-xs font-bold tracking-wide text-muted">لینک دعوت</div>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    readOnly
                    dir="ltr"
                    value={link}
                    onFocus={(e) => e.currentTarget.select()}
                    className="tj-link-input"
                  />
                  <button className="tj-btn-primary shrink-0" onClick={() => copy(link, "لینک دعوت کپی شد 🎉")}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    کپی لینک
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="tj-btn-tg" onClick={shareTelegram}>ارسال در تلگرام</button>
                  <button className="tj-btn-wa" onClick={shareWhatsapp}>واتس‌اپ</button>
                  <button className="tj-btn-ghost" onClick={shareNative}>اشتراک‌گذاری…</button>
                  <button
                    className="tj-btn-ghost"
                    onClick={() => copy(inviteMessage(link), "متن دعوت کپی شد ✅")}
                  >
                    کپی متن دعوت
                  </button>
                </div>

                {/* لینک اختصاصی (کد دلخواه) */}
                <ReferralCodeEditor
                  code={data.code}
                  onSaved={(stats) => setData(stats)}
                  onToast={flash}
                />
              </div>

              {/* Live counters */}
              <div className="grid grid-cols-2 gap-3 lg:w-[22rem]">
                <Stat label="کل دعوت‌ها" value={data.total} tone="sky" />
                <Stat label="دعوت معتبر" value={data.qualified} tone="green" hint={`۳ معامله ثبت‌شده`} />
                <Stat label="در انتظار" value={data.pending} tone="amber" hint="هنوز ۳ معامله ندارند" />
                <Stat label="اعتبار تحلیل" value={data.aiBonus.earned} tone="violet" hint="هر ۵ دعوت = ۱ تحلیل" />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs text-muted">
              <span>
                پلن فعلی: <b className="text-text">{data.planLabel}</b>
                {data.planExpiresAt && <> · تا {faDate(data.planExpiresAt)}</>}
              </span>
              <button className="tj-btn-ghost" onClick={() => load(true)}>به‌روزرسانی وضعیت</button>
            </div>
          </section>

          {/* ---------------------------------------------------------- */}
          {/* Milestones                                                 */}
          {/* ---------------------------------------------------------- */}
          <section>
            <h2 className="mb-3 text-lg font-bold">جایزه‌های تو</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {data.milestones.map((m) => (
                <MilestoneCard key={m.id} m={m} qualified={data.qualified} />
              ))}
            </div>
          </section>

          {/* ---------------------------------------------------------- */}
          {/* AI bonus                                                   */}
          {/* ---------------------------------------------------------- */}
          <section className="tj-glass p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">اعتبار هوش مصنوعی</h2>
                <p className="mt-1 text-sm text-muted">
                  به ازای هر <b className="text-text">{fa(data.aiBonus.step)}</b> دعوتِ معتبر،
                  ۱ «تحلیل مربی» و ۱ «تحلیل تک‌معامله» به سهمیه‌ات اضافه می‌شود.
                </p>
              </div>
              <div className="tj-badge-xl">{fa(data.aiBonus.earned)} تحلیل هدیه</div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex justify-between text-xs text-muted">
                <span>تا جایزهٔ بعدی</span>
                <span>
                  {data.aiBonus.nextIn > 0
                    ? `${fa(data.aiBonus.nextIn)} دعوت دیگر`
                    : "آمادهٔ دریافت!"}
                </span>
              </div>
              <div className="tj-bar">
                <div
                  className="tj-bar-fill"
                  style={{
                    width: `${Math.round(
                      ((data.aiBonus.step - data.aiBonus.nextIn) / data.aiBonus.step) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <QuotaRow
                title="تحلیل مربی هوش مصنوعی"
                used={data.aiBonus.coachUsed}
                quota={data.aiBonus.coachQuota}
                left={data.aiBonus.coachLeft}
              />
              <QuotaRow
                title="تحلیل تک‌معامله"
                used={data.aiBonus.tradeUsed}
                quota={data.aiBonus.tradeQuota}
                left={data.aiBonus.tradeLeft}
              />
            </div>
          </section>

          {/* ---------------------------------------------------------- */}
          {/* Friends                                                    */}
          {/* ---------------------------------------------------------- */}
          <section className="tj-glass p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">دوستان دعوت‌شده</h2>
              <span className="text-xs text-muted">{fa(data.friends.length)} نفر</span>
            </div>

            {data.friends.length === 0 ? (
              <EmptyFriends />
            ) : (
              <div className="space-y-2">
                {data.friends.map((f, i) => (
                  <div
                    key={f.id}
                    className="tj-friend"
                    style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
                  >
                    <span className={`tj-avatar ${f.qualified ? "tj-avatar-on" : ""}`}>
                      {(f.name || f.username || "?").trim().charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{f.name || f.username}</div>
                      <div className="truncate text-xs text-muted">
                        <span dir="ltr">@{f.username}</span> · {faDate(f.joinedAt)}
                      </div>
                    </div>
                    <div className="w-28 shrink-0">
                      <div className="mb-1 text-center text-[11px] text-muted">
                        {fa(Math.min(f.trades, f.needed))}/{fa(f.needed)} معامله
                      </div>
                      <div className="tj-bar tj-bar-sm">
                        <div
                          className={`tj-bar-fill ${f.qualified ? "tj-bar-done" : ""}`}
                          style={{
                            width: `${Math.min(100, Math.round((f.trades / f.needed) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                    <span className={f.qualified ? "tj-chip-on" : "tj-chip-off"}>
                      {f.qualified ? "معتبر" : "در انتظار"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ---------------------------------------------------------- */}
          {/* How it works                                               */}
          {/* ---------------------------------------------------------- */}
          <section className="tj-glass p-6">
            <h2 className="mb-4 text-lg font-bold">چطور کار می‌کند؟</h2>
            <ol className="grid gap-4 md:grid-cols-3">
              <Step n={1} title="لینکت رو بفرست">
                لینک بالا مخصوص خودت است؛ در تلگرام، اینستاگرام یا هر جای دیگر به اشتراک بگذار.
              </Step>
              <Step n={2} title="دوستت ثبت‌نام می‌کند">
                وقتی با لینک تو ثبت‌نام کند (یا کد تو را دستی وارد کند)، اسمش در لیست بالا ظاهر می‌شود.
              </Step>
              <Step n={3} title="۳ معامله ثبت کند">
                بعد از ثبت ۳ معامله توسط او، دعوت معتبر می‌شود و جایزه‌های تو فعال می‌شوند.
              </Step>
            </ol>
            <p className="mt-4 text-xs leading-6 text-muted">
              نکته: جایزهٔ هر مرحله یک‌بار داده می‌شود. اگر پلن فعلی‌ات پایین‌تر باشد، به پلن جایزه ارتقا پیدا می‌کنی؛
              اگر همان پلن را داشته باشی، ۱۴ روز به مدت اشتراکت اضافه می‌شود. دعوت از حساب خودت مجاز نیست.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */
function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: "sky" | "green" | "amber" | "violet";
  hint?: string;
}) {
  return (
    <div className={`tj-stat tj-stat-${tone}`}>
      <div className="tj-stat-value">{fa(value)}</div>
      <div className="tj-stat-label">{label}</div>
      {hint && <div className="tj-stat-hint">{hint}</div>}
    </div>
  );
}

function MilestoneCard({ m, qualified }: { m: ReferralMilestone; qualified: number }) {
  const skin = TIER_SKIN[m.tier] || TIER_SKIN.silver;
  const pct = Math.max(0, Math.min(100, Math.round((m.progress || 0) * 100)));
  return (
    <div
      className={`tj-glass tj-milestone ${m.unlocked ? "tj-unlocked" : ""}`}
      style={{ ["--glow" as any]: skin.glow, ["--ring" as any]: skin.ring }}
    >
      {m.unlocked && <span className="tj-ribbon">فعال شد</span>}
      <div className="flex items-center gap-4">
        <div className="tj-ring" style={{ ["--pct" as any]: `${pct}%` }}>
          <div className="tj-ring-in">
            <span className="text-lg">{skin.emoji}</span>
            <span className="text-[11px] font-bold">{fa(pct)}٪</span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-extrabold">{m.title}</div>
          <div className={`mt-1 inline-block rounded-full bg-gradient-to-l ${skin.chip} px-2.5 py-0.5 text-[11px] font-bold text-black/80`}>
            {m.reward}
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-muted">
        {m.unlocked ? (
          <span className="text-profit">جایزه دریافت شد ✓</span>
        ) : (
          <>
            {fa(qualified)} از {fa(m.need)} دعوت معتبر ·{" "}
            <b className="text-text">{fa(m.remaining)} نفر تا جایزه</b>
          </>
        )}
      </div>
    </div>
  );
}

function QuotaRow({
  title,
  used,
  quota,
  left,
}: {
  title: string;
  used: number;
  quota: number | null;
  left: number | null;
}) {
  const unlimited = quota === null;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm font-bold">{title}</div>
      <div className="mt-1 text-xs text-muted">
        {unlimited ? (
          <span className="text-profit">نامحدود (پلن فعلی)</span>
        ) : (
          <>
            مصرف‌شده {fa(used)} از {fa(quota)} ·{" "}
            <b className={left && left > 0 ? "text-profit" : "text-loss"}>
              {fa(Math.max(0, left ?? 0))} باقی‌مانده
            </b>
          </>
        )}
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="tj-step-n">{fa(n)}</span>
        <span className="text-sm font-bold">{title}</span>
      </div>
      <p className="text-xs leading-6 text-muted">{children}</p>
    </li>
  );
}

function EmptyFriends() {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center">
      <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-2xl tj-float">🎁</div>
      <div className="text-sm font-bold">هنوز کسی را دعوت نکرده‌ای</div>
      <p className="mx-auto mt-1 max-w-md text-xs leading-6 text-muted">
        لینکت رو برای سه دوستِ تریدرت بفرست؛ با همین ۳ نفر، ۱۴ روز اشتراک نقره‌ای مهمان ما هستی.
      </p>
    </div>
  );
}

function SkeletonBlock() {
  return (
    <div className="space-y-4">
      <div className="tj-skel h-52" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="tj-skel h-36" />
        <div className="tj-skel h-36" />
        <div className="tj-skel h-36" />
      </div>
      <div className="tj-skel h-64" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles (scoped by class prefix, theme-aware through currentColor/alpha)     */
/* -------------------------------------------------------------------------- */
const CSS = `
.tj-aurora{position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden}
.tj-blob{position:absolute;width:34rem;height:34rem;border-radius:50%;filter:blur(90px);opacity:.30}
.tj-blob-a{background:radial-gradient(circle,#7DD3FC,transparent 60%);top:-10rem;right:-8rem;animation:tjDrift 22s ease-in-out infinite}
.tj-blob-b{background:radial-gradient(circle,#C084FC,transparent 60%);bottom:-14rem;left:-6rem;animation:tjDrift 28s ease-in-out infinite reverse}
.tj-blob-c{background:radial-gradient(circle,#FBBF24,transparent 60%);top:30%;left:35%;width:24rem;height:24rem;opacity:.18;animation:tjDrift 34s ease-in-out infinite}
@keyframes tjDrift{0%,100%{transform:translate3d(0,0,0) scale(1)}33%{transform:translate3d(4rem,-3rem,0) scale(1.12)}66%{transform:translate3d(-3rem,3rem,0) scale(.94)}}

.tj-glass{position:relative;border-radius:1.5rem;border:1px solid rgba(255,255,255,.14);
  background:linear-gradient(140deg,rgba(255,255,255,.10),rgba(255,255,255,.03));
  backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);
  box-shadow:0 18px 50px -24px rgba(0,0,0,.55);animation:tjRise .5s cubic-bezier(.2,.8,.2,1) both}
@keyframes tjRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}

.tj-shine::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.22) 45%,transparent 60%);
  transform:translateX(-120%);animation:tjSweep 6s ease-in-out infinite}
@keyframes tjSweep{0%,72%{transform:translateX(-120%)}100%{transform:translateX(120%)}}

.tj-gradient-text{background:linear-gradient(90deg,#7DD3FC,#C084FC,#FBBF24);-webkit-background-clip:text;
  background-clip:text;color:transparent;background-size:200% auto;animation:tjHue 6s linear infinite}
@keyframes tjHue{to{background-position:200% center}}

.tj-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:1.6rem;font-weight:800;letter-spacing:.22em;
  padding:.35rem .9rem;border-radius:.9rem;border:1px dashed rgba(255,255,255,.25);background:rgba(255,255,255,.06)}
.tj-link-input{flex:1;min-width:0;border-radius:.9rem;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18);
  padding:.7rem .9rem;font-size:.8rem;font-family:ui-monospace,monospace;color:inherit}

.tj-btn-primary,.tj-btn-ghost,.tj-btn-tg,.tj-btn-wa{display:inline-flex;align-items:center;gap:.45rem;border-radius:.9rem;
  padding:.65rem 1.05rem;font-size:.82rem;font-weight:700;transition:transform .15s ease,box-shadow .15s ease,opacity .15s}
.tj-btn-primary{color:#04121f;background:linear-gradient(90deg,#7DD3FC,#C084FC);box-shadow:0 10px 26px -12px rgba(125,211,252,.9)}
.tj-btn-primary:hover{transform:translateY(-1px)}
.tj-btn-primary:disabled{opacity:.5;transform:none;box-shadow:none;cursor:not-allowed}
.tj-btn-ghost{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06)}
.tj-btn-ghost:hover{background:rgba(255,255,255,.12)}
.tj-btn-tg{background:#229ED9;color:#fff}
.tj-btn-wa{background:#25D366;color:#04321a}
.tj-btn-tg:hover,.tj-btn-wa:hover{transform:translateY(-1px)}

.tj-stat{border-radius:1.15rem;padding:.9rem 1rem;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);
  transition:transform .2s ease}
.tj-stat:hover{transform:translateY(-2px)}
.tj-stat-value{font-size:1.7rem;font-weight:900;line-height:1.1}
.tj-stat-label{font-size:.72rem;opacity:.8;margin-top:.15rem}
.tj-stat-hint{font-size:.62rem;opacity:.55;margin-top:.1rem}
.tj-stat-sky .tj-stat-value{color:#7DD3FC}
.tj-stat-green .tj-stat-value{color:#34D399}
.tj-stat-amber .tj-stat-value{color:#FBBF24}
.tj-stat-violet .tj-stat-value{color:#C084FC}

.tj-milestone{padding:1.25rem;overflow:hidden}
.tj-milestone:hover{box-shadow:0 0 0 1px rgba(var(--glow),.45),0 22px 50px -26px rgba(var(--glow),.75)}
.tj-unlocked{border-color:rgba(var(--glow),.5)}
.tj-unlocked::before{content:"";position:absolute;inset:-40%;background:conic-gradient(from 0deg,transparent,rgba(var(--glow),.28),transparent 35%);
  animation:tjSpin 7s linear infinite;pointer-events:none}
@keyframes tjSpin{to{transform:rotate(360deg)}}
.tj-ribbon{position:absolute;top:.8rem;left:.8rem;z-index:2;border-radius:999px;padding:.15rem .55rem;font-size:.6rem;font-weight:800;
  background:rgba(var(--glow),.22);color:rgb(var(--glow))}

.tj-ring{position:relative;width:5rem;height:5rem;border-radius:50%;flex:none;
  background:conic-gradient(var(--ring) var(--pct),rgba(255,255,255,.10) 0);
  transition:background .8s cubic-bezier(.2,.8,.2,1)}
.tj-ring-in{position:absolute;inset:6px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:rgba(12,16,24,.72);backdrop-filter:blur(6px)}

.tj-bar{height:.55rem;border-radius:999px;background:rgba(255,255,255,.10);overflow:hidden}
.tj-bar-sm{height:.4rem}
.tj-bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#7DD3FC,#C084FC);
  transition:width .9s cubic-bezier(.2,.8,.2,1)}
.tj-bar-done{background:linear-gradient(90deg,#34D399,#7DD3FC)}

.tj-badge-xl{border-radius:999px;padding:.5rem 1rem;font-weight:800;font-size:.85rem;color:#04121f;
  background:linear-gradient(90deg,#FBBF24,#C084FC);box-shadow:0 10px 26px -14px rgba(251,191,36,.9)}

.tj-friend{display:flex;align-items:center;gap:.85rem;border-radius:1.1rem;padding:.7rem .9rem;
  border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);animation:tjRise .45s both;transition:background .2s}
.tj-friend:hover{background:rgba(255,255,255,.09)}
.tj-avatar{display:grid;place-items:center;width:2.4rem;height:2.4rem;border-radius:.9rem;font-weight:800;flex:none;
  background:rgba(255,255,255,.10)}
.tj-avatar-on{background:linear-gradient(135deg,#34D399,#7DD3FC);color:#04121f}
.tj-chip-on{border-radius:999px;padding:.2rem .6rem;font-size:.66rem;font-weight:800;background:rgba(52,211,153,.18);color:#34D399}
.tj-chip-off{border-radius:999px;padding:.2rem .6rem;font-size:.66rem;font-weight:800;background:rgba(251,191,36,.16);color:#FBBF24}

.tj-step-n{display:grid;place-items:center;width:1.6rem;height:1.6rem;border-radius:.6rem;font-size:.75rem;font-weight:900;
  background:linear-gradient(135deg,#7DD3FC,#C084FC);color:#04121f}

.tj-toast{position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);z-index:60;border-radius:999px;
  padding:.6rem 1.2rem;font-size:.8rem;font-weight:700;color:#04121f;background:linear-gradient(90deg,#7DD3FC,#34D399);
  box-shadow:0 16px 40px -18px rgba(0,0,0,.8);animation:tjPop .25s cubic-bezier(.2,.8,.2,1)}
@keyframes tjPop{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}

.tj-float{animation:tjFloat 3.4s ease-in-out infinite}
@keyframes tjFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}

.tj-skel{border-radius:1.5rem;background:linear-gradient(100deg,rgba(255,255,255,.05) 30%,rgba(255,255,255,.12) 50%,rgba(255,255,255,.05) 70%);
  background-size:220% 100%;animation:tjSkel 1.4s linear infinite}
@keyframes tjSkel{to{background-position:-220% 0}}

.tj-nav-glow{position:relative;background:linear-gradient(90deg,rgba(192,132,252,.16),rgba(251,191,36,.12));
  border:1px solid rgba(192,132,252,.28)}

@media (prefers-reduced-motion:reduce){
  .tj-blob,.tj-shine::after,.tj-unlocked::before,.tj-gradient-text,.tj-float,.tj-skel{animation:none}
}
`;
