"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Cashier } from "@/lib/types";

interface AuthState {
  cashier: Cashier | null;
  setCashier: (c: Cashier | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      cashier: null,
      setCashier: (c) => set({ cashier: c }),
      logout: () => set({ cashier: null }),
    }),
    { name: "allee:auth" }
  )
);
