"use client";

import { useEffect, useState } from "react";
import { useTrade } from "@/store/trade";
import { useAuth } from "@/store/auth";
import { SingleSelect } from "../MultiSelect";
import { FilledCheck, Field, Slider, TextArea } from "../fields";

const STATES_BEFORE = ["آرام", "هیجان‌زده", "مضطرب", "بی‌تفاوت", "مطمئن", "ترسیده"];
const FEELINGS_AFTER = ["راضی", "پشیمان", "خنثی", "عصبانی", "سرخوش"];

const DEFAULT_MOTIVATIONS = ["ستاپ معتبر", "ترس از دست‌دادن", "انتقام", "خستگی", "اعتماد به تحلیل"];
const DEFAULT_MISTAKES = ["ورود زودهنگام", "جابه‌جایی استاپ", "حجم زیاد", "بدون پلن", "خروج هیجانی"];

function motivationKey(userId: string) { return `tj_motivations_${userId}`; }
function mistakesKey(userId: string) { return `tj_mistakes_${userId}`; }

function loadList(key: string, defaults: string[]): string[] {
  if (typeof window === "undefined") return defaults;
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : defaults;
  } catch { return defaults; }
}

function saveList(key: string, list: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(list));
}

function ManageableMultiSelect({
  storageKey,
  defaults,
  selected,
  onChange,
  readOnly,
}: {
  storageKey: string;
  defaults: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  readOnly: boolean;
}) {
  const [options, setOptions] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");

  useEffect(() => { setOptions(loadList(storageKey, defaults)); }, []);

  const persist = (updated: string[]) => {
    setOptions(updated);
    saveList(storageKey, updated);
  };

  const toggle = (opt: string) => {
    if (readOnly) return;
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  };

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    if (!options.includes(text)) {
      persist([...options, text]);
      onChange([...selected, text]);
    }
    setDraft("");
  };

  const deleteOpt = (opt: string) => {
    persist(options.filter((o) => o !== opt));
    onChange(selected.filter((s) => s !== opt));
  };

  const startEdit = (idx: number) => { setEditIdx(idx); setEditVal(options[idx]); };

  const confirmEdit = () => {
    if (editIdx === null) return;
    const newVal = editVal.trim();
    const oldVal = options[editIdx];
    if (newVal && (newVal === oldVal || !options.includes(newVal))) {
      const updated = options.map((o, i) => (i === editIdx ? newVal : o));
      persist(updated);
      onChange(selected.map((s) => (s === oldVal ? newVal : s)));
    }
    setEditIdx(null);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {options.length === 0 && (
          <span className="text-sm text-muted">موردی تعریف نشده است.</span>
        )}
        {options.map((opt, i) => {
          const on = selected.includes(opt);
          if (editIdx === i) {
            return (
              <div key={opt} className="flex items-center gap-1">
                <input
                  className="tj-input py-1 text-sm w-32"
                  value={editVal}
                  autoFocus
                  onChange={(e) => setEditVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmEdit();
                    if (e.key === "Escape") setEditIdx(null);
                  }}
                />
                <button type="button" onClick={confirmEdit} className="rounded bg-profit px-2 py-1 text-xs text-white">✓</button>
                <button type="button" onClick={() => setEditIdx(null)} className="rounded border border-border px-2 py-1 text-xs">✕</button>
              </div>
            );
          }
          return (
            <div key={opt} className="flex items-center">
              <button
                type="button"
                onClick={() => toggle(opt)}
                className={`rounded-r-full border px-3 py-1 text-sm ${on ? "border-primary bg-primary text-white" : "border-border bg-surface-2 text-text hover:border-primary"}`}
              >
                {opt}
              </button>
              {!readOnly && (
                <div className="flex border border-r-0 border-border rounded-l-full overflow-hidden">
                  <button type="button" onClick={() => startEdit(i)} className="px-1.5 py-1 text-xs text-muted hover:text-primary hover:bg-surface-2" title="ویرایش">✎</button>
                  <button type="button" onClick={() => deleteOpt(opt)} className="px-1.5 py-1 text-xs text-muted hover:text-loss hover:bg-surface-2" title="حذف">×</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!readOnly && (
        <div className="mt-3 flex gap-2">
          <input
            className="tj-input flex-1"
            value={draft}
            placeholder="افزودن گزینه جدید… (Enter)"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          />
          <button type="button" onClick={add} className="shrink-0 rounded-lg bg-primary px-4 text-sm font-medium text-white">افزودن</button>
        </div>
      )}
    </div>
  );
}

export function EmotionsTab({ readOnly = false }: { readOnly?: boolean }) {
  const trade = useTrade((s) => s.trade);
  const patch = useTrade((s) => s.patch);
  const user = useAuth((s) => s.user);
  const [sub, setSub] = useState<"before" | "after">("before");

  if (!trade || !user) return null;

  const mKey = motivationKey(user.id);
  const msKey = mistakesKey(user.id);

  const e = (trade.emotions || {}) as Record<string, any>;
  const setE = (key: string, val: unknown) => {
    if (readOnly) return;
    patch({ emotions: { ...e, [key]: val } });
  };

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-lg border border-border bg-surface-2 p-1">
        <SubTab active={sub === "before"} onClick={() => setSub("before")}>قبل از معامله</SubTab>
        <SubTab active={sub === "after"} onClick={() => setSub("after")}>بعد از معامله</SubTab>
      </div>

      {sub === "before" ? (
        <div className="space-y-6">
          <Field label={<>وضعیت احساسی <FilledCheck filled={!!e.stateBefore} /></>}>
            <SingleSelect options={STATES_BEFORE} value={e.stateBefore ?? null} onChange={(v) => setE("stateBefore", v)} />
          </Field>
          <Slider label="سطح انرژی (۱ تا ۱۰)" value={e.energy ?? 5} onChange={(v) => setE("energy", v)} />
          <Slider label="اطمینان به ستاپ (۱ تا ۱۰)" value={e.setupConfidence ?? 5} onChange={(v) => setE("setupConfidence", v)} />
          <Field label={<>انگیزه‌ی ورود <FilledCheck filled={(e.entryMotivation ?? []).length > 0} /></>}>
            <ManageableMultiSelect
              storageKey={mKey}
              defaults={DEFAULT_MOTIVATIONS}
              selected={e.entryMotivation ?? []}
              onChange={(v) => setE("entryMotivation", v)}
              readOnly={readOnly}
            />
          </Field>
        </div>
      ) : (
        <div className="space-y-6">
          <Field label={<>احساس پس از معامله <FilledCheck filled={!!e.feelingAfter} /></>}>
            <SingleSelect options={FEELINGS_AFTER} value={e.feelingAfter ?? null} onChange={(v) => setE("feelingAfter", v)} />
          </Field>
          <Slider label="کیفیت اجرا (۱ تا ۱۰)" value={e.executionQuality ?? 5} onChange={(v) => setE("executionQuality", v)} />
          <Field label={<>خطاهای رفتاری <FilledCheck filled={(e.mistakes ?? []).length > 0} /></>}>
            <ManageableMultiSelect
              storageKey={msKey}
              defaults={DEFAULT_MISTAKES}
              selected={e.mistakes ?? []}
              onChange={(v) => setE("mistakes", v)}
              readOnly={readOnly}
            />
          </Field>
          <Field label={<>درس‌ها <FilledCheck filled={!!e.lessons} /></>}>
            <TextArea value={e.lessons ?? ""} onChange={(v) => setE("lessons", v)} rows={4} />
          </Field>
        </div>
      )}
    </div>
  );
}

function SubTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-4 py-1.5 text-sm font-medium ${active ? "bg-primary text-white" : "text-muted"}`}
    >
      {children}
    </button>
  );
}
