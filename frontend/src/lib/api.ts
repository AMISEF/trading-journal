/**
 * Typed API client for the FastAPI backend.
 *
 * - Reads the base URL from NEXT_PUBLIC_API_BASE (default http://localhost:8001/api).
 * - Attaches the JWT Bearer token (localStorage "tj_token") to every request.
 * - Exposes typed helper groups: auth, trades, calc, market, checklists, reasons,
 *   dashboard, admin, uploads.
 */
import axios, { AxiosInstance } from "axios";
import type {
  AIAnalysis,
  AuthResponse,
  Calc,
  CalcPreviewRequest,
  ChecklistTemplate,
  DashboardData,
  MarketPrice,
  MarketSymbol,
  ReasonKind,
  ReasonTemplate,
  Trade,
  TradePatch,
  User,
  WalletTransaction,
} from "./types";

export const TOKEN_KEY = "tj_token";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001/api";

// پیشوندِ مسیرِ اپ وقتی زیرمسیرِ یک دامنه سرو می‌شود (مثلاً "/journal").
// برای هدایت‌های خامِ window.location لازم است، چون Next فقط <Link>/router را
// به‌صورت خودکار با basePath می‌سازد، نه location.href را.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** مسیر ورود، با درنظرگرفتنِ basePath. */
export const LOGIN_PATH = `${BASE_PATH}/login`;

/** Read the JWT from localStorage (browser only). */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

/** Persist the JWT. Pass null to clear it (logout). */
export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

// A single axios instance shared across the app.
const http: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

// Inject the Bearer token before every request.
http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    if (!config.headers) {
      config.headers = {} as any;
    }
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 (expired/invalid token), clear it and bounce to login.
http.interceptors.response.use(
  (res) => res,
  (error) => {
    if (
      error?.response?.status === 401 &&
      typeof window !== "undefined" &&
      getToken() && // only bounce a logged-in user; public pages calling authed endpoints stay put
      !window.location.pathname.startsWith(LOGIN_PATH)
    ) {
      setToken(null);
      window.location.href = LOGIN_PATH;
    }
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export interface RegisterPayload {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
  passwordConfirm: string;
}

export const authApi = {
  register: (payload: RegisterPayload) =>
    http.post<AuthResponse>("/auth/register", payload).then((r) => r.data),
  login: (username: string, password: string) =>
    http
      .post<AuthResponse>("/auth/login", { username, password })
      .then((r) => r.data),
  me: () => http.get<User>("/auth/me").then((r) => r.data),
  setWallet: (walletMargin: number) =>
    http.patch<User>("/auth/wallet", { walletMargin }).then((r) => r.data),
  // Forgot password (login page): email a code, then reset with it.
  forgotPassword: (email: string) =>
    http.post("/auth/forgot-password", { email }).then((r) => r.data),
  resetPassword: (email: string, code: string, newPassword: string) =>
    http.post("/auth/reset-password", { email, code, newPassword }).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Password change (settings, logged in)
// ---------------------------------------------------------------------------
export const passwordApi = {
  requestChangeCode: () =>
    http.post<{ ok: boolean; email: string }>("/settings/password/request-code", {}).then((r) => r.data),
  change: (code: string, newPassword: string) =>
    http.post("/settings/password/change", { code, newPassword }).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------
export const tradesApi = {
  list: () => http.get<Trade[]>("/trades").then((r) => r.data),
  create: () => http.post<Trade>("/trades", {}).then((r) => r.data),
  get: (id: string) => http.get<Trade>(`/trades/${id}`).then((r) => r.data),
  update: (id: string, patch: TradePatch) =>
    http.patch<Trade>(`/trades/${id}`, patch).then((r) => r.data),
  remove: (id: string) => http.delete(`/trades/${id}`).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Calc preview (live numbers while editing, no save)
// ---------------------------------------------------------------------------
export const calcApi = {
  preview: (req: CalcPreviewRequest) =>
    http.post<Calc>("/calc/preview", req).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Market data (proxied through the backend)
// ---------------------------------------------------------------------------
export const marketApi = {
  symbols: (q: string) =>
    http
      .get<MarketSymbol[]>("/market/symbols", { params: { q } })
      .then((r) => r.data),
  price: (symbol: string) =>
    http
      .get<MarketPrice>("/market/price", { params: { symbol } })
      .then((r) => r.data),
  tickSize: (symbol: string) =>
    http
      .get<{ symbol: string; tickSize: number }>("/market/ticksize", {
        params: { symbol },
      })
      .then((r) => r.data),
  usdtIrt: () =>
    http.get<{ rate: number }>("/market/usdt-irt").then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Checklist templates
// ---------------------------------------------------------------------------
export const checklistsApi = {
  list: () => http.get<ChecklistTemplate[]>("/checklists").then((r) => r.data),
  create: (payload: Omit<ChecklistTemplate, "id">) =>
    http.post<ChecklistTemplate>("/checklists", payload).then((r) => r.data),
  update: (id: string, payload: Omit<ChecklistTemplate, "id">) =>
    http
      .put<ChecklistTemplate>(`/checklists/${id}`, payload)
      .then((r) => r.data),
  remove: (id: string) => http.delete(`/checklists/${id}`).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Reason templates
// ---------------------------------------------------------------------------
export const reasonsApi = {
  list: (kind: ReasonKind) =>
    http
      .get<ReasonTemplate[]>("/reasons", { params: { kind } })
      .then((r) => r.data),
  create: (kind: ReasonKind, text: string) =>
    http.post<ReasonTemplate>("/reasons", { kind, text }).then((r) => r.data),
  remove: (id: string) => http.delete(`/reasons/${id}`).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export const dashboardApi = {
  get: () => http.get<DashboardData>("/dashboard").then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export interface AdminUserCreatePayload {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  password: string;
  role?: string;
  walletMargin?: number;
}

export interface AdminUserUpdatePayload {
  email?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  walletMargin?: number;
}

export const adminApi = {
  users: () => http.get<User[]>("/admin/users").then((r) => r.data),
  createUser: (payload: AdminUserCreatePayload) =>
    http.post<User>("/admin/users", payload).then((r) => r.data),
  updateUser: (id: string, payload: AdminUserUpdatePayload) =>
    http.put<User>(`/admin/users/${id}`, payload).then((r) => r.data),
  deleteUser: (id: string) =>
    http.delete(`/admin/users/${id}`).then((r) => r.data),
  resetPassword: (id: string, newPassword: string) =>
    http.post(`/admin/users/${id}/reset-password`, { newPassword }).then((r) => r.data),
  setGroup: (id: string, userGroup: string | null) =>
    http.post<User>(`/admin/users/${id}/set-group`, { userGroup }).then((r) => r.data),
  setPlan: (id: string, plan: string, durationMonths: number | null) =>
    http.post<User>(`/admin/users/${id}/set-plan`, { plan, durationMonths }).then((r) => r.data),
  resetCapital: (id: string) =>
    http.post<User>(`/admin/users/${id}/reset-capital`, {}).then((r) => r.data),
  userTrades: (id: string) =>
    http.get<Trade[]>(`/admin/users/${id}/trades`).then((r) => r.data),
  userDashboard: (id: string) =>
    http.get<DashboardData>(`/admin/users/${id}/dashboard`).then((r) => r.data),
  userChecklists: (id: string) =>
    http.get<ChecklistTemplate[]>(`/admin/users/${id}/checklists`).then((r) => r.data),
  trade: (id: string) =>
    http.get<Trade>(`/admin/trades/${id}`).then((r) => r.data),
  deleteTrade: (id: string) =>
    http.delete(`/admin/trades/${id}`).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// AI coach (Claude-powered trade analysis)
// ---------------------------------------------------------------------------
export const aiApi = {
  // Current user's own trade / journal.
  getTrade: (id: string) =>
    http.get<AIAnalysis>(`/ai/trades/${id}`).then((r) => r.data),
  analyzeTrade: (id: string) =>
    http.post<AIAnalysis>(`/ai/trades/${id}`, {}).then((r) => r.data),
  getOverall: () => http.get<AIAnalysis>(`/ai/overall`).then((r) => r.data),
  analyzeOverall: () =>
    http.post<AIAnalysis>(`/ai/overall`, {}).then((r) => r.data),
  // Institutional due-diligence report (current user).
  getReport: () => http.get<AIAnalysis>(`/ai/report`).then((r) => r.data),
  analyzeReport: () =>
    http.post<AIAnalysis>(`/ai/report`, {}).then((r) => r.data),
  // Chat (current user).
  chatTrade: (id: string, message: string) =>
    http.post<AIAnalysis>(`/ai/trades/${id}/chat`, { message }).then((r) => r.data),
  chatOverall: (message: string) =>
    http.post<AIAnalysis>(`/ai/overall/chat`, { message }).then((r) => r.data),
  chatReport: (message: string) =>
    http.post<AIAnalysis>(`/ai/report/chat`, { message }).then((r) => r.data),
  // Admin: coach any user / their trades.
  adminGetTrade: (id: string) =>
    http.get<AIAnalysis>(`/ai/admin/trades/${id}`).then((r) => r.data),
  adminAnalyzeTrade: (id: string) =>
    http.post<AIAnalysis>(`/ai/admin/trades/${id}`, {}).then((r) => r.data),
  adminGetOverall: (userId: string) =>
    http.get<AIAnalysis>(`/ai/admin/users/${userId}/overall`).then((r) => r.data),
  adminAnalyzeOverall: (userId: string) =>
    http.post<AIAnalysis>(`/ai/admin/users/${userId}/overall`, {}).then((r) => r.data),
  adminGetReport: (userId: string) =>
    http.get<AIAnalysis>(`/ai/admin/users/${userId}/report`).then((r) => r.data),
  adminAnalyzeReport: (userId: string) =>
    http.post<AIAnalysis>(`/ai/admin/users/${userId}/report`, {}).then((r) => r.data),
  // Chat (admin coaching any user).
  adminChatTrade: (id: string, message: string) =>
    http.post<AIAnalysis>(`/ai/admin/trades/${id}/chat`, { message }).then((r) => r.data),
  adminChatOverall: (userId: string, message: string) =>
    http.post<AIAnalysis>(`/ai/admin/users/${userId}/overall/chat`, { message }).then((r) => r.data),
  adminChatReport: (userId: string, message: string) =>
    http.post<AIAnalysis>(`/ai/admin/users/${userId}/report/chat`, { message }).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Public (no-auth) — Cryptosmart Team live showcase for the landing page
// ---------------------------------------------------------------------------
export interface TeamSummary {
  count: number;
  initialCapital: number;
  totalInitialCapital: number;
}

export interface TeamAIData {
  enabled: boolean;
  overall: string | null;
  overallAt: string | null;
  overallStatus: string | null;
  overallError: string | null;
  report: string | null;
  reportAt: string | null;
  reportStatus: string | null;
  reportError: string | null;
}

export const publicApi = {
  teamSummary: () => http.get<TeamSummary>("/public/team/summary").then((r) => r.data),
  teamChecklists: (userId: string) =>
    http.get<ChecklistTemplate[]>(`/public/checklists/${userId}`).then((r) => r.data),
  teamDashboard: () => http.get<DashboardData>("/public/team/dashboard").then((r) => r.data),
  teamTrades: () => http.get<Trade[]>("/public/team/trades").then((r) => r.data),
  teamAi: () => http.get<TeamAIData>("/public/team/ai").then((r) => r.data),
  // Admin-only: kick off combined team analyses.
  generateTeamOverall: () => http.post<TeamAIData>("/public/team/ai/overall", {}).then((r) => r.data),
  generateTeamReport: () => http.post<TeamAIData>("/public/team/ai/report", {}).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------
export const uploadsApi = {
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return http
      .post<{ url: string }>("/uploads", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
};

// ---------------------------------------------------------------------------
// Wallet transactions
// ---------------------------------------------------------------------------
export interface WalletTransactionPayload {
  amount: number;
  note?: string | null;
  transactionDate?: string | null;
}

export const walletApi = {
  list: () => http.get<WalletTransaction[]>("/wallet/transactions").then((r) => r.data),
  create: (payload: WalletTransactionPayload) =>
    http.post<WalletTransaction>("/wallet/transactions", payload).then((r) => r.data),
  update: (id: string, payload: WalletTransactionPayload) =>
    http.patch<WalletTransaction>(`/wallet/transactions/${id}`, payload).then((r) => r.data),
  remove: (id: string) => http.delete(`/wallet/transactions/${id}`).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Settings (Toobit API key, …)
// ---------------------------------------------------------------------------
export const settingsApi = {
  saveToobitKey: (accessApiKey: string, secretApiKey?: string) =>
    http
      .put<User>("/settings/toobit-api-key", { accessApiKey, secretApiKey })
      .then((r) => r.data),
  deleteToobitKey: () =>
    http.delete<User>("/settings/toobit-api-key").then((r) => r.data),
  syncToobitNow: () =>
    http.post<User>("/settings/toobit-sync", {}).then((r) => r.data),
  debugToobit: () =>
    http.get<Record<string, unknown>>("/settings/toobit-debug").then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------
export const subscriptionApi = {
  upgrade: (tier: string, yearly: boolean) =>
    http.post<User>("/subscription/upgrade", { tier, yearly }).then((r) => r.data),
};

/** Build the Excel export URL with the JWT in the query string (link download). */
export function exportUrl(): string {
  const token = getToken() ?? "";
  return `${API_BASE}/export/trades.xlsx?token=${encodeURIComponent(token)}`;
}

export default http;
