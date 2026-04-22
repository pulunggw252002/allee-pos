"use client";

import { create } from "zustand";
import type { OrderType, Product } from "@/lib/types";
import { getPosConfig } from "@/lib/api/config";

export interface CartItem {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  note?: string;
  stationId: string;
  emoji?: string;
}

interface CartState {
  items: CartItem[];
  orderType: OrderType;
  tableNumber?: string;
  customerName?: string;
  deliveryProvider?: string;
  discount: number;
  note?: string;
  addProduct: (p: Product) => void;
  setQty: (productId: string, qty: number) => void;
  increment: (productId: string) => void;
  decrement: (productId: string) => void;
  remove: (productId: string) => void;
  setItemNote: (productId: string, note: string) => void;
  setOrderType: (t: OrderType) => void;
  setTableNumber: (n: string | undefined) => void;
  setCustomerName: (n: string | undefined) => void;
  setDeliveryProvider: (p: string | undefined) => void;
  setDiscount: (discount: number) => void;
  setNote: (note: string) => void;
  clear: () => void;
  subtotal: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  orderType: "dine-in",
  tableNumber: undefined,
  customerName: undefined,
  deliveryProvider: undefined,
  discount: 0,
  note: undefined,

  addProduct: (p) =>
    set((state) => {
      const existing = state.items.find((it) => it.productId === p.id);
      if (existing) {
        return {
          items: state.items.map((it) =>
            it.productId === p.id ? { ...it, qty: it.qty + 1 } : it
          ),
        };
      }
      return {
        items: [
          ...state.items,
          {
            productId: p.id,
            name: p.name,
            unitPrice: p.price,
            qty: 1,
            stationId: p.stationId,
            emoji: p.imageEmoji,
          },
        ],
      };
    }),

  setQty: (productId, qty) =>
    set((state) => ({
      items:
        qty <= 0
          ? state.items.filter((it) => it.productId !== productId)
          : state.items.map((it) =>
              it.productId === productId ? { ...it, qty } : it
            ),
    })),

  increment: (productId) =>
    set((state) => ({
      items: state.items.map((it) =>
        it.productId === productId ? { ...it, qty: it.qty + 1 } : it
      ),
    })),

  decrement: (productId) =>
    set((state) => {
      const target = state.items.find((it) => it.productId === productId);
      if (!target) return state;
      if (target.qty <= 1) {
        return { items: state.items.filter((it) => it.productId !== productId) };
      }
      return {
        items: state.items.map((it) =>
          it.productId === productId ? { ...it, qty: it.qty - 1 } : it
        ),
      };
    }),

  remove: (productId) =>
    set((state) => ({
      items: state.items.filter((it) => it.productId !== productId),
    })),

  setItemNote: (productId, note) =>
    set((state) => ({
      items: state.items.map((it) =>
        it.productId === productId ? { ...it, note } : it
      ),
    })),

  setOrderType: (t) =>
    set((state) => ({
      orderType: t,
      tableNumber: t === "dine-in" ? state.tableNumber : undefined,
      deliveryProvider: t === "delivery" ? state.deliveryProvider : undefined,
    })),
  setTableNumber: (n) => set({ tableNumber: n }),
  setCustomerName: (n) => set({ customerName: n }),
  setDeliveryProvider: (p) => set({ deliveryProvider: p }),
  setDiscount: (discount) => set({ discount: Math.max(0, discount) }),
  setNote: (note) => set({ note }),

  clear: () =>
    set({
      items: [],
      orderType: "dine-in",
      tableNumber: undefined,
      customerName: undefined,
      deliveryProvider: undefined,
      discount: 0,
      note: undefined,
    }),

  subtotal: () => get().items.reduce((sum, it) => sum + it.unitPrice * it.qty, 0),
}));

export function cartTotals(subtotal: number, discount: number) {
  const { taxRate, serviceRate } = getPosConfig().outlet;
  const afterDiscount = Math.max(0, subtotal - discount);
  const tax = Math.round(afterDiscount * taxRate);
  const service = Math.round(afterDiscount * serviceRate);
  const total = afterDiscount + tax + service;
  return { afterDiscount, tax, service, total };
}
