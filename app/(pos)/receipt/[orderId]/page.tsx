"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Ban, Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { getOrder, voidOrderItem } from "@/lib/api/orders";
import { getPosConfig } from "@/lib/api/config";
import type { Order, OrderItem, OrderType, PaymentMethod } from "@/lib/types";
import { formatDateTime, formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Tunai",
  qris: "QRIS",
  card: "Kartu",
  transfer: "Transfer",
};

const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  "dine-in": "Dine-in",
  takeaway: "Takeaway",
  delivery: "Delivery",
};

export default function ReceiptPage() {
  const router = useRouter();
  const params = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [voidTarget, setVoidTarget] = useState<OrderItem | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  useEffect(() => {
    void getOrder(params.orderId).then(setOrder);
  }, [params.orderId]);

  const refresh = async () => {
    const fresh = await getOrder(params.orderId);
    if (fresh) setOrder(fresh);
  };

  const handleVoid = async () => {
    if (!voidTarget) return;
    const reason = voidReason.trim();
    if (!reason) {
      toast.error("Alasan void wajib diisi");
      return;
    }
    setVoiding(true);
    try {
      await voidOrderItem({
        orderId: params.orderId,
        itemId: voidTarget.id,
        reason,
      });
      toast.success(`Item "${voidTarget.productName}" berhasil di-void`);
      setVoidTarget(null);
      setVoidReason("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal void item");
    } finally {
      setVoiding(false);
    }
  };

  if (!order) {
    return (
      <div className="flex h-full items-center justify-center py-20 text-muted-foreground">
        <p className="text-sm">Memuat struk…</p>
      </div>
    );
  }

  const shortId = order.id.slice(-6).toUpperCase();
  const shortShift = order.shiftId.slice(-6).toUpperCase();
  const isPaid = order.status === "paid";
  const isOrderVoid = order.status === "void";
  const { outlet } = getPosConfig();
  const taxPct = Math.round(outlet.taxRate * 100);
  const servicePct = Math.round(outlet.serviceRate * 100);

  // Hitung agregat void per item untuk menampilkan ringkasan.
  const voidedItems = order.items.filter((it) => it.voidedAt);
  const voidedSubtotal = voidedItems.reduce(
    (s, it) => s + it.unitPrice * it.qty,
    0
  );
  const activeItems = order.items.filter((it) => !it.voidedAt);
  const hasVoided = voidedItems.length > 0;
  // Jika order paid dan ada void item, payment.amount > order.total → selisih.
  const paidAmount = order.payment?.amount ?? 0;
  const refundDue = isPaid && hasVoided ? Math.max(0, paidAmount - order.total) : 0;

  // Tombol void hanya tampil untuk item aktif & order belum di-void seluruhnya.
  // Untuk paid order, void item tetap diizinkan (item terakhir dilarang oleh backend
  // hanya jika order BELUM paid — karena untuk paid kasir tidak bisa void seluruhnya).
  const canShowVoidButton = (it: OrderItem) =>
    !isOrderVoid && !it.voidedAt && (isPaid || activeItems.length > 1);

  return (
    <div className="mx-auto max-w-2xl p-3 pb-[calc(var(--sa-bottom)+1rem)] sm:p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print-hidden">
        <Button variant="ghost" size="sm" onClick={() => router.push("/order")}>
          <ArrowLeft className="h-4 w-4" /> Kembali
        </Button>
        <div className="flex flex-1 justify-end gap-2 sm:flex-none">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Cetak Struk</span>
            <span className="sm:hidden">Cetak</span>
          </Button>
          <Button size="sm" onClick={() => router.push("/order")}>
            <Plus className="h-4 w-4" /> Order Baru
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="print-receipt mx-auto max-w-[320px] font-mono text-[13px] leading-snug text-foreground">
            <div className="text-center">
              <p className="text-base font-bold">{outlet.brandName}</p>
              <p className="text-xs">{outlet.subtitle}</p>
              {order.isOpenBill && (
                <p className="mt-1 border border-dashed border-black py-0.5 text-xs font-bold">
                  {isPaid ? "OPEN BILL — PAID" : "OPEN BILL"}
                </p>
              )}
              {isOrderVoid && (
                <p className="mt-1 border border-dashed border-black py-0.5 text-xs font-bold">
                  ** ORDER VOID **
                </p>
              )}
              <p className="text-xs">--------------------------------</p>
            </div>

            <div className="mt-1 text-xs">
              <Line label="No" value={`#${shortId}`} />
              <Line label="Waktu" value={formatDateTime(order.paidAt ?? order.createdAt)} />
              <Line label="Shift" value={`#${shortShift}`} />
              <Line label="Tipe" value={ORDER_TYPE_LABEL[order.orderType]} />
              {order.orderType === "dine-in" && order.tableNumber && (
                <Line label="Meja" value={order.tableNumber} />
              )}
              {order.orderType === "delivery" && order.deliveryProvider && (
                <Line label="Layanan" value={order.deliveryProvider} />
              )}
              {order.customerName && <Line label="Pelanggan" value={order.customerName} />}
              <Line label="Kasir" value={order.cashierName} />
            </div>

            <p className="my-1 text-xs">--------------------------------</p>

            <ul>
              {order.items.map((it) => {
                const isVoid = !!it.voidedAt;
                return (
                  <li
                    key={it.id}
                    className={cn(
                      "py-0.5",
                      isVoid && "text-muted-foreground"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          "truncate pr-2",
                          isVoid && "line-through"
                        )}
                      >
                        {it.productName}
                      </span>
                      {isVoid && (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-destructive">
                          VOID
                        </span>
                      )}
                      {canShowVoidButton(it) && (
                        <button
                          type="button"
                          onClick={() => {
                            setVoidTarget(it);
                            setVoidReason("");
                          }}
                          className="print-hidden shrink-0 rounded border border-destructive/40 px-1.5 py-0.5 text-[10px] font-medium text-destructive transition hover:bg-destructive/10"
                        >
                          <Ban className="mr-0.5 inline h-2.5 w-2.5" /> Void
                        </button>
                      )}
                    </div>
                    <div
                      className={cn(
                        "flex justify-between text-xs",
                        isVoid && "line-through"
                      )}
                    >
                      <span>
                        {it.qty} × {formatIDR(it.unitPrice)}
                      </span>
                      <span>{formatIDR(it.qty * it.unitPrice)}</span>
                    </div>
                    {it.note && (
                      <div className="pl-2 text-[11px] italic">* {it.note}</div>
                    )}
                    {isVoid && it.voidReason && (
                      <div className="pl-2 text-[11px] italic text-destructive">
                        ↳ Void: {it.voidReason}
                        {it.voidedByName ? ` (${it.voidedByName})` : ""}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <p className="my-1 text-xs">--------------------------------</p>

            {hasVoided && (
              <>
                <div className="text-xs text-muted-foreground">
                  <Line
                    label={`Item Void (${voidedItems.length})`}
                    value={`- ${formatIDR(voidedSubtotal)}`}
                  />
                </div>
                <p className="my-1 text-xs">--------------------------------</p>
              </>
            )}

            <div className="text-xs">
              <Line label="Subtotal" value={formatIDR(order.subtotal)} />
              {order.discount > 0 && (
                <Line label="Diskon" value={`- ${formatIDR(order.discount)}`} />
              )}
              <Line label={`PPN ${taxPct}%`} value={formatIDR(order.tax)} />
              <Line label={`Service ${servicePct}%`} value={formatIDR(order.service)} />
            </div>

            <p className="my-1 text-xs">--------------------------------</p>

            <div className="text-sm font-bold">
              <Line label="TOTAL" value={formatIDR(order.total)} />
            </div>

            {order.payment ? (
              <div className="mt-1 text-xs">
                <Line
                  label={`Bayar (${METHOD_LABEL[order.payment.method]})`}
                  value={formatIDR(order.payment.tendered ?? order.payment.amount)}
                />
                {order.payment.method === "cash" && (order.payment.change ?? 0) > 0 && (
                  <Line label="Kembali" value={formatIDR(order.payment.change ?? 0)} />
                )}
                {refundDue > 0 && (
                  <>
                    <p className="my-1 text-xs">--------------------------------</p>
                    <div className="text-xs font-bold text-destructive">
                      <Line label="Refund Item Void" value={formatIDR(refundDue)} />
                    </div>
                  </>
                )}
              </div>
            ) : (
              !isOrderVoid && (
                <div className="mt-2 rounded border border-dashed border-black p-1 text-center text-xs font-bold">
                  BELUM DIBAYAR
                </div>
              )
            )}

            <div className="mt-3 text-center text-xs">
              {outlet.receiptFooter.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {hasVoided && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive print-hidden">
          <p className="flex items-center gap-1.5 font-medium">
            <Ban className="h-3.5 w-3.5" />
            {voidedItems.length} item di-void • nilai {formatIDR(voidedSubtotal)} tidak masuk
            revenue.
          </p>
          {refundDue > 0 && (
            <p className="mt-0.5">
              Selisih pembayaran: <Badge variant="destructive">{formatIDR(refundDue)}</Badge>{" "}
              perlu dikembalikan ke pelanggan atau akan muncul sebagai selisih kas saat tutup
              shift.
            </p>
          )}
        </div>
      )}

      {/* Void confirmation dialog */}
      <Dialog
        open={!!voidTarget}
        onOpenChange={(open) => {
          if (!open && !voiding) {
            setVoidTarget(null);
            setVoidReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" />
              Void Item
            </DialogTitle>
            <DialogDescription>
              {voidTarget && (
                <>
                  <span className="font-medium text-foreground">
                    {voidTarget.qty}× {voidTarget.productName}
                  </span>{" "}
                  ({formatIDR(voidTarget.qty * voidTarget.unitPrice)}) akan dikeluarkan dari
                  total order. Bahan yang sudah dipakai tetap berkurang, tapi nilai item ini
                  tidak masuk revenue/profit.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="void-reason">Alasan void</Label>
            <Input
              id="void-reason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="mis. salah menu, customer cancel, dll"
              maxLength={200}
              autoFocus
              disabled={voiding}
            />
            <p className="text-xs text-muted-foreground">
              Wajib diisi untuk audit trail (max 200 karakter).
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setVoidTarget(null);
                setVoidReason("");
              }}
              disabled={voiding}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleVoid}
              disabled={voiding || !voidReason.trim()}
            >
              {voiding ? "Memproses…" : "Void Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="truncate">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
