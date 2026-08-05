/**
 * AI coach client: thinking levels + trading-plan sync.
 *
 * Kept separate from `lib/api.ts` so the shared client stays untouched. The
 * axios instance already points at `<host>/api`, so paths start at `/ai/...`.
 */
import http from "./api";
import type { AIAnalysis } from "./types";

export type CoachLevel = "low" | "medium" | "high" | "max" | "ultra";

export interface CoachLevelInfo {
  key: CoachLevel;
  label: string;
  /** How many recent trades are handed to the model. */
  trades: number;
  /** How many exit chart screenshots are attached. */
  images: number;
  note: string;
}

export const DEFAULT_COACH_LEVEL: CoachLevel = "medium";

/** Mirrors `ai_prompts.LEVELS` on the backend (also served by /ai/levels). */
export const COACH_LEVELS: CoachLevelInfo[] = [
  { key: "low", label: "پایه", trades: 10, images: 0, note: "داشبورد کامل + تریدینگ پلن + چک‌لیست + ۱۰ معاملهٔ اخیر" },
  { key: "medium", label: "متوسط", trades: 20, images: 0, note: "همان داده‌ها با ۲۰ معاملهٔ اخیر" },
  { key: "high", label: "بالا", trades: 30, images: 0, note: "همان داده‌ها با ۳۰ معاملهٔ اخیر" },
  { key: "max", label: "حداکثر", trades: 50, images: 0, note: "همان داده‌ها با ۵۰ معاملهٔ اخیر" },
  { key: "ultra", label: "اولترا", trades: 50, images: 10, note: "۵۰ معاملهٔ اخیر + تصاویر چارت خروج معاملات" },
];

export interface PlanTopicDTO {
  id: string;
  title: string;
  items: { id: string; text: string }[];
}

export interface PlanResponse {
  topics: PlanTopicDTO[];
  updatedAt?: string | null;
}

export const coachApi = {
  /** Depth presets straight from the backend (keeps the UI in sync). */
  levels: () => http.get<CoachLevelInfo[]>("/ai/levels").then((r) => r.data),

  /** Start a coach run at the requested thinking level. */
  analyzeOverall: (level: CoachLevel = DEFAULT_COACH_LEVEL) =>
    http.post<AIAnalysis>("/ai/overall", { level }).then((r) => r.data),

  /** Admin: coach another user at the requested level. */
  adminAnalyzeOverall: (userId: string, level: CoachLevel = DEFAULT_COACH_LEVEL) =>
    http
      .post<AIAnalysis>(`/ai/admin/users/${userId}/overall`, { level })
      .then((r) => r.data),

  /** The plan the coach reads (mirrored from the /trading-plan page). */
  getPlan: () => http.get<PlanResponse>("/ai/plan").then((r) => r.data),

  savePlan: (topics: PlanTopicDTO[]) =>
    http.put<PlanResponse>("/ai/plan", { topics }).then((r) => r.data),
};
