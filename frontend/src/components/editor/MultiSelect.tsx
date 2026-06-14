"use client";

/**
 * A multi-select control for entry/exit reasons.
 * Shows selected items as removable tags; provides a searchable input
 * that suggests library options and lets users add new ones.
 */
import { useState, useRef } from "react";

export function MultiSelect({
  options,
  selected,
  onChange,
  onAddOption,
  placeholder = "جستجو یا افزودن دلیل جدید…",
  allowAdd = true,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  onAddOption?: (text: string) => void;
  placeholder?: string;
  allowAdd?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const unselected = options.filter((o) => !selected.includes(o));
  const suggestions = draft.trim()
    ? unselected.filter((o) => o.includes(draft.trim()))
    : unselected;

  const remove = (opt: string) =>
    onChange(selected.filter((s) => s !== opt));

  const pick = (opt: string) => {
    if (!selected.includes(opt)) onChange([...selected, opt]);
    setDraft("");
    setOpen(false);
  };

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    if (!options.includes(text)) onAddOption?.(text);
    if (!selected.includes(text)) onChange([...selected, text]);
    setDraft("");
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      {/* Selected tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((opt) => (
            <span
              key={opt}
              className="flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 py-1 text-sm text-primary"
            >
              {opt}
              {allowAdd && (
                <button
                  type="button"
                  onClick={() => remove(opt)}
                  className="leading-none text-primary/60 hover:text-primary"
                  aria-label="حذف"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {selected.length === 0 && !allowAdd && (
        <span className="text-sm text-muted">موردی انتخاب نشده است.</span>
      )}

      {allowAdd && (
        <div className="relative">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              className="tj-input"
              value={draft}
              placeholder={placeholder}
              onChange={(e) => {
                setDraft(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 160)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (suggestions.length > 0 && !draft.trim()) return;
                  add();
                }
              }}
            />
            <button
              type="button"
              onClick={add}
              className="shrink-0 rounded-lg bg-primary px-4 text-sm font-medium text-white"
            >
              افزودن
            </button>
          </div>

          {open && suggestions.length > 0 && (
            <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
              {suggestions.slice(0, 10).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onMouseDown={() => pick(opt)}
                  className="w-full px-3 py-2 text-right text-sm hover:bg-surface-2"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Single-select chip row (e.g. emotional state). */
export function SingleSelect({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = value === opt;
        return (
          <button
            type="button"
            key={opt}
            onClick={() => onChange(opt)}
            className={`rounded-full border px-3 py-1 text-sm ${
              on
                ? "border-primary bg-primary text-white"
                : "border-border bg-surface-2 text-text hover:border-primary"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
