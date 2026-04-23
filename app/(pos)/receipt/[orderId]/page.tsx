"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getOrder } from "@/lib/api/orders";
import { getPosConfig } from "@/lib/api/config";
import type { Order, OrderType, PaymentMethod } from "@/lib/types";
import { formatDateTime, formatIDR } from "@/lib/format";

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

  useEffect(() => {
    void getOrder(params.orderId).then(setOrder);
  }, [params.orderId]);

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
  const { outlet } = getPosConfig();
  const taxPct = Math.round(outlet.taxRate * 100);
  const servicePct = Math.round(outlet.serviceRate * 100);

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
            </div>

            <p className="my-1 text-xs">--------------------------------</p>

            <ul>
              {order.items.map((it) => (
                <li key={it.id} className="py-0.5">
                  <div className="flex justify-between">
                    <span className="truncate pr-2">{it.productName}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>
                      {it.qty} × {formatIDR(it.unitPrice)}
                    </span>
                    <span>{formatIDR(it.qty * it.unitPrice)}</span>
                  </div>
                  {it.note && <div className="pl-2 text-[11px] italic">* {it.note}</div>}
                </li>
              ))}
            </ul>

            <p className="my-1 text-xs">--------------------------------</p>

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
              </div>
            ) : (
              <div className="mt-2 rounded border border-dashed border-black p-1 text-center text-xs font-bold">
                BELUM DIBAYAR
              </div>
            )}

            <div className="mt-3 text-center text-xs">
              {outlet.receiptFooter.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
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
