"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bike,
  Ban,
  CheckCircle2,
  CreditCard,
  History,
  Receipt,
  RotateCw,
  Search,
  ShoppingBag,
  Utensils,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listOrders } from "@/lib/api/orders";
import type { Order, OrderType, PaymentMethod } from "@/lib/types";
import { formatDateTime, formatIDR, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<OrderType, React.ComponentType<{ className?: string }>> = {
  "dine-in": Utensils,
  takeaway: ShoppingBag,
  delivery: Bike,
};

const TYPE_LABEL: Record<OrderType, string> = {
  "dine-in": "Dine-in",
  takeaway: "Takeaway",
  delivery: "Delivery",
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Tunai",
  qris: "QRIS",
  card: "Kartu",
  transfer: "Transfer",
};

type Filter = "all" | "paid" | "void" | "today";

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function HistoryPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const refresh = async () => {
    setLoading(true);
    const list = await listOrders();
    setOrders(list.filter((o) => o.status === "paid" || o.status === "void"));
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const today = startOfToday();
    return orders
      .filter((o) => {
        if (filter === "paid" && o.status !== "paid") return false;
        if (filter === "void" && o.status !== "void") return false;
        if (filter === "today") {
          const at = new Date(o.paidAt ?? o.createdAt).getTime();
          if (at < today) return false;
        }
        if (!q) return true;
        return (
          o.id.toLowerCase().includes(q) ||
          (o.customerName ?? "").toLowerCase().includes(q) ||
          (o.tableNumber ?? "").toLowerCase().includes(q) ||
          (o.deliveryProvider ?? "").toLowerCase().includes(q) ||
          o.items.some((it) => it.productName.toLowerCase().includes(q))
        );
      })
      .sort((a, b) =>
        (b.paidAt ?? b.createdAt).localeCompare(a.paidAt ?? a.createdAt)
      );
  }, [orders, query, filter]);

  const counts = useMemo(() => {
    const today = startOfToday();
    const paid = orders.filter((o) => o.status === "paid").length;
    const voided = orders.filter((o) => o.status === "void").length;
    const todayCount = orders.filter(
      (o) => new Date(o.paidAt ?? o.createdAt).getTime() >= today
    ).length;
    return { all: orders.length, paid, void: voided, today: todayCount };
  }, [orders]);

  const totals = useMemo(() => {
    let revenue = 0;
    const byMethod: Record<PaymentMethod, number> = {
      cash: 0,
      qris: 0,
      card: 0,
      transfer: 0,
    };
    for (const o of filtered) {
      if (o.status !== "paid" || !o.payment) continue;
      revenue += o.total;
      byMethod[o.payment.method] += o.total;
    }
    return { revenue, byMethod, count: filtered.length };
  }, [filtered]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 pb-[calc(var(--sa-bottom)+1rem)] sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold sm:text-2xl">
            <History className="h-5 w-5 sm:h-6 sm:w-6" /> Riwayat Pesanan
          </h1>
          <p className="text-sm text-muted-foreground">
            Semua nota yang sudah ditutup. Tap untuk membuka struk.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RotateCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <StatCard label="Transaksi" value={String(totals.count)} />
        <StatCard label="Total Pendapatan" value={formatIDR(totals.revenue)} />
        <StatCard
          label="Tunai / Non-Tunai"
          value={`${formatIDR(totals.byMethod.cash)} / ${formatIDR(
            totals.byMethod.qris + totals.byMethod.card + totals.byMethod.transfer
          )}`}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nota, pelanggan, meja, atau menu…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            Semua ({counts.all})
          </FilterChip>
          <FilterChip active={filter === "today"} onClick={() => setFilter("today")}>
            Hari Ini ({counts.today})
          </FilterChip>
          <FilterChip active={filter === "paid"} onClick={() => setFilter("paid")}>
            Paid ({counts.paid})
          </FilterChip>
          <FilterChip active={filter === "void"} onClick={() => setFilter("void")}>
            Void ({counts.void})
          </FilterChip>
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Memuat riwayat…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Receipt className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {orders.length === 0
                ? "Belum ada transaksi yang tersimpan."
                : "Tidak ada transaksi yang cocok."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <HistoryRow
              key={o.id}
              order={o}
              onOpen={() => router.push(`/receipt/${o.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryRow({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const Icon = TYPE_ICON[order.orderType] ?? Utensils;
  const shortId = order.id.slice(-6).toUpperCase();
  const cashier = order.cashierName || "—";
  const ref =
    order.orderType === "dine-in" && order.tableNumber
      ? `Meja ${order.tableNumber}`
      : order.orderType === "delivery" && order.deliveryProvider
        ? `${order.deliveryProvider}${order.customerName ? ` · ${order.customerName}` : ""}`
        : (order.customerName ?? "Takeaway");
  const isVoid = order.status === "void";
  const voidedItemsCount = order.items.filter((it) => it.voidedAt).length;
  const hasItemVoids = voidedItemsCount > 0 && !isVoid;
  const itemsPreview = order.items
    .map((it) => `${it.qty}× ${it.productName}${it.voidedAt ? " (void)" : ""}`)
    .join(", ");

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full rounded-xl border bg-card p-3 text-left transition hover:border-primary/50 active:scale-[0.998]",
        isVoid && "border-destructive/30 bg-destructive/5"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
            isVoid ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
          )}
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold">#{shortId}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              {TYPE_LABEL[order.orderType]} · {ref}
            </span>
            {isVoid ? (
              <Badge variant="destructive" className="ml-1 h-5 text-[10px]">
                <Ban className="h-3 w-3" /> VOID
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="ml-1 h-5 border-emerald-300 bg-emerald-50 text-[10px] text-emerald-800"
              >
                <CheckCircle2 className="h-3 w-3" /> PAID
              </Badge>
            )}
            {order.isOpenBill && (
              <Badge variant="warning" className="h-5 text-[10px]">
                OPEN BILL
              </Badge>
            )}
            {hasItemVoids && (
              <Badge
                variant="outline"
                className="h-5 border-destructive/40 bg-destructive/10 text-[10px] text-destructive"
              >
                <Ban className="h-3 w-3" /> {voidedItemsCount} item void
              </Badge>
            )}
          </div>

          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {itemsPreview}
          </p>

          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular">
            <span suppressHydrationWarning>
              {formatDateTime(order.paidAt ?? order.createdAt)}
            </span>
            <span>Kasir: {cashier}</span>
            <span>{order.items.length} item</span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className={cn("text-lg font-bold tabular", isVoid && "line-through")}>
            {formatIDR(order.total)}
          </p>
          {order.payment ? (
            <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
              <CreditCard className="h-3 w-3" />
              <span>{METHOD_LABEL[order.payment.method]}</span>
            </div>
          ) : (
            <p className="mt-0.5 text-[11px] text-muted-foreground">—</p>
          )}
          {order.payment?.method === "cash" && (
            <p className="mt-0.5 text-[11px] text-muted-foreground tabular">
              Bayar {formatIDR(order.payment.tendered ?? order.total)}
              {(order.payment.change ?? 0) > 0
                ? ` · Kembali ${formatIDR(order.payment.change ?? 0)}`
                : ""}
            </p>
          )}
          <p className="mt-0.5 text-[10px] text-muted-foreground tabular">
            {formatTime(order.paidAt ?? order.createdAt)}
          </p>
        </div>
      </div>
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold tabular">{value}</p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button variant={active ? "default" : "outline"} size="sm" onClick={onClick}>
      {children}
    </Button>
  );
}
