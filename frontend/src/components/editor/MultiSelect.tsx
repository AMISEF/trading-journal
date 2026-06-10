"use client";

/**
 * A multi-select chip control over a list of string options, with an
 * "add new" box. Used for entry/exit reasons (persisted) and for
 * emotion multi-select topics (local-only).
 */
import { useState } from "react";

export function MultiSelect({
  options,
  selected,
  onChange,
  onAddOption,
  placeholder = "افزودن مورد جدید…",
  allowAdd = true,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Called when the user adds a brand-new option (persist if needed). */
  onAddOption?: (text: string) => void;
  placeholder?: string;
  allowAdd?: boolean;
}) {
  const [draft, setDraft] = useState("");

  const toggle = (opt: string) => {
    if (selected.includes(opt)) onChange(selected.filter((s) => s !== opt));
    else onChange([...selected, opt]);
  };

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    if (!options.includes(text)) onAddOption?.(text);
    if (!selected.includes(text)) onChange([...selected, text]);
    setDraft("");
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const on = selected.includes(opt);
          return (
            <button
              type="button"
              key={opt}
              onClick={() => toggle(opt)}
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
        {options.length === 0 && (
          <span className="text-sm text-muted">موردی تعریف نشده است.</span>
        )}
      </div>

      {allowAdd && (
        <div className="mt-3 flex gap-2">
          <input
            className="tj-input"
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
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
