"use client";

/** Reusable labeled form controls for the trade editor. */
import { faNum } from "@/lib/format";

export function Field({
  label,
  children,
  hint,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div>
      <label className="tj-label">{label}</label>
      {children}
      {hint && <div className="mt-1 text-xs">{hint}</div>}
    </div>
  );
}

/** Number input that emits a number | null. */
export function NumberInput({
  value,
  onChange,
  step,
  placeholder,
  disabled,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      dir="ltr"
      className="tj-input"
      step={step ?? "any"}
      placeholder={placeholder}
      disabled={disabled}
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? null : Number(v));
      }}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      className="tj-input resize-y"
      rows={rows}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Long/Short toggle (green/red). */
export function DirectionToggle({
  value,
  onChange,
  disabled,
}: {
  value: "LONG" | "SHORT";
  onChange: (v: "LONG" | "SHORT") => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("LONG")}
        className={`rounded-lg border py-2.5 text-sm font-bold ${
          value === "LONG"
            ? "border-profit bg-profit text-white"
            : "border-border bg-surface-2 text-profit"
        }`}
      >
        Long
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("SHORT")}
        className={`rounded-lg border py-2.5 text-sm font-bold ${
          value === "SHORT"
            ? "border-loss bg-loss text-white"
            : "border-border bg-surface-2 text-loss"
        }`}
      >
        Short
      </button>
    </div>
  );
}

/** Simple on/off switch with a label. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-2.5"
    >
      <span className="text-sm">{label}</span>
      <span
        className={`relative h-6 w-11 rounded-full transition ${
          checked ? "bg-profit" : "bg-border"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
            checked ? "left-0.5" : "left-[22px]"
          }`}
        />
      </span>
    </button>
  );
}

/** 1–10 style slider with a value bubble. */
export function Slider({
  value,
  onChange,
  min = 1,
  max = 10,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="tj-label mb-0">{label}</label>
        <span className="rounded-md bg-primary-soft px-2 py-0.5 text-sm font-bold text-primary">
          {faNum(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--primary)]"
      />
    </div>
  );
}

/** A small green check shown next to a "filled" topic. */
export function FilledCheck({ filled }: { filled: boolean }) {
  if (!filled) return null;
  return (
    <svg className="inline text-profit" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
