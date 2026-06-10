/**
 * Auth store (Zustand).
 * Holds the current user + token, and exposes login/logout/refresh helpers.
 */
"use client";

import { create } from "zustand";
import { authApi, getToken, setToken } from "@/lib/api";
import type { User } from "@/lib/types";

interface AuthState {
  user: User | null;
  /** True until we've checked localStorage + /auth/me on first load. */
  loading: boolean;
  /** Set the session after login/register. */
  setSession: (token: string, user: User) => void;
  /** Update just the user object (e.g. after PATCH /auth/wallet). */
  setUser: (user: User) => void;
  /** Load the user from the API if a token exists (called on app boot). */
  init: () => Promise<void>;
  /** Clear the session and token. */
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,

  setSession: (token, user) => {
    setToken(token);
    set({ user, loading: false });
  },

  setUser: (user) => set({ user }),

  init: async () => {
    const token = getToken();
    if (!token) {
      set({ user: null, loading: false });
      return;
    }
    try {
      const user = await authApi.me();
      set({ user, loading: false });
    } catch {
      // Token invalid/expired — clear it.
      setToken(null);
      set({ user: null, loading: false });
    }
  },

  logout: () => {
    setToken(null);
    set({ user: null });
    if (typeof window !== "undefined") window.location.href = "/login";
  },
}));
