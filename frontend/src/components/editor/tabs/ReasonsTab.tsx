"use client";

/**
 * "دلایل ورود و خروج" tab.
 * Multi-selects for entry & exit reasons (backed by /reasons, add-new persists),
 * three note textareas, and two drag&drop image boxes.
 */
import { useEffect, useState } from "react";
import { useTrade } from "@/store/trade";
import { reasonsApi } from "@/lib/api";
import { MultiSelect } from "../MultiSelect";
import { ImageDrop } from "../ImageDrop";
import { Field, TextArea } from "../fields";
import type { ReasonTemplate } from "@/lib/types";

export function ReasonsTab({ readOnly = false }: { readOnly?: boolean }) {
  const trade = useTrade((s) => s.trade);
  const patch = useTrade((s) => s.patch);
  const [entryOpts, setEntryOpts] = useState<ReasonTemplate[]>([]);
  const [exitOpts, setExitOpts] = useState<ReasonTemplate[]>([]);

  useEffect(() => {
    reasonsApi.list("entry").then(setEntryOpts).catch(() => {});
    reasonsApi.list("exit").then(setExitOpts).catch(() => {});
  }, []);

  if (!trade) return null;

  const addEntry = async (text: string) => {
    try {
      const r = await reasonsApi.create("entry", text);
      setEntryOpts((o) => [...o, r]);
    } catch {}
  };
  const addExit = async (text: string) => {
    try {
      const r = await reasonsApi.create("exit", text);
      setExitOpts((o) => [...o, r]);
    } catch {}
  };

  return (
    <div className="space-y-6">
      <Field label="دلایل ورود">
        <MultiSelect
          options={entryOpts.map((o) => o.text)}
          selected={trade.entryReasons}
          allowAdd={!readOnly}
          onAddOption={addEntry}
          onChange={(entryReasons) => patch({ entryReasons })}
        />
      </Field>

      <Field label="دلایل خروج">
        <MultiSelect
          options={exitOpts.map((o) => o.text)}
          selected={trade.exitReasons}
          allowAdd={!readOnly}
          onAddOption={addExit}
          onChange={(exitReasons) => patch({ exitReasons })}
        />
      </Field>

      <div className="grid gap-6 md:grid-cols-2">
        <Field label="یادداشت ورود">
          <TextArea
            value={trade.entryNote ?? ""}
            onChange={(v) => patch({ entryNote: v })}
            placeholder="چرا وارد شدید؟"
          />
        </Field>
        <Field label="یادداشت خروج">
          <TextArea
            value={trade.exitNote ?? ""}
            onChange={(v) => patch({ exitNote: v })}
            placeholder="چرا خارج شدید؟"
          />
        </Field>
      </div>

      <Field label="یادداشت کلی">
        <TextArea
          value={trade.generalNote ?? ""}
          onChange={(v) => patch({ generalNote: v })}
          rows={4}
        />
      </Field>

      <div className="grid gap-6 md:grid-cols-2">
        <ImageDrop
          label="تصویر قبل"
          value={trade.imageBefore}
          disabled={readOnly}
          onChange={(url) => patch({ imageBefore: url })}
        />
        <ImageDrop
          label="تصویر بعد"
          value={trade.imageAfter}
          disabled={readOnly}
          onChange={(url) => patch({ imageAfter: url })}
        />
      </div>
    </div>
  );
}
