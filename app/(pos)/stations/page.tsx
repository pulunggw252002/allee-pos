"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bike,
  ChefHat,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  RotateCw,
  ShoppingBag,
  UtensilsCrossed,
  Utensils,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  listActiveStationItems,
  nextStatus,
  updateItemStatus,
} from "@/lib/api/orders";
import { getPosConfig } from "@/lib/api/config";
import { MOCK_STATIONS } from "@/lib/mock/stations";
import { useAuthStore } from "@/lib/stores/auth-store";
import type { Order, OrderItem, OrderItemStatus, OrderType } from "@/lib/types";
import { formatDuration, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Row = { order: Order; item: OrderItem };

const STATUS_META: Record<OrderItemStatus, {
  label: string;
  chip: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  pending: { label: "Pending", chip: "bg-amber-50 text-amber-800 border-amber-300", icon: Clock },
  ongoing: { label: "On Going", chip: "bg-sky-50 text-sky-800 border-sky-300", icon: Flame },
  serve: { label: "Serve", chip: "bg-emerald-50 text-emerald-800 border-emerald-300", icon: UtensilsCrossed },
  done: { label: "Done", chip: "bg-muted text-muted-foreground border", icon: CheckCircle2 },
};

const TYPE_ICON: Record<OrderType, React.ComponentType<{ className?: string }>> = {
  "dine-in": Utensils,
  takeaway: ShoppingBag,
  delivery: Bike,
};

export default function StationsPage() {
  const cashier = useAuthStore((s) => s.cashier);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [stationFilter, setStationFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await listActiveStationItems();
    setRows(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 3_000);
    return () => clearInterval(id);
  }, [refresh]);

  const stationCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.item.stationId, (m.get(r.item.stationId) ?? 0) + 1);
    return m;
  }, [rows]);

  // Group by order (oldest first = FIFO)
  const orderGroups = useMemo(() => {
    const byOrder = new Map<string, { order: Order; items: OrderItem[] }>();
    for (const r of rows) {
      if (stationFilter !== "all" && r.item.stationId !== stationFilter) continue;
      const existing = byOrder.get(r.order.id);
      if (existing) {
        existing.items.push(r.item);
      } else {
        byOrder.set(r.order.id, { order: r.order, items: [r.item] });
      }
    }
    return Array.from(byOrder.values()).sort((a, b) =>
      a.order.createdAt.localeCompare(b.order.createdAt)
    );
  }, [rows, stationFilter]);

  const advance = async (orderId: string, item: OrderItem, to: OrderItemStatus) => {
    if (!cashier) {
      toast.error("Belum login");
      return;
    }
    setBusyId(item.id);
    try {
      await updateItemStatus({
        orderId,
        itemId: item.id,
        next: to,
        role: cashier.role,
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal update status");
    } finally {
      setBusyId(null);
    }
  };

  const canMarkDone = !!cashier && getPosConfig().itemDoneRoles.includes(cashier.role);

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-3 pb-[calc(var(--sa-bottom)+1rem)] sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold sm:text-2xl">
            <ChefHat className="h-5 w-5 sm:h-6 sm:w-6" /> Station Tracking
          </h1>
          <p className="text-sm text-muted-foreground">
            Dikelompokkan per order. Geser pending → on going → serve → done.
            Hanya <b>kasir</b> yang menandai <b>Done</b>.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RotateCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={stationFilter === "all"} onClick={() => setStationFilter("all")}>
          Semua ({rows.length})
        </Chip>
        {MOCK_STATIONS.map((st) => (
          <Chip
            key={st.id}
            active={stationFilter === st.id}
            onClick={() => setStationFilter(st.id)}
          >
            {st.name} ({stationCounts.get(st.id) ?? 0})
          </Chip>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Memuat data…</p>
      ) : orderGroups.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Belum ada order yang perlu dikerjakan.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {orderGroups.map((g, idx) => (
            <OrderBoard
              key={g.order.id}
              seq={idx + 1}
              order={g.order}
              items={g.items}
              busyId={busyId}
              canMarkDone={canMarkDone}
              onAdvance={advance}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderBoard({
  seq,
  order,
  items,
  busyId,
  canMarkDone,
  onAdvance,
}: {
  seq: number;
  order: Order;
  items: OrderItem[];
  busyId: string | null;
  canMarkDone: boolean;
  onAdvance: (orderId: string, item: OrderItem, to: OrderItemStatus) => void;
}) {
  const Icon = TYPE_ICON[order.orderType] ?? Utensils;
  const shortId = order.id.slice(-6).toUpperCase();
  const ref =
    order.orderType === "dine-in" && order.tableNumber
      ? `Meja ${order.tableNumber}`
      : order.orderType === "delivery" && order.deliveryProvider
        ? `${order.deliveryProvider}${order.customerName ? ` · ${order.customerName}` : ""}`
        : (order.customerName ?? "Takeaway");

  const aggregate = useMemo(() => {
    const totals = { pending: 0, ongoing: 0, serve: 0, done: 0 };
    for (const it of items) totals[it.status]++;
    return totals;
  }, [items]);

  const total = items.length;
  const allServed = aggregate.serve === total && total > 0;

  return (
    <Card
      className={cn(
        "flex flex-col",
        allServed && "border-emerald-300 shadow-[0_0_0_1px_rgb(167,243,208)]"
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold tabular",
              allServed ? "bg-emerald-100 text-emerald-800" : "bg-primary/10 text-primary"
            )}
          >
            #{seq}
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
              <Icon className="h-3.5 w-3.5" />
              {ref}
            </p>
            <p className="text-[11px] text-muted-foreground tabular" suppressHydrationWarning>
              #{shortId} · {formatTime(order.createdAt)} · {formatDuration(order.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <Badge variant={allServed ? "default" : "outline"} className="text-[10px]">
            {items.filter((it) => it.status === "serve").length}/{total} serve
          </Badge>
          {order.isOpenBill && (
            <Badge variant="warning" className="text-[10px]">
              OPEN BILL
            </Badge>
          )}
        </div>
      </div>

      <CardContent className="flex-1 p-2">
        <ul className="divide-y">
          {items.map((it) => (
            <ItemRow
              key={it.id}
              orderId={order.id}
              item={it}
              busy={busyId === it.id}
              canMarkDone={canMarkDone}
              onAdvance={onAdvance}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ItemRow({
  orderId,
  item,
  busy,
  canMarkDone,
  onAdvance,
}: {
  orderId: string;
  item: OrderItem;
  busy: boolean;
  canMarkDone: boolean;
  onAdvance: (orderId: string, item: OrderItem, to: OrderItemStatus) => void;
}) {
  const station = MOCK_STATIONS.find((s) => s.id === item.stationId)?.name ?? "—";
  const to = nextStatus(item.status);
  const meta = STATUS_META[item.status];
  const StatusIcon = meta.icon;
  const doneDisabled = to === "done" && !canMarkDone;

  return (
    <li className="flex items-center gap-2 py-2">
      <div
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px]",
          meta.chip
        )}
        title={meta.label}
      >
        <StatusIcon className="h-3 w-3" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {item.qty}× {item.productName}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {station} · <span className={cn("font-medium", meta.chip.split(" ")[1])}>{meta.label}</span>
          {item.note && <span className="italic"> · &ldquo;{item.note}&rdquo;</span>}
        </p>
      </div>
      {to && (
        <Button
          size="sm"
          variant={to === "done" ? "default" : "secondary"}
          disabled={busy || doneDisabled}
          onClick={() => onAdvance(orderId, item, to)}
          className="shrink-0"
        >
          {to === "done" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          {busy
            ? "…"
            : to === "done"
              ? canMarkDone
                ? "Done"
                : "Kasir"
              : STATUS_META[to].label}
        </Button>
      )}
    </li>
  );
}

function Chip({
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
