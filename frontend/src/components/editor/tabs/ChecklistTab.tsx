"use client";

/**
 * "چک‌لیست" tab.
 * - 3 topic cards per row, each with a unique pastel color
 * - Edit mode: rename topic, add/delete/rename sub-topics
 * - Ticking items persisted per-trade in checklistTicks
 */
import { useEffect, useState } from "react";
import { useTrade } from "@/store/trade";
import { checklistsApi } from "@/lib/api";
import { Button } from "@/components/ui";
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

export function ChecklistTab({ readOnly = false }: { readOnly?: boolean }) {
  const trade = useTrade((s) => s.trade);
  const patch = useTrade((s) => s.patch);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = () => checklistsApi.list().then(setTemplates).catch(() => {});
  useEffect(() => { load(); }, []);

  if (!trade) return null;

  const ticks = trade.checklistTicks || {};
  const toggle = (itemId: string) => {
    if (readOnly || editMode) return;
    patch({ checklistTicks: { ...ticks, [itemId]: !ticks[itemId] } });
  };

  const allItems = templates.flatMap((t) => t.items);
  const done = allItems.filter((it) => ticks[it.id]).length;
  const total = allItems.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

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

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="glass p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold">پیشرفت چک‌لیست</span>
          <span className="text-muted">
            {faNum(done)}/{faNum(total)} — {faNum(pct)}٪
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
              editMode
                ? "border-primary bg-primary text-white shadow-md"
                : "border-border bg-surface-2 text-text hover:border-primary"
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

          return editMode ? (
            <EditableTopicCard
              key={tpl.id}
              tpl={tpl}
              tint={tint}
              saving={savingId === tpl.id}
              onSave={saveTemplate}
              onDelete={() => deleteTemplate(tpl.id)}
            />
          ) : (
            <div key={tpl.id} className="flex flex-col" style={tintStyle(tint)}>
              <div className="p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h3 className="font-bold text-sm" style={tintAccent(tint)}>
                    {tpl.title}
                  </h3>
                  <span className="text-xs text-muted">
                    {faNum(tplDone)}/{faNum(tplTotal)}
                  </span>
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
                        <span className={on ? "line-through opacity-60" : ""}>{it.text}</span>
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
