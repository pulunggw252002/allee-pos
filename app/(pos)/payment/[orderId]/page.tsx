"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Banknote, CreditCard, QrCode, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Numpad, parseNumpadValue } from "@/components/pos/numpad";
import { formatIDR } from "@/lib/format";
import { getOrder, payOrder } from "@/lib/api/orders";
import { getPosConfig } from "@/lib/api/config";
import type { Order, PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

const METHOD_META: Record<
  PaymentMethod,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  cash: { label: "Tunai", icon: Banknote },
  qris: { label: "QRIS", icon: QrCode },
  card: { label: "Kartu", icon: CreditCard },
  transfer: { label: "Transfer", icon: Wallet },
};

function formatDenomLabel(v: number): string {
  if (v >= 1_000_000) return `${v / 1_000_000}jt`;
  return `${v / 1000}k`;
}

function roundUpSuggestions(total: number, steps: readonly number[]): number[] {
  const values = steps.map((step) => Math.ceil(total / step) * step);
  const unique = Array.from(new Set(values)).filter((v) => v > total);
  if (unique.length > 0) return unique.sort((a, b) => a - b);
  return steps.map((step) => total + step);
}

const ORDER_TYPE_LABEL: Record<Order["orderType"], string> = {
  "dine-in": "Dine-in",
  takeaway: "Takeaway",
  delivery: "Delivery",
};

export default function PaymentPage() {
  const router = useRouter();
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;

  const { cashDenominations, cashSuggestionSteps, enabledPaymentMethods } = getPosConfig();

  const [order, setOrder] = useState<Order | null>(null);
  const [method, setMethod] = useState<PaymentMethod>(enabledPaymentMethods[0] ?? "cash");
  const [tenderedRaw, setTenderedRaw] = useState("0");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void getOrder(orderId).then(setOrder);
  }, [orderId]);

  const tendered = parseNumpadValue(tenderedRaw);
  const change = useMemo(() => {
    if (!order) return 0;
    return Math.max(0, tendered - order.total);
  }, [order, tendered]);

  const suggestions = useMemo(() => {
    if (!order) return [];
    return roundUpSuggestions(order.total, cashSuggestionSteps);
  }, [order, cashSuggestionSteps]);

  const canPay = useMemo(() => {
    if (!order) return false;
    if (method === "cash") return tendered >= order.total;
    return true;
  }, [order, method, tendered]);

  const handlePay = async () => {
    if (!order) return;
    setSubmitting(true);
    try {
      await payOrder({
        orderId: order.id,
        method,
        tendered: method === "cash" ? tendered : undefined,
      });
      toast.success("Pembayaran berhasil");
      router.replace(`/receipt/${order.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memproses pembayaran");
    } finally {
      setSubmitting(false);
    }
  };

  if (!order) {
    return (
      <div className="flex h-full items-center justify-center py-20 text-muted-foreground">
        <p className="text-sm">Memuat order…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push("/order")} className="w-fit">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Order
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Ringkasan Order</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-1.5">
              <span>#{order.id.slice(-6).toUpperCase()} · {order.items.length} item</span>
              <Badge variant="secondary" className="text-[10px]">
                {ORDER_TYPE_LABEL[order.orderType]}
              </Badge>
              {order.orderType === "dine-in" && order.tableNumber && (
                <Badge variant="outline" className="text-[10px]">
                  Meja {order.tableNumber}
                </Badge>
              )}
              {order.orderType === "delivery" && order.deliveryProvider && (
                <Badge variant="outline" className="text-[10px]">
                  {order.deliveryProvider}
                </Badge>
              )}
              {order.customerName && (
                <Badge variant="outline" className="text-[10px]">
                  {order.customerName}
                </Badge>
              )}
              {order.isOpenBill && (
                <Badge variant="warning" className="text-[10px]">
                  OPEN BILL
                </Badge>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium">{it.productName}</p>
                    <p className="text-xs text-muted-foreground tabular">
                      {it.qty} × {formatIDR(it.unitPrice)}
                      {it.note ? ` · ${it.note}` : ""}
                    </p>
                  </div>
                  <p className="font-semibold tabular">
                    {formatIDR(it.unitPrice * it.qty)}
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-3 space-y-1 border-t pt-3 text-sm tabular">
              <Row label="Subtotal" value={formatIDR(order.subtotal)} />
              {order.discount > 0 && (
                <Row label="Diskon" value={`- ${formatIDR(order.discount)}`} />
              )}
              <Row label="PPN" value={formatIDR(order.tax)} />
              <Row label="Service" value={formatIDR(order.service)} />
              <div className="mt-2 flex items-end justify-between border-t pt-2">
                <span className="text-base font-semibold">Total</span>
                <span className="text-2xl font-bold tabular">{formatIDR(order.total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Metode Pembayaran</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {enabledPaymentMethods.map((id) => {
                const { label, icon: Icon } = METHOD_META[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMethod(id)}
                    className={cn(
                      "flex h-20 flex-col items-center justify-center gap-1 rounded-lg border p-2 transition",
                      method === id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-card hover:border-primary/40"
                    )}
                  >
                    <Icon className="h-6 w-6" />
                    <span className="text-sm font-medium">{label}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {method === "cash" ? (
          <Card>
            <CardHeader>
              <CardTitle>Uang Diterima</CardTitle>
              <CardDescription>
                Total tagihan: <span className="font-semibold">{formatIDR(order.total)}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-end justify-between">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Diterima
                  </span>
                  <span className="text-3xl font-semibold tabular">{formatIDR(tendered)}</span>
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Kembalian
                  </span>
                  <span
                    className={cn(
                      "text-xl font-bold tabular",
                      tendered < order.total ? "text-destructive" : "text-emerald-600"
                    )}
                  >
                    {tendered < order.total
                      ? `Kurang ${formatIDR(order.total - tendered)}`
                      : formatIDR(change)}
                  </span>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                  Nominal uang
                </p>
                <div className="grid grid-cols-5 gap-2">
                  <Button
                    variant="outline"
                    className="h-12 font-semibold"
                    onClick={() => setTenderedRaw(String(order.total))}
                  >
                    Pas
                  </Button>
                  {cashDenominations.map((d) => (
                    <Button
                      key={d}
                      variant="outline"
                      className="h-12 tabular"
                      onClick={() => setTenderedRaw(String(d))}
                    >
                      {formatDenomLabel(d)}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                  Saran (pembulatan ke atas)
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {suggestions.slice(0, 5).map((v) => (
                    <Button
                      key={v}
                      variant="secondary"
                      className="h-12 tabular"
                      onClick={() => setTenderedRaw(String(v))}
                    >
                      {formatIDR(v)}
                    </Button>
                  ))}
                  {Array.from({ length: Math.max(0, 5 - suggestions.length) }).map((_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
                </div>
              </div>

              <Numpad value={tenderedRaw} onChange={setTenderedRaw} maxLength={10} />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Konfirmasi {METHOD_META[method].label}</CardTitle>
              <CardDescription>
                Pastikan pembayaran {METHOD_META[method].label} sudah berhasil
                sebelum konfirmasi.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-muted/30 p-6 text-center">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
                <p className="mt-1 text-4xl font-bold tabular">{formatIDR(order.total)}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Button
          size="xl"
          className="w-full"
          onClick={handlePay}
          disabled={!canPay || submitting}
        >
          {submitting
            ? "Memproses…"
            : `Bayar ${formatIDR(order.total)} — ${METHOD_META[method].label}`}
        </Button>
      </div>
    </div>
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
