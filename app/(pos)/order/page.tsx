"use client";

import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { MenuGrid } from "@/components/pos/menu-grid";
import { CartPanel } from "@/components/pos/cart-panel";
import { useCartStore } from "@/lib/stores/cart-store";
import { cartTotals } from "@/lib/stores/cart-store";
import { formatIDR } from "@/lib/format";

export default function OrderPage() {
  const [cartOpen, setCartOpen] = useState(false);
  const items = useCartStore((s) => s.items);
  const discount = useCartStore((s) => s.discount);
  const subtotal = items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
  const totalQty = items.reduce((s, it) => s + it.qty, 0);
  const { total } = cartTotals(subtotal, discount);

  return (
    <>
      {/*
        Layout:
        - Mobile (< lg): menu grid full-width, cart muncul sebagai bottom sheet
          lewat floating action button di kanan-bawah.
        - Landscape phone / tablet kecil (sm-md): sama seperti mobile.
        - Desktop (≥ lg): grid 2 kolom — menu | cart panel side-bar.

        Tinggi pakai dvh supaya di mobile browser (iOS Safari) tidak ketabrak
        URL bar yang auto-hide.
      */}
      <div className="grid min-h-[calc(100dvh-3.5rem)] grid-cols-1 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1fr_22rem] xl:grid-cols-[1fr_26rem]">
        <div
          className={
            // Mobile: beri ruang di bawah supaya menu terakhir tidak ketutup FAB cart.
            "flex flex-col overflow-hidden p-3 pb-[calc(var(--sa-bottom)+5rem)] sm:p-4 lg:pb-4"
          }
        >
          <MenuGrid />
        </div>

        {/* Desktop cart aside */}
        <div className="hidden lg:block">
          <CartPanel />
        </div>
      </div>

      {/* Mobile floating cart button */}
      <button
        type="button"
        onClick={() => setCartOpen(true)}
        className="fixed bottom-[calc(var(--sa-bottom)+1rem)] right-4 z-30 flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-primary-foreground shadow-lg active:scale-[0.98] lg:hidden"
        aria-label={`Buka cart — ${totalQty} item`}
      >
        <div className="relative">
          <ShoppingCart className="h-5 w-5" />
          {totalQty > 0 && (
            <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold">
              {totalQty}
            </span>
          )}
        </div>
        <div className="flex flex-col items-start leading-tight">
          <span className="text-[11px] uppercase tracking-wide opacity-80">
            {totalQty === 0 ? "Cart kosong" : "Lihat Cart"}
          </span>
          <span className="text-sm font-semibold tabular">
            {formatIDR(total)}
          </span>
        </div>
      </button>

      {/* Mobile cart sheet (bottom drawer, hampir full-height) */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent
          side="bottom"
          className="h-[92dvh] max-h-[92dvh] rounded-t-2xl p-0 lg:hidden"
          hideClose
        >
          <SheetTitle className="sr-only">Cart Order</SheetTitle>
          <div className="flex h-full flex-col">
            {/* Drag handle untuk aksen UX mobile */}
            <div className="flex justify-center pt-2">
              <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="flex-1 overflow-hidden">
              <CartPanel borderless onAfterAction={() => setCartOpen(false)} />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
