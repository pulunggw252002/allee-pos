"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bike,
  ClipboardList,
  CreditCard,
  RotateCw,
  Search,
  ShoppingBag,
  Utensils,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listOpenOrders } from "@/lib/api/orders";
import type { Order, OrderType } from "@/lib/types";
import { formatDuration, formatIDR, formatTime } from "@/lib/format";
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

type Filter = "all" | "open-bill" | "direct";

export default function OpenBillsPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const refresh = async () => {
    setLoading(true);
    const list = await listOpenOrders();
    setOrders(list);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter((o) => {
        if (filter === "open-bill" && !o.isOpenBill) return false;
        if (filter === "direct" && o.isOpenBill) return false;
        if (!q) return true;
        return (
          (o.customerName ?? "").toLowerCase().includes(q) ||
          (o.tableNumber ?? "").toLowerCase().includes(q) ||
          (o.deliveryProvider ?? "").toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [orders, query, filter]);

  const counts = useMemo(() => {
    const openBill = orders.filter((o) => o.isOpenBill).length;
    const direct = orders.length - openBill;
    return { openBill, direct, all: orders.length };
  }, [orders]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Open Bills &amp; Order Aktif</h1>
          <p className="text-sm text-muted-foreground">
            Order yang belum dibayar. Tap untuk lanjut ke pembayaran.
          </p>
        </div>
        <Button variant="outline" onClick={refresh}>
          <RotateCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama pelanggan atau nomor meja…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            Semua ({counts.all})
          </FilterChip>
          <FilterChip active={filter === "open-bill"} onClick={() => setFilter("open-bill")}>
            Open Bill ({counts.openBill})
          </FilterChip>
          <FilterChip active={filter === "direct"} onClick={() => setFilter("direct")}>
            Langsung ({counts.direct})
          </FilterChip>
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Memuat order…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {orders.length === 0
                ? "Belum ada order yang terbuka."
                : "Tidak ada order yang cocok dengan pencarian."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((o) => {
            const Icon = TYPE_ICON[o.orderType] ?? Utensils;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => router.push(`/payment/${o.id}`)}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border bg-card p-4 text-left transition active:scale-[0.99]",
                  o.isOpenBill
                    ? "border-amber-300 hover:border-amber-500"
                    : "hover:border-primary/50"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-md",
                        o.isOpenBill
                          ? "bg-amber-100 text-amber-700"
                          : "bg-primary/10 text-primary"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {TYPE_LABEL[o.orderType]}
                        {o.orderType === "dine-in" && o.tableNumber && ` · Meja ${o.tableNumber}`}
                        {o.orderType === "delivery" && o.deliveryProvider && ` · ${o.deliveryProvider}`}
                      </p>
                      <p className="font-semibold leading-tight">
                        {o.customerName ?? `#${o.id.slice(-6).toUpperCase()}`}
                      </p>
                    </div>
                  </div>
                  {o.isOpenBill && (
                    <Badge variant="warning" className="text-[10px]">
                      OPEN BILL
                    </Badge>
                  )}
                </div>

                <div className="flex items-end justify-between border-t pt-2">
                  <div className="text-xs text-muted-foreground">
                    <p className="tabular">{o.items.length} item</p>
                    <p className="tabular" suppressHydrationWarning>
                      {formatTime(o.createdAt)} · {formatDuration(o.createdAt)}
                    </p>
                  </div>
                  <p className="text-lg font-bold tabular">{formatIDR(o.total)}</p>
                </div>

                <div className="flex items-center justify-end gap-1 pt-1 text-xs text-primary">
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>Bayar sekarang →</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
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
