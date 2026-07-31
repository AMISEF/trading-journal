/**
 * Shared TypeScript types that mirror the backend API contract (all camelCase).
 * Keep these in sync with the backend models.
 */

export type Role = "TRADER" | "ADMIN";
export type Direction = "LONG" | "SHORT";
export type TradeStatus = "PLANNED" | "OPEN" | "CLOSED";
export type ExitType = "RISK_FREE" | "LAST_TP" | "STOP_LOSS" | "TRAILING_STOP" | "NOT_ACTIVATED";
export type ReasonKind = "entry" | "exit";

/** Showcase groups a user can belong to (a user may be in several at once). */
export const CRYPTOSMART_TEAM_GROUP = "CRYPTOSMART_TEAM";
export const LIVE_TRADE_GROUP = "LIVE_TRADE";

/** Authenticated user. */
export interface User {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: Role;
  phone: string | null;
  walletMargin: number;
  currentBalance: number;
  /** گروهِ اصلی — فقط برای نمایش/سازگاری؛ برای بررسیِ عضویت از userGroups استفاده کنید. */
  userGroup: string | null;
  /** همهٔ گروه‌هایی که کاربر عضوشان است (ممکن است هم تیم کریپتو اسمارت و هم لایو ترید باشد). */
  userGroups?: string[];
  /** True for the single site demo account (rendered by the «ایجاد دمو» button). */
  isDemo?: boolean;
  capitalResetDate: string | null;
  subscriptionTier: string;
  subscriptionExpiresAt: string | null;
  createdAt: string;
  /** Whether a Toobit API key is stored (the key itself is never returned). */
  hasToobitApiKey?: boolean;
  /** Masked preview of the stored key (last 4 chars), for confirmation. */
  toobitApiKeyMasked?: string | null;
  /** Whether the Toobit secret key is stored (needed for futures auto-import). */
  hasToobitSecretKey?: boolean;
  /** Last successful Toobit sync time (ISO), and last sync error if any. */
  toobitSyncedAt?: string | null;
  toobitSyncError?: string | null;
}

/** آیا کاربر عضوِ این گروه نمایشی است؟ (مقدارِ تک‌گروهیِ قدیمی را هم پوشش می‌دهد.) */
export function isGroupMember(user: User | null | undefined, group: string): boolean {
  if (!user) return false;
  const groups = user.userGroups ?? (user.userGroup ? [user.userGroup] : []);
  return groups.includes(group);
}

/** A single take-profit target. */
export interface TakeProfit {
  order: number;
  price: number | null;
  savePercent: number;
}

/** A single entry level (DCA / "پله"). marginPercent is % of the wallet. */
export interface EntryLevel {
  order: number;
  price: number | null;
  marginPercent: number | null;
  /** undefined/true = activated (included in calc); false = not activated (excluded). */
  isActivated?: boolean;
}

/** Per-TP computed numbers returned by the calc engine. */
export interface PerTpCalc {
  order: number;
  price: number | null;
  savePercent: number;
  spotPct: number;
  levPct: number;
  fullDollar: number;
  savedDollar: number;
  rrDynamic: number;
}

/** Full calc payload (live preview or persisted on a trade). */
export interface Calc {
  margin: number;
  positionSize: number;
  risk1r: number;
  rrExpected: number;
  rrAchieved: number;
  realizedPnl: number;
  resultPct: number;
  capitalPct: number;
  session: string | null;
  perTp: PerTpCalc[];
}

/** A trade / journal entry. */
export interface Trade {
  id: string;
  userId: string;
  number: number;
  tradeNumber: number | null;
  /** "manual" (user-entered) or "toobit" (auto-imported from Toobit futures). */
  source?: string;
  symbol: string;
  direction: Direction;
  status: TradeStatus;
  entryPrice: number | null;
  leverage: number | null;
  marginPercent: number | null;
  stopLoss: number | null;
  analysisTf: string | null;
  triggerTf: string | null;
  isRiskFreePlan: boolean;
  /** Wallet balance snapshot captured when the trade was recorded (fixed). */
  balanceSnapshot: number | null;
  openDate: string | null;
  closeDate: string | null;
  exitType: ExitType | null;
  exitPrice: number | null;
  trailExitValue: number | null;
  trailIsPercent: boolean | null;
  isRiskFreeMgmt: boolean;
  isLocked: boolean;
  realizedPnl: number | null;
  rrExpected: number | null;
  rrAchieved: number | null;
  emotions: Record<string, unknown>;
  checklistTicks: Record<string, boolean>;
  entryReasons: string[];
  exitReasons: string[];
  entryNote: string | null;
  exitNote: string | null;
  generalNote: string | null;
  imageBefore: string | null;
  imageAfter: string | null;
  tags: string[];
  takeProfits: TakeProfit[];
  /** Optional multi-level entry. When present, entryPrice/marginPercent are the
   * derived weighted-average entry and total margin. */
  entryLevels: EntryLevel[];
  calc: Calc | null;
}

/** Partial trade payload used for PATCH auto-save. */
export type TradePatch = Partial<Omit<Trade, "id" | "userId" | "number" | "calc">>;

export interface ChecklistItem {
  id: string;
  text: string;
}

export interface ChecklistTemplate {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface ReasonTemplate {
  id: string;
  kind: ReasonKind;
  text: string;
}

export interface MarketSymbol {
  symbol: string;
  tickSize: number;
}

export interface MarketPrice {
  symbol: string;
  price: number;
  raw?: unknown;
}

/** Request body for the live calc preview endpoint. */
export interface CalcPreviewRequest {
  direction: Direction;
  entryPrice: number | null;
  leverage: number | null;
  marginPercent: number | null;
  stopLoss: number | null;
  takeProfits: TakeProfit[];
  exitType?: ExitType | null;
  exitPrice?: number | null;
  trailExitValue?: number | null;
  trailIsPercent?: boolean | null;
  walletBalance?: number | null;
  nActivatedLevels?: number;
}

export interface DashboardData {
  tradeCount: number;
  closedCount: number;
  profitFactor: number;
  avgRr: number;
  /** Average leverage across all the user's trades that set one, + long/short split. */
  avgLeverage?: number | null;
  avgLeverageLong?: number | null;
  avgLeverageShort?: number | null;
  /** سودده ÷ (سودده + زیان‌ده) — معاملات سربه‌سر در مخرج نمی‌آیند؛ اگر هیچ
   *  معاملهٔ سودده یا زیان‌ده‌ای نباشد null است. */
  winRate: number | null;
  currentBalance: number;
  equityCurve: { number: number; balance: number; pnl: number; date: string | null }[];
  pnlByDay: { date: string; pnl: number }[];
  directionStats: {
    long: number;
    short: number;
    longWins?: number;
    shortWins?: number;
    longWinRate?: number | null;
    shortWinRate?: number | null;
  };
  sessionStats: { session: string; count: number; pnl: number }[];
  winLoss: {
    win: number;
    loss: number;
    breakeven: number;
    avgWin: number | null;
    avgLoss: number | null;
  };
  topSymbols: SymbolStat[];
  checklistDiscipline: number;
  usdtIrt: number;
  /** Extra analytics. */
  worstSymbols?: SymbolStat[];
  maxDrawdown?: { amount: number; percent: number } | null;
  winStreak?: { count: number; pnl: number } | null;
  lossStreak?: { count: number; pnl: number } | null;
}

export interface SymbolStat {
  symbol: string;
  pnl: number;
  /** همهٔ معاملات این نماد (ستون «تعداد»). */
  count: number;
  wins?: number;
  /** مخرجِ وین‌ریت: فقط سودده + زیان‌ده. */
  decided?: number;
  winRate?: number | null;
}

// ─── لیگ تریدرها (Traders League) ────────────────────────────

/** بازهٔ زمانیِ لیگ — همه بر پایهٔ تقویم شمسی. */
export type LeaguePeriod = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

/** یک معیارِ رتبه‌بندی، همان‌طور که بک‌اند تعریفش می‌کند. */
export interface LeagueMetric {
  key: string;
  label: string;
  /** percent | usd | ratio | count | x | score */
  unit: string;
  higherIsBetter: boolean;
  hint: string;
}

export interface LeagueWindow {
  period: LeaguePeriod;
  /** شناسهٔ پایدارِ بازه (مثلاً «۱۴۰۴-۰۵») برای رفتن به دورهٔ قبل/بعد. */
  key: string;
  label: string;
  start: string;
  end: string;
}

/** یک ردیفِ لیدربرد. `userId` فقط برای ادمین پر می‌شود. */
export interface LeagueEntry {
  rank: number;
  userId: number | null;
  username: string;
  /** این ردیف خودِ کاربرِ واردشده است (هایلایت + برچسبِ you). */
  isMe: boolean;
  exchanges: string[];
  tradeCount: number;
  wins: number;
  losses: number;
  breakeven: number;
  startBalance: number;
  endBalance: number;
  pnlUsd: number;
  pnlPercent: number;
  volume: number;
  avgLeverage: number | null;
  maxDrawdown: number;
  profitFactor: number | null;
  winRate: number | null;
  avgRr: number | null;
  winStreak: number;
  greenDays: number | null;
  discipline: number | null;
  bestTrade: number;
  worstTrade: number;
  score: number;
  /** حداقلِ معاملهٔ لازم را در این دوره داشته است. */
  qualified: boolean;
  /** در این دوره حداقل یک معاملهٔ بسته‌شده دارد. */
  active: boolean;
  /** مثبت = صعود نسبت به دورهٔ قبل، null = در دورهٔ قبل نبوده. */
  rankChange: number | null;
}

export interface LeagueBoard {
  metric: string;
  minTrades: number;
  window: LeagueWindow;
  previousKey: string;
  nextKey: string;
  hasNext: boolean;
  /** ردیف‌های همین صفحه. */
  entries: LeagueEntry[];
  /** کلِ اعضای لیگ و تعدادِ کسانی که در این دوره معامله کرده‌اند. */
  total: number;
  activeCount: number;
  page: number;
  pageSize: number;
  pages: number;
  myRank: number | null;
  myPage: number | null;
  /** ردیفِ خودِ کاربر — حتی اگر در این صفحه نباشد. */
  me: LeagueEntry | null;
}

export interface LeagueMeta {
  metrics: LeagueMetric[];
  periods: LeaguePeriod[];
  defaultMetric: string;
  defaultPeriod: LeaguePeriod;
  minTrades: number;
  pageSize: number;
  current: Record<LeaguePeriod, LeagueWindow>;
}

export interface AuthResponse {
  accessToken: string;
  tokenType?: string;
  user: User;
}

/** One message in an AI coach chat thread. */
export interface ChatMessage {
  role: "user" | "assistant" | string;
  content: string;
  at?: string;
}

/** AI coach analysis result (per-trade or whole-journal). */
export interface AIAnalysis {
  analysis: string | null;
  generatedAt: string | null;
  enabled: boolean;
  /** Background-job state: null | "PENDING" | "DONE" | "ERROR". */
  status: string | null;
  error: string | null;
  /** Follow-up chat thread. */
  chat: ChatMessage[];
}

export interface WalletTransaction {
  id: string;
  userId: string;
  amount: number;
  note: string | null;
  transactionDate: string;
  createdAt: string;
}
