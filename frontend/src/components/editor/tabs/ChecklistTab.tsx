"use client";

/**
 * "چک‌لیست" tab.
 * - 3 topic cards per row, each with a unique pastel color
 * - Edit mode: rename topic, add/delete/rename sub-topics
 * - Score mode: assign a score to every sub-topic (summing to 100) and a
 *   minimum allowed score. When filling, ticking an item adds its score; the
 *   "تایید چک‌لیست" button warns (centred neon glass modal) if the earned
 *   score is below the threshold — "no trading allowed".
 * - Ticking items persisted per-trade in checklistTicks
 */
import { useEffect, useState } from "react";
import { useTrade } from "@/store/trade";
import { useAuth } from "@/store/auth";
import { checklistsApi } from "@/lib/api";
import { faNum } from "@/lib/format";
import type { ChecklistTemplate, ChecklistItem } from "@/lib/types";

const TINTS = [
  { rgb: "94,234,212",  label: "mint"   },
  { rgb: "167,139,250", label: "violet" },
  { rgb: "125,211,252", label: "sky"    },
  { rgb: "251,191,36",  label: "amber"  },
  { rgb: "244,114,182", label: "rose"   },
  { rgb: "52,211,153",  label: "green"  },
  { rgb: "251,146,160", label: "pink"   },
  { rgb: "196,181,253", label: "purple" },
];

function tintStyle(rgb: string): React.CSSProperties {
  return {
    background: `linear-gradient(150deg, rgba(${rgb},0.18) 0%, rgba(${rgb},0.06) 60%, var(--glass-bg) 100%)`,
    border: `1px solid rgba(${rgb},0.30)`,
    backdropFilter: "blur(16px) saturate(140%)",
    WebkitBackdropFilter: "blur(16px) saturate(140%)",
    boxShadow: `0 8px 32px -12px rgba(${rgb},0.32), inset 0 1px 0 rgba(255,255,255,0.08)`,
    borderRadius: "1.25rem",
  };
}

function tintAccent(rgb: string): React.CSSProperties {
  return { color: `rgb(${rgb})` };
}
function tintBg(rgb: string, alpha = 0.18): React.CSSProperties {
  return { background: `rgba(${rgb},${alpha})` };
}
function tintBorder(rgb: string): React.CSSProperties {
  return { border: `1px solid rgba(${rgb},0.35)` };
}

/* ─── Scoring config (per-user, localStorage) ─────────────────────────────── */
interface ScoringConfig {
  enabled: boolean;
  threshold: number;
  scores: Record<string, number>; // itemId -> points
}
const emptyScoring = (): ScoringConfig => ({ enabled: false, threshold: 85, scores: {} });
const scoringKey = (userId: string) => `tj_checklist_scoring_${userId}`;

function loadScoring(userId: string): ScoringConfig {
  if (typeof window === "undefined") return emptyScoring();
  try {
    const raw = JSON.parse(localStorage.getItem(scoringKey(userId)) || "null");
    if (!raw || typeof raw !== "object") return emptyScoring();
    return {
      enabled: !!raw.enabled,
      threshold: Number.isFinite(raw.threshold) ? raw.threshold : 85,
      scores: raw.scores && typeof raw.scores === "object" ? raw.scores : {},
    };
  } catch {
    return emptyScoring();
  }
}
function saveScoring(userId: string, cfg: ScoringConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(scoringKey(userId), JSON.stringify(cfg));
}

export function ChecklistTab({
  readOnly = false,
  externalTemplates,
}: {
  readOnly?: boolean;
  /** When provided (admin view), skip the API call and use these instead. */
  externalTemplates?: ChecklistTemplate[];
}) {
  const trade = useTrade((s) => s.trade);
  const patch = useTrade((s) => s.patch);
  const user = useAuth((s) => s.user);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>(externalTemplates ?? []);
  const [editMode, setEditMode] = useState(false);
  const [scoreMode, setScoreMode] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [scoring, setScoring] = useState<ScoringConfig>(emptyScoring());
  const [warnOpen, setWarnOpen] = useState(false);
  const [confirmedOk, setConfirmedOk] = useState(false);

  const load = () => checklistsApi.list().then(setTemplates).catch(() => {});
  useEffect(() => {
    if (externalTemplates) {
      setTemplates(externalTemplates);
    } else {
      load();
    }
  }, [externalTemplates]);

  // Load per-user scoring config.
  useEffect(() => {
    if (user?.id) setScoring(loadScoring(user.id));
  }, [user?.id]);

  const updateScoring = (next: ScoringConfig) => {
    setScoring(next);
    if (user?.id) saveScoring(user.id, next);
  };

  if (!trade) return null;

  const ticks = trade.checklistTicks || {};
  const toggle = (itemId: string) => {
    if (readOnly || editMode || scoreMode) return;
    setConfirmedOk(false);
    patch({ checklistTicks: { ...ticks, [itemId]: !ticks[itemId] } });
  };

  const allItems = templates.flatMap((t) => t.items);
  const done = allItems.filter((it) => ticks[it.id]).length;
  const total = allItems.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  // Score bookkeeping.
  const scoreOf = (id: string) => Number(scoring.scores[id]) || 0;
  const configuredTotal = allItems.reduce((s, it) => s + scoreOf(it.id), 0);
  const earned = allItems.reduce((s, it) => s + (ticks[it.id] ? scoreOf(it.id) : 0), 0);
  const scoringActive = scoring.enabled && configuredTotal > 0;
  const passes = earned >= scoring.threshold;

  const confirmChecklist = () => {
    if (passes) {
      setConfirmedOk(true);
      setWarnOpen(false);
    } else {
      setConfirmedOk(false);
      setWarnOpen(true);
    }
  };

  const saveTemplate = async (tpl: ChecklistTemplate) => {
    setSavingId(tpl.id);
    try {
      await checklistsApi.update(tpl.id, { title: tpl.title, items: tpl.items });
      setTemplates((prev) => prev.map((t) => (t.id === tpl.id ? tpl : t)));
    } catch {}
    setSavingId(null);
  };

  const deleteTemplate = async (id: string) => {
    try {
      await checklistsApi.remove(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {}
  };

  const totalOk = configuredTotal === 100;

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="glass p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold">پیشرفت چک‌لیست</span>
          <div className="flex items-center gap-3">
            {scoringActive && (
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                style={{
                  color: passes ? "rgb(52,211,153)" : "rgb(251,146,60)",
                  background: passes ? "rgba(52,211,153,0.14)" : "rgba(251,146,60,0.14)",
                  border: `1px solid ${passes ? "rgba(52,211,153,0.4)" : "rgba(251,146,60,0.4)"}`,
                }}
              >
                امتیاز: {faNum(earned)}/{faNum(100)}
              </span>
            )}
            <span className="text-muted">
              {faNum(done)}/{faNum(total)} — {faNum(pct)}٪
            </span>
          </div>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {scoringActive && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, earned)}%`,
                  background: passes
                    ? "linear-gradient(90deg, rgb(52,211,153), rgb(94,234,212))"
                    : "linear-gradient(90deg, rgb(251,146,60), rgb(248,113,113))",
                }}
              />
            </div>
            <span>حد مجاز: {faNum(scoring.threshold)}</span>
          </div>
        )}
      </div>

      {/* Toolbar */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => { setEditMode((v) => !v); setScoreMode(false); }}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
              editMode
                ? "border-primary bg-primary text-white shadow-md"
                : "border-border bg-surface-2 text-text hover:border-primary"
            }`}
          >
            {editMode ? "✓ پایان ویرایش" : "✏️ ویرایش موضوعات"}
          </button>
          <button
            type="button"
            onClick={() => { setScoreMode((v) => !v); setEditMode(false); }}
            className="rounded-xl border px-4 py-2 text-sm font-medium transition-all"
            style={
              scoreMode
                ? {
                    borderColor: "rgba(167,139,250,0.6)",
                    background: "linear-gradient(135deg, rgba(167,139,250,0.9), rgba(125,211,252,0.7))",
                    color: "#0b0f1a",
                    boxShadow: "0 6px 20px -8px rgba(167,139,250,0.7)",
                  }
                : { borderColor: "rgba(167,139,250,0.4)", color: "rgb(167,139,250)" }
            }
          >
            {scoreMode ? "✓ پایان امتیازدهی" : "🎯 امتیازدهی"}
          </button>
          {!editMode && !scoreMode && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm font-medium hover:border-primary"
            >
              + موضوع جدید
            </button>
          )}
        </div>
      )}

      {/* Score-mode config panel */}
      {scoreMode && !readOnly && (
        <div
          className="rounded-2xl p-4"
          style={{
            background: "linear-gradient(150deg, rgba(167,139,250,0.14), rgba(125,211,252,0.06) 60%, var(--glass-bg))",
            border: "1px solid rgba(167,139,250,0.3)",
            boxShadow: "0 8px 32px -14px rgba(167,139,250,0.4)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <label className="flex items-center gap-2.5 text-sm font-medium">
              <button
                type="button"
                role="switch"
                aria-checked={scoring.enabled}
                onClick={() => updateScoring({ ...scoring, enabled: !scoring.enabled })}
                className="relative h-6 w-11 rounded-full transition-colors duration-300"
                style={{ background: scoring.enabled ? "rgb(167,139,250)" : "rgba(148,163,184,0.4)" }}
              >
                <span
                  className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-300"
                  style={{ [scoring.enabled ? "left" : "right"]: "2px" } as React.CSSProperties}
                />
              </button>
              فعال‌سازی حالت امتیازی چک‌لیست
            </label>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted">حداقل امتیاز مجاز برای معامله:</span>
              <input
                type="number"
                min={0}
                max={100}
                value={scoring.threshold}
                onChange={(e) =>
                  updateScoring({
                    ...scoring,
                    threshold: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                  })
                }
                className="w-20 rounded-lg border bg-white/10 px-2 py-1 text-center text-sm font-bold outline-none focus:ring-2"
                style={{ borderColor: "rgba(167,139,250,0.4)", color: "rgb(167,139,250)" }}
              />
              <span className="text-muted">/ ۱۰۰</span>
            </div>

            <span
              className="rounded-full px-3 py-1 text-xs font-bold transition-colors"
              style={{
                color: totalOk ? "rgb(52,211,153)" : "rgb(248,113,113)",
                background: totalOk ? "rgba(52,211,153,0.14)" : "rgba(248,113,113,0.14)",
                border: `1px solid ${totalOk ? "rgba(52,211,153,0.45)" : "rgba(248,113,113,0.45)"}`,
              }}
            >
              مجموع امتیازها: {faNum(configuredTotal)} / {faNum(100)}
              {!totalOk && " — باید ۱۰۰ شود"}
            </span>
          </div>
          <p className="mt-3 text-xs text-muted">
            به هر زیرموضوع یک امتیاز بدهید. مجموع همهٔ امتیازها باید ۱۰۰ شود. هنگام تکمیل
            چک‌لیست، با زدن تیک هر مورد امتیاز آن به امتیاز کل اضافه می‌شود.
          </p>
        </div>
      )}

      {templates.length === 0 && !creating && (
        <p className="text-sm text-muted">هنوز موضوعی تعریف نشده است.</p>
      )}

      {/* 3-column grid of topic cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((tpl, idx) => {
          const tint = TINTS[idx % TINTS.length].rgb;
          const tplDone = tpl.items.filter((it) => !!ticks[it.id]).length;
          const tplTotal = tpl.items.length;
          const tplPct = tplTotal ? Math.round((tplDone / tplTotal) * 100) : 0;
          const tplScore = tpl.items.reduce((s, it) => s + scoreOf(it.id), 0);

          if (editMode) {
            return (
              <EditableTopicCard
                key={tpl.id}
                tpl={tpl}
                tint={tint}
                saving={savingId === tpl.id}
                onSave={saveTemplate}
                onDelete={() => deleteTemplate(tpl.id)}
              />
            );
          }

          if (scoreMode) {
            return (
              <ScoringTopicCard
                key={tpl.id}
                tpl={tpl}
                tint={tint}
                subtotal={tplScore}
                scores={scoring.scores}
                onScore={(itemId, val) =>
                  updateScoring({
                    ...scoring,
                    scores: { ...scoring.scores, [itemId]: val },
                  })
                }
              />
            );
          }

          return (
            <div key={tpl.id} className="flex flex-col" style={tintStyle(tint)}>
              <div className="p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h3 className="font-bold text-sm" style={tintAccent(tint)}>
                    {tpl.title}
                  </h3>
                  <div className="flex items-center gap-2">
                    {scoringActive && tplScore > 0 && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                        style={{ ...tintBg(tint, 0.2), color: `rgb(${tint})` }}
                      >
                        {faNum(tplScore)} امتیاز
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      {faNum(tplDone)}/{faNum(tplTotal)}
                    </span>
                  </div>
                </div>
                <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-black/10">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${tplPct}%`, background: `rgb(${tint})` }}
                  />
                </div>
                <div className="space-y-2">
                  {tpl.items.map((it) => {
                    const on = !!ticks[it.id];
                    const s = scoreOf(it.id);
                    return (
                      <button
                        type="button"
                        key={it.id}
                        onClick={() => toggle(it.id)}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-right text-sm transition-all"
                        style={{
                          ...tintBg(tint, on ? 0.22 : 0.08),
                          ...tintBorder(tint),
                        }}
                      >
                        <span
                          className="grid h-5 w-5 shrink-0 place-items-center rounded-md"
                          style={{
                            background: on ? `rgb(${tint})` : `rgba(${tint},0.15)`,
                            border: `1.5px solid rgba(${tint},0.5)`,
                            color: "white",
                          }}
                        >
                          {on && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                        </span>
                        <span className={`flex-1 ${on ? "line-through opacity-60" : ""}`}>{it.text}</span>
                        {scoringActive && s > 0 && (
                          <span
                            className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                            style={{
                              color: on ? "#0b0f1a" : `rgb(${tint})`,
                              background: on ? `rgb(${tint})` : `rgba(${tint},0.16)`,
                            }}
                          >
                            {faNum(s)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {/* Create new topic card inline */}
        {creating && (
          <NewTopicCard
            tint={TINTS[templates.length % TINTS.length].rgb}
            onDone={() => { setCreating(false); load(); }}
            onCancel={() => setCreating(false)}
          />
        )}
      </div>

      {/* Confirm checklist (score gate) */}
      {scoringActive && !readOnly && !editMode && !scoreMode && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={confirmChecklist}
            className="rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-all hover:brightness-110 active:scale-95"
            style={{
              background: "linear-gradient(135deg, rgb(94,234,212), rgb(52,211,153))",
              boxShadow: "0 8px 24px -10px rgba(52,211,153,0.7)",
              color: "#0b0f1a",
            }}
          >
            ✓ تایید چک‌لیست
          </button>
          {confirmedOk && passes && (
            <span
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium"
              style={{
                color: "rgb(52,211,153)",
                background: "rgba(52,211,153,0.12)",
                border: "1px solid rgba(52,211,153,0.35)",
              }}
            >
              ✓ امتیاز کافی است — اجازهٔ معامله دارید ({faNum(earned)}/{faNum(100)})
            </span>
          )}
        </div>
      )}

      {/* Centred neon warning modal */}
      {warnOpen && (
        <ScoreWarningModal
          threshold={scoring.threshold}
          earned={earned}
          onClose={() => setWarnOpen(false)}
        />
      )}
    </div>
  );
}

/* ─── Neon warning modal ──────────────────────────────────────────────────── */
function ScoreWarningModal({
  threshold,
  earned,
  onClose,
}: {
  threshold: number;
  earned: number;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const RED = "248,68,68";

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center p-4"
      style={{ background: "rgba(2,6,20,0.62)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="tj-warn-pop relative w-full max-w-md p-8 text-center"
        style={{
          background: "var(--glass-bg)",
          border: "1px solid var(--glass-border)",
          borderRadius: "1.5rem",
          backdropFilter: "blur(22px) saturate(150%)",
          WebkitBackdropFilter: "blur(22px) saturate(150%)",
          boxShadow: `0 24px 80px -20px rgba(0,0,0,0.6), 0 0 60px -20px rgba(${RED},0.35), inset 0 1px 0 rgba(255,255,255,0.08)`,
        }}
      >
        {/* Close (×) */}
        <button
          type="button"
          onClick={onClose}
          aria-label="بستن"
          className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full text-lg transition-all hover:scale-110"
          style={{
            color: `rgb(${RED})`,
            background: `rgba(${RED},0.1)`,
            border: `1px solid rgba(${RED},0.35)`,
          }}
        >
          ✕
        </button>

        {/* Neon warning icon */}
        <div className="tj-warn-icon mx-auto mb-5 grid place-items-center">
          <svg
            width="76"
            height="76"
            viewBox="0 0 24 24"
            fill="none"
            stroke={`rgb(${RED})`}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 6px rgba(${RED},0.9)) drop-shadow(0 0 16px rgba(${RED},0.6))` }}
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        {/* Neon red message */}
        <p
          className="text-lg font-extrabold leading-8"
          style={{
            color: `rgb(${RED})`,
            textShadow: `0 0 8px rgba(${RED},0.85), 0 0 22px rgba(${RED},0.55)`,
          }}
        >
          امتیاز چک‌لیست شما از حد مجاز {faNum(threshold)} عدد پایین است.
          <br />
          شما اجازهٔ معامله کردن ندارید.
        </p>

        <p className="mt-3 text-sm text-muted">
          امتیاز کسب‌شده: <span className="font-bold">{faNum(earned)}</span> از {faNum(100)}
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 rounded-xl px-6 py-2 text-sm font-bold transition-all hover:scale-105"
          style={{
            color: `rgb(${RED})`,
            background: `rgba(${RED},0.12)`,
            border: `1px solid rgba(${RED},0.45)`,
            boxShadow: `0 0 20px -6px rgba(${RED},0.5)`,
          }}
        >
          متوجه شدم
        </button>
      </div>

      <style jsx>{`
        .tj-warn-pop {
          animation: tjWarnPop 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .tj-warn-icon {
          animation: tjWarnPulse 1.6s ease-in-out infinite;
        }
        @keyframes tjWarnPop {
          0% { transform: scale(0.82) translateY(14px); opacity: 0; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes tjWarnPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}

/* ─── Scoring topic card (assign points) ──────────────────────────────────── */
function ScoringTopicCard({
  tpl,
  tint,
  subtotal,
  scores,
  onScore,
}: {
  tpl: ChecklistTemplate;
  tint: string;
  subtotal: number;
  scores: Record<string, number>;
  onScore: (itemId: string, val: number) => void;
}) {
  return (
    <div className="flex flex-col" style={tintStyle(tint)}>
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-bold text-sm" style={tintAccent(tint)}>{tpl.title}</h3>
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
            style={{ ...tintBg(tint, 0.2), color: `rgb(${tint})` }}
          >
            {faNum(subtotal)} امتیاز
          </span>
        </div>
        <div className="space-y-2">
          {tpl.items.map((it) => (
            <div
              key={it.id}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
              style={{ ...tintBg(tint, 0.08), ...tintBorder(tint) }}
            >
              <span className="flex-1">{it.text}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={scores[it.id] ?? 0}
                onChange={(e) =>
                  onScore(it.id, Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                }
                className="w-16 rounded-lg border bg-white/10 px-2 py-1 text-center text-sm font-bold outline-none focus:ring-1"
                style={{ borderColor: `rgba(${tint},0.4)`, color: `rgb(${tint})` }}
              />
            </div>
          ))}
          {tpl.items.length === 0 && (
            <p className="text-xs text-muted">این موضوع زیرموضوعی ندارد.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Editable topic card ─────────────────────────────────────────────────── */
function EditableTopicCard({
  tpl: initial,
  tint,
  saving,
  onSave,
  onDelete,
}: {
  tpl: ChecklistTemplate;
  tint: string;
  saving: boolean;
  onSave: (tpl: ChecklistTemplate) => void;
  onDelete: () => void;
}) {
  const [tpl, setTpl] = useState<ChecklistTemplate>(initial);
  const [newItemText, setNewItemText] = useState("");

  const updateTitle = (title: string) => setTpl((p) => ({ ...p, title }));

  const updateItem = (id: string, text: string) =>
    setTpl((p) => ({
      ...p,
      items: p.items.map((it) => (it.id === id ? { ...it, text } : it)),
    }));

  const removeItem = (id: string) =>
    setTpl((p) => ({ ...p, items: p.items.filter((it) => it.id !== id) }));

  const addItem = () => {
    const text = newItemText.trim();
    if (!text) return;
    const id = `i${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setTpl((p) => ({ ...p, items: [...p.items, { id, text }] }));
    setNewItemText("");
  };

  const dirty = JSON.stringify(tpl) !== JSON.stringify(initial);

  return (
    <div className="flex flex-col" style={tintStyle(tint)}>
      <div className="p-4 space-y-3">
        {/* Title */}
        <input
          className="w-full rounded-lg border bg-white/20 px-3 py-1.5 text-sm font-bold outline-none focus:ring-2"
          style={{ borderColor: `rgba(${tint},0.4)`, color: `rgb(${tint})` }}
          value={tpl.title}
          onChange={(e) => updateTitle(e.target.value)}
          placeholder="عنوان موضوع"
        />

        {/* Items */}
        <div className="space-y-1.5">
          {tpl.items.map((it) => (
            <div key={it.id} className="flex items-center gap-2">
              <input
                className="flex-1 rounded-lg border bg-white/10 px-2 py-1 text-sm outline-none focus:ring-1"
                style={{ borderColor: `rgba(${tint},0.3)` }}
                value={it.text}
                onChange={(e) => updateItem(it.id, e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeItem(it.id)}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-500/10"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Add new sub-topic */}
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border bg-white/10 px-2 py-1 text-sm outline-none"
            style={{ borderColor: `rgba(${tint},0.3)` }}
            placeholder="+ مورد جدید"
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
          />
          <button
            type="button"
            onClick={addItem}
            className="shrink-0 rounded-lg px-3 py-1 text-xs font-medium text-white"
            style={{ background: `rgba(${tint},0.7)` }}
          >
            +
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={saving || !dirty}
            onClick={() => onSave(tpl)}
            className="flex-1 rounded-xl py-1.5 text-xs font-medium text-white disabled:opacity-40"
            style={{ background: `rgba(${tint},0.75)` }}
          >
            {saving ? "در حال ذخیره…" : "ذخیره"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-xl border border-red-400/40 px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10"
          >
            حذف
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── New topic card ──────────────────────────────────────────────────────── */
function NewTopicCard({
  tint,
  onDone,
  onCancel,
}: {
  tint: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [itemDraft, setItemDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const addItem = () => {
    const text = itemDraft.trim();
    if (!text) return;
    setItems((p) => [...p, { id: `i${Date.now()}_${Math.random().toString(36).slice(2)}`, text }]);
    setItemDraft("");
  };

  const removeItem = (id: string) => setItems((p) => p.filter((it) => it.id !== id));

  const save = async () => {
    if (!title.trim() || items.length === 0) return;
    setSaving(true);
    try {
      await checklistsApi.create({ title: title.trim(), items });
      onDone();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col" style={tintStyle(tint)}>
      <div className="p-4 space-y-3">
        <input
          className="w-full rounded-lg border bg-white/20 px-3 py-1.5 text-sm font-bold outline-none"
          style={{ borderColor: `rgba(${tint},0.4)`, color: `rgb(${tint})` }}
          placeholder="عنوان موضوع"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />

        <div className="space-y-1.5">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-2">
              <span className="flex-1 rounded-lg border bg-white/10 px-2 py-1 text-sm"
                style={{ borderColor: `rgba(${tint},0.2)` }}>
                {it.text}
              </span>
              <button type="button" onClick={() => removeItem(it.id)}
                className="text-xs text-red-400 hover:text-red-600">✕</button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border bg-white/10 px-2 py-1 text-sm outline-none"
            style={{ borderColor: `rgba(${tint},0.3)` }}
            placeholder="+ مورد جدید"
            value={itemDraft}
            onChange={(e) => setItemDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
          />
          <button type="button" onClick={addItem}
            className="shrink-0 rounded-lg px-3 py-1 text-xs font-medium text-white"
            style={{ background: `rgba(${tint},0.7)` }}>
            +
          </button>
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" disabled={saving || !title.trim() || items.length === 0}
            onClick={save}
            className="flex-1 rounded-xl py-1.5 text-xs font-medium text-white disabled:opacity-40"
            style={{ background: `rgba(${tint},0.75)` }}>
            {saving ? "در حال ذخیره…" : "ذخیره موضوع"}
          </button>
          <button type="button" onClick={onCancel}
            className="rounded-xl border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface-2">
            انصراف
          </button>
        </div>
      </div>
    </div>
  );
}
