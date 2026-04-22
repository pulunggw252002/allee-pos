"use client";

import { create } from "zustand";
import type { Shift } from "@/lib/types";
import { getActiveShift } from "@/lib/api/shifts";

interface ShiftState {
  shift: Shift | null;
  hydrated: boolean;
  setShift: (s: Shift | null) => void;
  hydrate: () => Promise<void>;
  clear: () => void;
}

export const useShiftStore = create<ShiftState>((set) => ({
  shift: null,
  hydrated: false,
  setShift: (s) => set({ shift: s }),
  hydrate: async () => {
    const active = await getActiveShift();
    set({ shift: active, hydrated: true });
  },
  clear: () => set({ shift: null }),
}));
