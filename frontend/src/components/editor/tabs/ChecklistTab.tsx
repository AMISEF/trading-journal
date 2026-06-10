"use client";

/**
 * "چک‌لیست" tab.
 * Loads checklist templates (/checklists), renders items as checkboxes,
 * stores ticks per-trade in checklistTicks, shows an x/n progress bar,
 * and lets the user create a new template.
 */
import { useEffect, useState } from "react";
import { useTrade } from "@/store/trade";
import { checklistsApi } from "@/lib/api";
import { Button } from "@/components/ui";
import { faNum } from "@/lib/format";
import type { ChecklistTemplate } from "@/lib/types";

export function ChecklistTab({ readOnly = false }: { readOnly?: boolean }) {
  const trade = useTrade((s) => s.trade);
  const patch = useTrade((s) => s.patch);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [creating, setCreating] = useState(false);

  const load = () => checklistsApi.list().then(setTemplates).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  if (!trade) return null;

  const ticks = trade.checklistTicks || {};
  const toggle = (itemId: string) => {
    if (readOnly) return;
    patch({ checklistTicks: { ...ticks, [itemId]: !ticks[itemId] } });
  };

  // Overall progress across all templates.
  const allItems = templates.flatMap((t) => t.items);
  const done = allItems.filter((it) => ticks[it.id]).length;
  const total = allItems.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="tj-card p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">پیشرفت چک‌لیست</span>
          <span className="text-muted">
            {faNum(done)}/{faNum(total)} — {faNum(pct)}٪
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {templates.length === 0 && (
        <p className="text-sm text-muted">
          هنوز چک‌لیستی تعریف نشده است. یکی بسازید.
        </p>
      )}

      {templates.map((tpl) => {
        const tplDone = tpl.items.filter((it) => !!ticks[it.id]).length;
        const tplTotal = tpl.items.length;
        const tplPct = tplTotal ? Math.round((tplDone / tplTotal) * 100) : 0;
        return (
        <div key={tpl.id} className="tj-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold">{tpl.title}</h3>
            <span className="text-xs text-muted">{faNum(tplDone)}/{faNum(tplTotal)} — {faNum(tplPct)}٪</span>
          </div>
          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${tplPct}%` }} />
          </div>
          <div className="space-y-2">
            {tpl.items.map((it) => {
              const on = !!ticks[it.id];
              return (
                <button
                  type="button"
                  key={it.id}
                  onClick={() => toggle(it.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-right text-sm ${
                    on
                      ? "border-profit bg-profit-soft"
                      : "border-border bg-surface-2"
                  }`}
                >
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${
                      on ? "border-profit bg-profit text-white" : "border-muted"
                    }`}
                  >
                    {on && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  {/* NO strikethrough on ticked text (per spec). */}
                  <span>{it.text}</span>
                </button>
              );
            })}
          </div>
        </div>
        );
      })}

      {!readOnly && (
        <div>
          {creating ? (
            <NewChecklistForm
              onDone={() => {
                setCreating(false);
                load();
              }}
              onCancel={() => setCreating(false)}
            />
          ) : (
            <Button variant="ghost" onClick={() => setCreating(true)}>
              + افزودن چک‌لیست
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Inline form to create a checklist template (title + newline-separated items). */
function NewChecklistForm({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [itemsText, setItemsText] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const items = itemsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text, i) => ({ id: `i${Date.now()}_${i}`, text }));
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
    <div className="tj-card space-y-3 p-4">
      <input
        className="tj-input"
        placeholder="عنوان چک‌لیست"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="tj-input"
        rows={4}
        placeholder="هر مورد در یک خط…"
        value={itemsText}
        onChange={(e) => setItemsText(e.target.value)}
      />
      <div className="flex gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? "در حال ذخیره…" : "ذخیره چک‌لیست"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          انصراف
        </Button>
      </div>
    </div>
  );
}
