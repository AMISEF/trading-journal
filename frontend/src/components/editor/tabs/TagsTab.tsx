"use client";

/** "برچسب‌ها" tab: persistent colored tags stored in localStorage + per-trade selection. */
import { useEffect, useState } from "react";
import { useTrade } from "@/store/trade";
import { Field } from "../fields";

const TAG_COLORS = [
  { bg: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  { bg: "bg-green-100 text-green-700", dot: "bg-green-500" },
  { bg: "bg-yellow-100 text-yellow-700", dot: "bg-yellow-500" },
  { bg: "bg-red-100 text-red-700", dot: "bg-red-500" },
  { bg: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  { bg: "bg-pink-100 text-pink-700", dot: "bg-pink-500" },
  { bg: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500" },
  { bg: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
];

interface GlobalTag {
  name: string;
  colorIdx: number;
}

const STORAGE_KEY = "tj_global_tags";

function loadGlobalTags(): GlobalTag[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveGlobalTags(tags: GlobalTag[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
}

export function TagsTab({ readOnly = false }: { readOnly?: boolean }) {
  const trade = useTrade((s) => s.trade);
  const patch = useTrade((s) => s.patch);
  const [globalTags, setGlobalTags] = useState<GlobalTag[]>([]);
  const [draft, setDraft] = useState("");
  const [colorIdx, setColorIdx] = useState(0);

  useEffect(() => {
    setGlobalTags(loadGlobalTags());
  }, []);

  if (!trade) return null;

  const toggleTag = (name: string) => {
    if (readOnly) return;
    const has = trade.tags.includes(name);
    patch({ tags: has ? trade.tags.filter((x) => x !== name) : [...trade.tags, name] });
  };

  const addGlobal = () => {
    const t = draft.trim();
    if (!t || globalTags.some((g) => g.name === t)) {
      setDraft("");
      return;
    }
    const updated = [...globalTags, { name: t, colorIdx }];
    setGlobalTags(updated);
    saveGlobalTags(updated);
    patch({ tags: [...trade.tags, t] });
    setDraft("");
    setColorIdx((colorIdx + 1) % TAG_COLORS.length);
  };

  const removeGlobal = (name: string) => {
    const updated = globalTags.filter((g) => g.name !== name);
    setGlobalTags(updated);
    saveGlobalTags(updated);
    patch({ tags: trade.tags.filter((t) => t !== name) });
  };

  return (
    <div className="space-y-5">
      <Field label="برچسب‌های این معامله">
        <div className="flex flex-wrap gap-2">
          {globalTags.length === 0 && (
            <span className="text-sm text-muted">هنوز برچسبی تعریف نشده است.</span>
          )}
          {globalTags.map((g) => {
            const col = TAG_COLORS[g.colorIdx % TAG_COLORS.length];
            const active = trade.tags.includes(g.name);
            return (
              <button
                key={g.name}
                type="button"
                onClick={() => toggleTag(g.name)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition ${
                  active ? col.bg + " ring-2 ring-offset-1 ring-current" : "bg-surface-2 text-muted"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                {g.name}
              </button>
            );
          })}
        </div>
      </Field>

      {!readOnly && (
        <div className="tj-card space-y-3 p-4">
          <div className="tj-label">افزودن برچسب جدید (ذخیره‌شدنی)</div>
          <div className="flex gap-2">
            <input
              className="tj-input flex-1"
              value={draft}
              placeholder="نام برچسب… (Enter)"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addGlobal(); }
              }}
            />
            <button
              type="button"
              onClick={addGlobal}
              className="shrink-0 rounded-lg bg-primary px-4 text-sm font-medium text-white"
            >
              افزودن
            </button>
          </div>
          {/* Color picker */}
          <div className="flex flex-wrap gap-2">
            {TAG_COLORS.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setColorIdx(i)}
                className={`h-6 w-6 rounded-full ${c.dot} ${i === colorIdx ? "ring-2 ring-offset-2 ring-primary" : ""}`}
              />
            ))}
          </div>
        </div>
      )}

      {!readOnly && globalTags.length > 0 && (
        <div className="space-y-1">
          <div className="tj-label text-xs text-muted">مدیریت برچسب‌های جهانی</div>
          <div className="flex flex-wrap gap-2">
            {globalTags.map((g) => {
              const col = TAG_COLORS[g.colorIdx % TAG_COLORS.length];
              return (
                <span key={g.name} className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm ${col.bg}`}>
                  {g.name}
                  <button type="button" onClick={() => removeGlobal(g.name)} className="ml-1 text-xs opacity-70 hover:opacity-100">×</button>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
