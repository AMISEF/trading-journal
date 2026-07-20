"use client";

/**
 * The RTL tab bar + active tab content for a trade.
 * Used by the editor (editable) and the admin viewer (readOnly).
 *
 * The tab order is user-customisable: grab a tab and drag it left/right to
 * reorder. The chosen order is persisted per-user in localStorage.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { EssentialsTab } from "./tabs/EssentialsTab";
import { ReasonsTab } from "./tabs/ReasonsTab";
import { ChecklistTab } from "./tabs/ChecklistTab";
import { EmotionsTab } from "./tabs/EmotionsTab";
import { ManagementTab } from "./tabs/ManagementTab";
import { TagsTab } from "./tabs/TagsTab";
import { useAuth } from "@/store/auth";
import type { ChecklistTemplate } from "@/lib/types";

type TabKey =
  | "essentials"
  | "reasons"
  | "checklist"
  | "emotions"
  | "management"
  | "tags";

const TABS: { key: TabKey; label: string; rgb: string }[] = [
  { key: "essentials", label: "اطلاعات ضروری", rgb: "125,211,252" },
  { key: "reasons", label: "دلایل ورود و خروج", rgb: "167,139,250" },
  { key: "checklist", label: "چک‌لیست", rgb: "94,234,212" },
  { key: "emotions", label: "احساسات", rgb: "244,114,182" },
  { key: "management", label: "مدیریت معامله", rgb: "251,191,36" },
  { key: "tags", label: "برچسب‌ها", rgb: "52,211,153" },
];

const ALL_KEYS = TABS.map((t) => t.key);
const orderKey = (userId: string) => `tj_tab_order_${userId}`;

/** Load a persisted order, healing it against the current set of tabs. */
function loadOrder(userId: string): TabKey[] {
  if (typeof window === "undefined") return ALL_KEYS;
  try {
    const raw = JSON.parse(localStorage.getItem(orderKey(userId)) || "null");
    if (!Array.isArray(raw)) return ALL_KEYS;
    const kept = raw.filter((k): k is TabKey => ALL_KEYS.includes(k));
    // Append any tab that isn't in the stored order (e.g. newly added tabs).
    const missing = ALL_KEYS.filter((k) => !kept.includes(k));
    const merged = [...kept, ...missing];
    return merged.length === ALL_KEYS.length ? merged : ALL_KEYS;
  } catch {
    return ALL_KEYS;
  }
}

export function TradeTabs({
  readOnly = false,
  checklistTemplates,
}: {
  readOnly?: boolean;
  /** Admin: pass the target user's checklist templates so ChecklistTab
   *  doesn't fall back to loading the admin's own templates. */
  checklistTemplates?: ChecklistTemplate[];
}) {
  const user = useAuth((s) => s.user);
  const uid = user?.id ?? "anon";

  const [order, setOrder] = useState<TabKey[]>(ALL_KEYS);
  const [active, setActive] = useState<TabKey>("essentials");
  const [dragKey, setDragKey] = useState<TabKey | null>(null);
  const [overKey, setOverKey] = useState<TabKey | null>(null);
  const dragKeyRef = useRef<TabKey | null>(null);

  // Load the saved order once we know the user.
  useEffect(() => {
    setOrder(loadOrder(uid));
  }, [uid]);

  const persist = (next: TabKey[]) => {
    setOrder(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(orderKey(uid), JSON.stringify(next));
    }
  };

  const meta = useMemo(() => {
    const m = new Map(TABS.map((t) => [t.key, t]));
    return m;
  }, []);

  const reorder = (from: TabKey, to: TabKey) => {
    if (from === to) return;
    const next = [...order];
    const fromIdx = next.indexOf(from);
    const toIdx = next.indexOf(to);
    if (fromIdx < 0 || toIdx < 0) return;
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, from);
    persist(next);
  };

  const onDrop = (target: TabKey) => {
    const from = dragKeyRef.current;
    setDragKey(null);
    setOverKey(null);
    dragKeyRef.current = null;
    if (from) reorder(from, target);
  };

  return (
    <div>
      {/* Tab bar (drag to reorder) */}
      <div className="mb-5 flex flex-wrap gap-2 border-b border-border pb-2">
        {order.map((key) => {
          const t = meta.get(key)!;
          const isActive = active === key;
          const isDragging = dragKey === key;
          const isOver = overKey === key && dragKey !== key;
          return (
            <button
              key={key}
              draggable
              onDragStart={(e) => {
                setDragKey(key);
                dragKeyRef.current = key;
                e.dataTransfer.effectAllowed = "move";
                // Firefox needs data set for a drag to start.
                try { e.dataTransfer.setData("text/plain", key); } catch {}
              }}
              onDragEnd={() => {
                setDragKey(null);
                setOverKey(null);
                dragKeyRef.current = null;
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overKey !== key) setOverKey(key);
              }}
              onDragLeave={() => {
                setOverKey((k) => (k === key ? null : k));
              }}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(key);
              }}
              onClick={() => setActive(key)}
              title="برای جابجایی بکشید"
              className="group relative flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-300 ease-out"
              style={{
                cursor: dragKey ? "grabbing" : "grab",
                transform: isDragging
                  ? "scale(0.94)"
                  : isOver
                  ? "translateY(-2px) scale(1.04)"
                  : "none",
                opacity: isDragging ? 0.5 : 1,
                background: isActive
                  ? `linear-gradient(135deg, rgba(${t.rgb},0.95), rgba(${t.rgb},0.7))`
                  : isOver
                  ? `rgba(${t.rgb},0.18)`
                  : "transparent",
                color: isActive ? "#0b0f1a" : `rgb(${t.rgb})`,
                border: `1px solid ${
                  isActive || isOver ? `rgba(${t.rgb},0.6)` : "transparent"
                }`,
                boxShadow: isActive
                  ? `0 6px 20px -8px rgba(${t.rgb},0.7)`
                  : isOver
                  ? `0 4px 14px -6px rgba(${t.rgb},0.5)`
                  : "none",
              }}
            >
              {/* drag handle dots */}
              <span
                aria-hidden
                className="text-[10px] leading-none opacity-40 transition-opacity group-hover:opacity-80"
                style={{ letterSpacing: "-1px" }}
              >
                ⠿
              </span>
              {t.label}
            </button>
          );
        })}
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
