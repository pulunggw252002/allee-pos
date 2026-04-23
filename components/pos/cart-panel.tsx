"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bike,
  ClipboardList,
  CreditCard,
  Minus,
  Plus,
  ShoppingBag,
  StickyNote,
  Tag,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { getPosConfig } from "@/lib/api/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cartTotals, useCartStore } from "@/lib/stores/cart-store";
import { useShiftStore } from "@/lib/stores/shift-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { createOrder } from "@/lib/api/orders";
import type { OrderType } from "@/lib/types";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";

const ORDER_TYPES: Array<{
  id: OrderType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "dine-in", label: "Dine-in", icon: Utensils },
  { id: "takeaway", label: "Takeaway", icon: ShoppingBag },
  { id: "delivery", label: "Delivery", icon: Bike },
];

interface CartPanelProps {
  /**
   * Callback untuk menutup drawer saat dipakai di mobile sheet.
   * Tidak dipanggil saat dipakai sebagai aside side-bar di desktop.
   */
  onAfterAction?: () => void;
  /** Sembunyikan border kiri (dipakai di drawer mobile). */
  borderless?: boolean;
}

export function CartPanel({ onAfterAction, borderless }: CartPanelProps = {}) {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const orderType = useCartStore((s) => s.orderType);
  const tableNumber = useCartStore((s) => s.tableNumber);
  const customerName = useCartStore((s) => s.customerName);
  const deliveryProvider = useCartStore((s) => s.deliveryProvider);
  const discount = useCartStore((s) => s.discount);

  const setOrderType = useCartStore((s) => s.setOrderType);
  const setTableNumber = useCartStore((s) => s.setTableNumber);
  const setCustomerName = useCartStore((s) => s.setCustomerName);
  const setDeliveryProvider = useCartStore((s) => s.setDeliveryProvider);
  const setDiscount = useCartStore((s) => s.setDiscount);
  const increment = useCartStore((s) => s.increment);
  const decrement = useCartStore((s) => s.decrement);
  const remove = useCartStore((s) => s.remove);
  const setItemNote = useCartStore((s) => s.setItemNote);
  const clearCart = useCartStore((s) => s.clear);

  const shift = useShiftStore((s) => s.shift);
  const cashier = useAuthStore((s) => s.cashier);

  const [discountOpen, setDiscountOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [discDraft, setDiscDraft] = useState("0");
  const [submitting, setSubmitting] = useState(false);

  const subtotal = items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
  const { afterDiscount, tax, service, total } = cartTotals(subtotal, discount);

  const { deliveryProviders, discountPresets } = getPosConfig();
  const dineInMissingTable = orderType === "dine-in" && !tableNumber?.trim();
  const deliveryMissingProvider = orderType === "delivery" && !deliveryProvider?.trim();
  const isCustomProvider =
    !!deliveryProvider && !deliveryProviders.includes(deliveryProvider);

  const submit = async (isOpenBill: boolean) => {
    if (!shift || !cashier) {
      toast.error("Shift atau kasir tidak ditemukan");
      return;
    }
    if (items.length === 0) {
      toast.error("Cart kosong");
      return;
    }
    if (orderType === "dine-in" && !tableNumber?.trim()) {
      toast.error("Dine-in wajib isi nomor meja");
      return;
    }
    if (orderType === "delivery" && !deliveryProvider?.trim()) {
      toast.error("Delivery wajib pilih layanan");
      return;
    }
    if (isOpenBill && !customerName?.trim()) {
      toast.error("Open Bill wajib isi nama pelanggan");
      return;
    }

    setSubmitting(true);
    try {
      const order = await createOrder({
        shiftId: shift.id,
        cashierId: cashier.id,
        orderType,
        tableNumber: orderType === "dine-in" ? tableNumber : undefined,
        deliveryProvider:
          orderType === "delivery" ? deliveryProvider?.trim() || undefined : undefined,
        customerName: customerName?.trim() || undefined,
        isOpenBill,
        discount,
        items: items.map((it) => ({
          productId: it.productId,
          qty: it.qty,
          note: it.note,
        })),
      });
      clearCart();
      onAfterAction?.();
      if (isOpenBill) {
        toast.success(`Open Bill disimpan${order.customerName ? ` — ${order.customerName}` : ""}`);
        router.push("/tables");
      } else {
        router.push(`/payment/${order.id}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat order");
    } finally {
      setSubmitting(false);
    }
  };

  const openNoteFor = (productId: string, current?: string) => {
    setNoteFor(productId);
    setNoteDraft(current ?? "");
  };

  const saveNote = () => {
    if (noteFor) setItemNote(noteFor, noteDraft.trim());
    setNoteFor(null);
  };

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-card",
        !borderless && "border-l"
      )}
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">Order Baru</h2>
          <p className="text-xs text-muted-foreground tabular">
            {items.length} item · {items.reduce((s, it) => s + it.qty, 0)} qty
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearCart}
          disabled={items.length === 0}
        >
          <X className="h-4 w-4" />
          Bersihkan
        </Button>
      </div>

      <div className="space-y-3 border-b px-4 py-3">
        <div>
          <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
            Jenis Order
          </Label>
          <div className="grid grid-cols-3 gap-1.5">
            {ORDER_TYPES.map(({ id, label, icon: Icon }) => {
              const active = orderType === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setOrderType(id)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-md border p-2 text-xs font-medium transition",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:border-primary/40"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {orderType === "dine-in" && (
          <div>
            <Label htmlFor="table-no" className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Nomor Meja <span className="text-destructive">*</span>
            </Label>
            <Input
              id="table-no"
              value={tableNumber ?? ""}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder="mis. 5, A2, VIP 1"
              className={cn(dineInMissingTable && "border-destructive")}
            />
          </div>
        )}

        {orderType === "delivery" && (
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Layanan Delivery <span className="text-destructive">*</span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {deliveryProviders.map((p) => {
                const active = deliveryProvider === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setDeliveryProvider(p)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background hover:border-primary/40"
                    )}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setDeliveryProvider("")}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  isCustomProvider
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:border-primary/40"
                )}
              >
                Lainnya…
              </button>
            </div>
            {(isCustomProvider || deliveryProvider === "") && (
              <Input
                autoFocus
                value={deliveryProvider ?? ""}
                onChange={(e) => setDeliveryProvider(e.target.value)}
                placeholder="Ketik nama layanan (mis. Maxim, inDrive)"
                className={cn("mt-2", deliveryMissingProvider && "border-destructive")}
              />
            )}
          </div>
        )}

        <div>
          <Label htmlFor="cust-name" className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
            Nama Pelanggan <span className="text-muted-foreground">(wajib untuk Open Bill)</span>
          </Label>
          <Input
            id="cust-name"
            value={customerName ?? ""}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="mis. Budi"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 justify-start gap-2"
          onClick={() => {
            setDiscDraft(String(discount));
            setDiscountOpen(true);
          }}
        >
          <Tag className="h-4 w-4" />
          {discount > 0 ? `Disc ${formatIDR(discount)}` : "Diskon"}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Tap menu di sebelah kiri untuk menambah item.
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((it) => (
              <li key={it.productId} className="p-3">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">{it.emoji ?? "🍽️"}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.name}</p>
                    <p className="text-xs text-muted-foreground tabular">
                      {formatIDR(it.unitPrice)}
                    </p>
                    {it.note && (
                      <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">
                        &ldquo;{it.note}&rdquo;
                      </p>
                    )}
                  </div>
                  <p className="text-sm font-semibold tabular">
                    {formatIDR(it.unitPrice * it.qty)}
                  </p>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => decrement(it.productId)}
                      aria-label="Kurangi"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-8 text-center text-sm font-semibold tabular">{it.qty}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => increment(it.productId)}
                      aria-label="Tambah"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openNoteFor(it.productId, it.note)}
                      aria-label="Catatan item"
                    >
                      <StickyNote className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(it.productId)}
                      aria-label="Hapus"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Separator />
      <div className="space-y-1 px-4 py-3 text-sm tabular">
        <Row label="Subtotal" value={formatIDR(subtotal)} />
        {discount > 0 && <Row label="Diskon" value={`- ${formatIDR(discount)}`} />}
        {discount > 0 && <Row label="Setelah diskon" value={formatIDR(afterDiscount)} />}
        <Row label="PPN 10%" value={formatIDR(tax)} />
        <Row label="Service 5%" value={formatIDR(service)} />
      </div>

      <div className="border-t px-4 py-3 pb-safe-4">
        <div className="mb-3 flex items-end justify-between">
          <span className="text-sm font-medium text-muted-foreground">Total</span>
          <span className="text-3xl font-bold tabular">{formatIDR(total)}</span>
        </div>

        {dineInMissingTable && items.length > 0 && (
          <Badge variant="destructive" className="mb-2 w-full justify-center py-1 text-xs">
            Nomor meja wajib diisi
          </Badge>
        )}
        {deliveryMissingProvider && items.length > 0 && (
          <Badge variant="destructive" className="mb-2 w-full justify-center py-1 text-xs">
            Layanan delivery wajib dipilih
          </Badge>
        )}

        <div className="space-y-2">
          <Button
            size="xl"
            className="w-full"
            disabled={
              items.length === 0 || submitting || dineInMissingTable || deliveryMissingProvider
            }
            onClick={() => submit(false)}
          >
            <CreditCard className="h-5 w-5" />
            {submitting ? "Memproses…" : "Lanjutkan ke Pembayaran"}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full"
            disabled={
              items.length === 0 || submitting || dineInMissingTable || deliveryMissingProvider
            }
            onClick={() => submit(true)}
          >
            <ClipboardList className="h-5 w-5" />
            Simpan Open Bill
          </Button>
        </div>
      </div>

      {/* Discount */}
      <Dialog open={discountOpen} onOpenChange={setDiscountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atur Diskon Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              inputMode="numeric"
              value={discDraft}
              onChange={(e) => setDiscDraft(e.target.value.replace(/[^0-9]/g, ""))}
              className="h-12 text-lg tabular"
            />
            <div className="grid grid-cols-4 gap-2">
              {discountPresets.map((v) => (
                <Button key={v} variant="outline" onClick={() => setDiscDraft(String(v))}>
                  {v === 0 ? "Reset" : formatIDR(v)}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDiscountOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={() => {
                setDiscount(Number(discDraft || "0"));
                setDiscountOpen(false);
              }}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Note */}
      <Dialog open={!!noteFor} onOpenChange={(o) => !o && setNoteFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Catatan Item</DialogTitle>
          </DialogHeader>
          <Input
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="mis. less sugar, no ice"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoteFor(null)}>
              Batal
            </Button>
            <Button onClick={saveNote}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
