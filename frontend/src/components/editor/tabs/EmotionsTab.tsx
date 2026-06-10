"use client";

/**
 * "احساسات" tab with two sub-tabs (قبل / بعد).
 * Everything is stored inside the trade's emotions(object).
 * Only "entry motivation" and "behavioral mistakes" are multi-select.
 */
import { useState } from "react";
import { useTrade } from "@/store/trade";
import { MultiSelect, SingleSelect } from "../MultiSelect";
import { FilledCheck, Field, Slider, TextArea } from "../fields";

// Preset option lists (users can still add new ones in multi-selects).
const STATES_BEFORE = ["آرام", "هیجان‌زده", "مضطرب", "بی‌تفاوت", "مطمئن", "ترسیده"];
const MOTIVATIONS = ["ستاپ معتبر", "ترس از دست‌دادن", "انتقام", "خستگی", "اعتماد به تحلیل"];
const FEELINGS_AFTER = ["راضی", "پشیمان", "خنثی", "عصبانی", "سرخوش"];
const MISTAKES = ["ورود زودهنگام", "جابه‌جایی استاپ", "حجم زیاد", "بدون پلن", "خروج هیجانی"];

export function EmotionsTab({ readOnly = false }: { readOnly?: boolean }) {
  const trade = useTrade((s) => s.trade);
  const patch = useTrade((s) => s.patch);
  const [sub, setSub] = useState<"before" | "after">("before");

  if (!trade) return null;

  // Helpers to read/write into emotions(object).
  const e = (trade.emotions || {}) as Record<string, any>;
  const setE = (key: string, val: unknown) => {
    if (readOnly) return;
    patch({ emotions: { ...e, [key]: val } });
  };

  return (
    <div className="space-y-6">
      {/* Sub-tab switcher */}
      <div className="inline-flex rounded-lg border border-border bg-surface-2 p-1">
        <SubTab active={sub === "before"} onClick={() => setSub("before")}>
          قبل از معامله
        </SubTab>
        <SubTab active={sub === "after"} onClick={() => setSub("after")}>
          بعد از معامله
        </SubTab>
      </div>

      {sub === "before" ? (
        <div className="space-y-6">
          <Field label={<>وضعیت احساسی <FilledCheck filled={!!e.stateBefore} /></>}>
            <SingleSelect
              options={STATES_BEFORE}
              value={e.stateBefore ?? null}
              onChange={(v) => setE("stateBefore", v)}
            />
          </Field>

          <Slider
            label="سطح انرژی (۱ تا ۱۰)"
            value={e.energy ?? 5}
            onChange={(v) => setE("energy", v)}
          />
          <Slider
            label="اطمینان به ستاپ (۱ تا ۱۰)"
            value={e.setupConfidence ?? 5}
            onChange={(v) => setE("setupConfidence", v)}
          />

          <Field
            label={
              <>
                انگیزه‌ی ورود (چندانتخابی){" "}
                <FilledCheck filled={(e.entryMotivation ?? []).length > 0} />
              </>
            }
          >
            <MultiSelect
              options={MOTIVATIONS}
              selected={e.entryMotivation ?? []}
              allowAdd={!readOnly}
              onChange={(v) => setE("entryMotivation", v)}
            />
          </Field>
        </div>
      ) : (
        <div className="space-y-6">
          <Field label={<>احساس پس از معامله <FilledCheck filled={!!e.feelingAfter} /></>}>
            <SingleSelect
              options={FEELINGS_AFTER}
              value={e.feelingAfter ?? null}
              onChange={(v) => setE("feelingAfter", v)}
            />
          </Field>

          <Slider
            label="کیفیت اجرا (۱ تا ۱۰)"
            value={e.executionQuality ?? 5}
            onChange={(v) => setE("executionQuality", v)}
          />

          <Field
            label={
              <>
                خطاهای رفتاری (چندانتخابی){" "}
                <FilledCheck filled={(e.mistakes ?? []).length > 0} />
              </>
            }
          >
            <MultiSelect
              options={MISTAKES}
              selected={e.mistakes ?? []}
              allowAdd={!readOnly}
              onChange={(v) => setE("mistakes", v)}
            />
          </Field>

          <Field label={<>درس‌ها <FilledCheck filled={!!e.lessons} /></>}>
            <TextArea
              value={e.lessons ?? ""}
              onChange={(v) => setE("lessons", v)}
              rows={4}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function SubTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-4 py-1.5 text-sm font-medium ${
        active ? "bg-primary text-white" : "text-muted"
      }`}
    >
      {children}
    </button>
  );
}
