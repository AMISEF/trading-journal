/**
 * Shared TypeScript types that mirror the backend API contract (all camelCase).
 * Keep these in sync with the backend models.
 */

export type Role = "TRADER" | "ADMIN";
export type Direction = "LONG" | "SHORT";
export type TradeStatus = "PLANNED" | "OPEN" | "CLOSED";
export type ExitType = "RISK_FREE" | "LAST_TP" | "STOP_LOSS" | "TRAILING_STOP" | "NOT_ACTIVATED";
export type ReasonKind = "entry" | "exit";

/** Authenticated user. */
export interface User {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: Role;
  walletMargin: number;
  currentBalance: number;
  createdAt: string;
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
  winRate: number;
  currentBalance: number;
  equityCurve: { number: number; balance: number; pnl: number; date: string | null }[];
  pnlByDay: { date: string; pnl: number }[];
  directionStats: { long: number; short: number };
  sessionStats: { session: string; count: number; pnl: number }[];
  winLoss: {
    win: number;
    loss: number;
    breakeven: number;
    avgWin: number | null;
    avgLoss: number | null;
  };
  topSymbols: { symbol: string; pnl: number; count: number }[];
  checklistDiscipline: number;
  usdtIrt: number;
}

export interface AuthResponse {
  accessToken: string;
  tokenType?: string;
  user: User;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  amount: number;
  note: string | null;
  transactionDate: string;
  createdAt: string;
}
