"use client";

/**
 * The RTL tab bar + active tab content for a trade.
 * Used by the editor (editable) and the admin viewer (readOnly).
 */
import { useState } from "react";
import { EssentialsTab } from "./tabs/EssentialsTab";
import { ReasonsTab } from "./tabs/ReasonsTab";
import { ChecklistTab } from "./tabs/ChecklistTab";
import { EmotionsTab } from "./tabs/EmotionsTab";
import { ManagementTab } from "./tabs/ManagementTab";
import { TagsTab } from "./tabs/TagsTab";
import type { ChecklistTemplate } from "@/lib/types";

const TABS = [
  { key: "essentials", label: "اطلاعات ضروری" },
  { key: "reasons", label: "دلایل ورود و خروج" },
  { key: "checklist", label: "چک‌لیست" },
  { key: "emotions", label: "احساسات" },
  { key: "management", label: "مدیریت معامله" },
  { key: "tags", label: "برچسب‌ها" },
] as const;

export function TradeTabs({
  readOnly = false,
  checklistTemplates,
}: {
  readOnly?: boolean;
  /** Admin: pass the target user's checklist templates so ChecklistTab
   *  doesn't fall back to loading the admin's own templates. */
  checklistTemplates?: ChecklistTemplate[];
}) {
  const [active, setActive] = useState<(typeof TABS)[number]["key"]>("essentials");

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-5 flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              active === t.key
                ? "bg-primary text-white"
                : "text-muted hover:bg-surface-2"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Active tab */}
      <div className="tj-card p-5">
        {active === "essentials" && <EssentialsTab readOnly={readOnly} />}
        {active === "reasons" && <ReasonsTab readOnly={readOnly} />}
        {active === "checklist" && (
          <ChecklistTab readOnly={readOnly} externalTemplates={checklistTemplates} />
        )}
        {active === "emotions" && <EmotionsTab readOnly={readOnly} />}
        {active === "management" && <ManagementTab readOnly={readOnly} />}
        {active === "tags" && <TagsTab readOnly={readOnly} />}
      </div>
    </div>
  );
}
