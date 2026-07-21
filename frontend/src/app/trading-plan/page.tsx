"use client";

/**
 * «تریدینگ پلن» (/trading-plan).
 * A personal trading plan built like the checklist: topics with sub-topics, but
 * no ticking — it's just structured notes the trader writes and keeps. Ships with
 * ready-made demo plans for several trading styles (SMC / ICT / Al Brooks / …)
 * that the user can preview, copy into their own plan, then dismiss.
 *
 * Stored per-user in localStorage (personal notes; no backend schema needed).
 */
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/store/auth";
import { faNum } from "@/lib/format";
import { DEMO_PLANS, type PlanTopic, type PlanItem } from "./demos";

const TINTS = [
  "94,234,212", "167,139,250", "125,211,252", "251,191,36",
  "244,114,182", "52,211,153", "251,146,160", "196,181,253",
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
const rid = (p: string) => `${p}${Date.now()}_${Math.random().toString(36).slice(2)}`;

const storageKey = (uid: string) => `tj_trading_plan_${uid}`;
function loadPlan(uid: string): PlanTopic[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(uid)) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function savePlan(uid: string, topics: PlanTopic[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(uid), JSON.stringify(topics));
}

export default function TradingPlanPage() {
  return (
    <AppShell>
      <TradingPlanInner />
    </AppShell>
  );
}

function TradingPlanInner() {
  const user = useAuth((s) => s.user);
  const [topics, setTopics] = useState<PlanTopic[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [creating, setCreating] = useState(false);
  const [demoId, setDemoId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    setTopics(loadPlan(user.id));
    setLoaded(true);
  }, [user?.id]);

  const persist = (next: PlanTopic[]) => {
    setTopics(next);
    if (user?.id) savePlan(user.id, next);
  };

  const demo = useMemo(() => DEMO_PLANS.find((d) => d.id === demoId) || null, [demoId]);

  const addTopic = (t: PlanTopic) => persist([...topics, t]);
  const updateTopic = (t: PlanTopic) => persist(topics.map((x) => (x.id === t.id ? t : x)));
  const removeTopic = (id: string) => persist(topics.filter((x) => x.id !== id));

  const importDemo = () => {
    if (!demo) return;
    const copied: PlanTopic[] = demo.topics.map((t) => ({
      id: rid("t"),
      title: t.title,
      items: t.items.map((it) => ({ id: rid("i"), text: it.text })),
    }));
    persist([...topics, ...copied]);
    setDemoId(null);
  };

  return (
    <div className="relative space-y-6">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="animate-blob absolute -right-32 top-0 h-[440px] w-[440px] rounded-full blur-[120px]" style={{ background: "rgba(167,139,250,0.14)" }} />
        <div className="animate-blob-slow absolute -left-32 top-1/3 h-[420px] w-[420px] rounded-full blur-[120px]" style={{ background: "rgba(94,234,212,0.12)" }} />
      </div>

      {/* Title */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1
            className="text-3xl font-extrabold tracking-tight"
            style={{
              backgroundImage: "linear-gradient(120deg, rgb(167,139,250), rgb(125,211,252), rgb(94,234,212))",
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            }}
          >
            تریدینگ پلن
          </h1>
          <span className="h-2.5 w-2.5 rounded-full animate-pulse-dot" style={{ background: "rgb(167,139,250)" }} />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
              editMode ? "border-primary bg-primary text-white shadow-md" : "border-border bg-surface-2 hover:border-primary"
            }`}
          >
            {editMode ? "✓ پایان ویرایش" : "✏️ ویرایش موضوعات"}
          </button>
          {!editMode && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm font-medium hover:border-primary"
            >
              + موضوع جدید
            </button>
          )}
        </div>
      </div>

      <p className="-mt-2 max-w-3xl text-sm text-muted">
        پلن معاملاتی‌ات را این‌جا بساز: هر موضوع (مثلاً «قوانین ورود»، «مدیریت ریسک») را با چند زیرموضوع بنویس.
        برای الهام‌گرفتن می‌توانی یکی از دموهای آماده را ببینی و در صورت تمایل به پلن خودت اضافه کنی.
      </p>

      {/* Demo gallery */}
      <div className="rounded-2xl p-4" style={{ background: "linear-gradient(150deg, rgba(125,211,252,0.12), rgba(167,139,250,0.05) 60%, var(--glass-bg))", border: "1px solid rgba(125,211,252,0.28)" }}>
        <div className="mb-3 flex items-center gap-2 text-sm font-bold">
          <span>🎬 دموهای آماده (بر اساس سبک‌های معاملاتی)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {DEMO_PLANS.map((d, i) => {
            const tint = TINTS[i % TINTS.length];
            const active = demoId === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setDemoId(active ? null : d.id)}
                className="rounded-xl px-3.5 py-2 text-xs font-bold transition-all hover:-translate-y-0.5"
                style={
                  active
                    ? { background: `linear-gradient(120deg, rgba(${tint},0.95), rgba(${tint},0.65))`, color: "#06121f", boxShadow: `0 8px 22px -10px rgba(${tint},0.8)` }
                    : { border: `1px solid rgba(${tint},0.4)`, color: `rgb(${tint})`, background: `rgba(${tint},0.08)` }
                }
              >
                {d.name}
              </button>
            );
          })}
        </div>

        {demo && (
          <div className="mt-4 animate-[fadeIn_.3s_ease]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <span className="font-bold">{demo.name}</span>
                <span className="mx-2 text-muted">—</span>
                <span className="text-muted">{demo.subtitle}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={importDemo}
                  className="rounded-lg px-3 py-1.5 text-xs font-bold text-[#06121f]"
                  style={{ background: "linear-gradient(120deg, rgb(94,234,212), rgb(52,211,153))" }}
                >
                  + افزودن به پلن من
                </button>
                <button
                  type="button"
                  onClick={() => setDemoId(null)}
                  className="rounded-lg border border-red-400/50 px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-500/10"
                >
                  ✕ حذف دمو
                </button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {demo.topics.map((t, idx) => (
                <ReadTopicCard key={t.title} topic={t} tint={TINTS[idx % TINTS.length]} badge="دمو" />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* User's plan */}
      {loaded && topics.length === 0 && !creating && (
        <p className="text-sm text-muted">هنوز موضوعی به پلن خودت اضافه نکرده‌ای. یک «موضوع جدید» بساز یا از دموها اضافه کن.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {topics.map((t, idx) =>
          editMode ? (
            <EditableTopicCard
              key={t.id}
              topic={t}
              tint={TINTS[idx % TINTS.length]}
              onSave={updateTopic}
              onDelete={() => removeTopic(t.id)}
            />
          ) : (
            <ReadTopicCard key={t.id} topic={t} tint={TINTS[idx % TINTS.length]} />
          ),
        )}

        {creating && (
          <NewTopicCard
            tint={TINTS[topics.length % TINTS.length]}
            onDone={(t) => { addTopic(t); setCreating(false); }}
            onCancel={() => setCreating(false)}
          />
        )}
      </div>

      <style jsx>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}

/* ─── read-only topic card ────────────────────────────────────────────────── */
function ReadTopicCard({ topic, tint, badge }: { topic: { title: string; items: { text: string }[] }; tint: string; badge?: string }) {
  return (
    <div className="flex flex-col" style={tintStyle(tint)}>
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold" style={{ color: `rgb(${tint})` }}>{topic.title}</h3>
          {badge ? (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `rgba(${tint},0.2)`, color: `rgb(${tint})` }}>{badge}</span>
          ) : (
            <span className="text-xs text-muted">{faNum(topic.items.length)} مورد</span>
          )}
        </div>
        <ol className="space-y-2">
          {topic.items.map((it, i) => (
            <li key={i} className="flex gap-2.5 rounded-xl px-3 py-2 text-sm" style={{ background: `rgba(${tint},0.08)`, border: `1px solid rgba(${tint},0.28)` }}>
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] font-black" style={{ background: `rgba(${tint},0.9)`, color: "#06121f" }}>
                {faNum(i + 1)}
              </span>
              <span className="leading-6">{it.text}</span>
            </li>
          ))}
          {topic.items.length === 0 && <li className="text-xs text-muted">—</li>}
        </ol>
      </div>
    </div>
  );
}

/* ─── editable topic card ─────────────────────────────────────────────────── */
function EditableTopicCard({
  topic: initial, tint, onSave, onDelete,
}: {
  topic: PlanTopic; tint: string; onSave: (t: PlanTopic) => void; onDelete: () => void;
}) {
  const [topic, setTopic] = useState<PlanTopic>(initial);
  const [draft, setDraft] = useState("");
  const dirty = JSON.stringify(topic) !== JSON.stringify(initial);

  const addItem = () => {
    const text = draft.trim();
    if (!text) return;
    setTopic((p) => ({ ...p, items: [...p.items, { id: rid("i"), text }] }));
    setDraft("");
  };

  return (
    <div className="flex flex-col" style={tintStyle(tint)}>
      <div className="space-y-3 p-4">
        <input
          className="w-full rounded-lg border bg-white/20 px-3 py-1.5 text-sm font-bold outline-none focus:ring-2"
          style={{ borderColor: `rgba(${tint},0.4)`, color: `rgb(${tint})` }}
          value={topic.title}
          onChange={(e) => setTopic((p) => ({ ...p, title: e.target.value }))}
          placeholder="عنوان موضوع"
        />
        <div className="space-y-1.5">
          {topic.items.map((it) => (
            <div key={it.id} className="flex items-center gap-2">
              <textarea
                rows={1}
                className="flex-1 resize-none rounded-lg border bg-white/10 px-2 py-1 text-sm outline-none focus:ring-1"
                style={{ borderColor: `rgba(${tint},0.3)` }}
                value={it.text}
                onChange={(e) =>
                  setTopic((p) => ({ ...p, items: p.items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)) }))
                }
              />
              <button type="button" onClick={() => setTopic((p) => ({ ...p, items: p.items.filter((x) => x.id !== it.id) }))}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-500/10">✕</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border bg-white/10 px-2 py-1 text-sm outline-none"
            style={{ borderColor: `rgba(${tint},0.3)` }}
            placeholder="+ زیرموضوع جدید"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
          />
          <button type="button" onClick={addItem} className="shrink-0 rounded-lg px-3 py-1 text-xs font-medium text-white" style={{ background: `rgba(${tint},0.7)` }}>+</button>
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" disabled={!dirty} onClick={() => onSave(topic)}
            className="flex-1 rounded-xl py-1.5 text-xs font-medium text-white disabled:opacity-40" style={{ background: `rgba(${tint},0.75)` }}>ذخیره</button>
          <button type="button" onClick={onDelete}
            className="rounded-xl border border-red-400/40 px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10">حذف</button>
        </div>
      </div>
    </div>
  );
}

/* ─── new topic card ──────────────────────────────────────────────────────── */
function NewTopicCard({ tint, onDone, onCancel }: { tint: string; onDone: (t: PlanTopic) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<PlanItem[]>([]);
  const [draft, setDraft] = useState("");

  const addItem = () => {
    const text = draft.trim();
    if (!text) return;
    setItems((p) => [...p, { id: rid("i"), text }]);
    setDraft("");
  };
  const save = () => {
    if (!title.trim()) return;
    onDone({ id: rid("t"), title: title.trim(), items });
  };

  return (
    <div className="flex flex-col" style={tintStyle(tint)}>
      <div className="space-y-3 p-4">
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
              <span className="flex-1 rounded-lg border bg-white/10 px-2 py-1 text-sm" style={{ borderColor: `rgba(${tint},0.2)` }}>{it.text}</span>
              <button type="button" onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))} className="text-xs text-red-400 hover:text-red-600">✕</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border bg-white/10 px-2 py-1 text-sm outline-none"
            style={{ borderColor: `rgba(${tint},0.3)` }}
            placeholder="+ زیرموضوع جدید"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
          />
          <button type="button" onClick={addItem} className="shrink-0 rounded-lg px-3 py-1 text-xs font-medium text-white" style={{ background: `rgba(${tint},0.7)` }}>+</button>
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" disabled={!title.trim()} onClick={save}
            className="flex-1 rounded-xl py-1.5 text-xs font-medium text-white disabled:opacity-40" style={{ background: `rgba(${tint},0.75)` }}>ذخیره موضوع</button>
          <button type="button" onClick={onCancel}
            className="rounded-xl border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface-2">انصراف</button>
        </div>
      </div>
    </div>
  );
}
