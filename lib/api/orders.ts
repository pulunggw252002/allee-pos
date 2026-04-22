import type {
  Cashier,
  CreateOrderInput,
  Order,
  OrderItem,
  OrderItemStatus,
  PayOrderInput,
} from "@/lib/types";
import { apiFetch } from "./client";

export async function listOrders(): Promise<Order[]> {
  return apiFetch<Order[]>("/api/orders");
}

export async function getOrder(id: string): Promise<Order | null> {
  try {
    return await apiFetch<Order>(`/api/orders/${id}`);
  } catch {
    return null;
  }
}

export async function listOrdersByShift(shiftId: string): Promise<Order[]> {
  return apiFetch<Order[]>("/api/orders", { query: { shiftId } });
}

export async function listOpenOrders(): Promise<Order[]> {
  return apiFetch<Order[]>("/api/orders", { query: { open: 1 } });
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  return apiFetch<Order>("/api/orders", {
    method: "POST",
    json: {
      shiftId: input.shiftId,
      orderType: input.orderType,
      tableNumber: input.tableNumber,
      customerName: input.customerName,
      deliveryProvider: input.deliveryProvider,
      isOpenBill: input.isOpenBill,
      items: input.items,
      discount: input.discount,
      note: input.note,
    },
  });
}

export async function payOrder(input: PayOrderInput): Promise<Order> {
  return apiFetch<Order>(`/api/orders/${input.orderId}/pay`, {
    method: "POST",
    json: { method: input.method, tendered: input.tendered },
  });
}

const STATUS_ORDER: OrderItemStatus[] = ["pending", "ongoing", "serve", "done"];

export function nextStatus(current: OrderItemStatus): OrderItemStatus | null {
  const i = STATUS_ORDER.indexOf(current);
  if (i < 0 || i >= STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[i + 1];
}

export async function updateItemStatus(params: {
  orderId: string;
  itemId: string;
  next: OrderItemStatus;
  role: Cashier["role"];
}): Promise<Order> {
  return apiFetch<Order>(
    `/api/orders/${params.orderId}/items/${params.itemId}/status`,
    { method: "PATCH", json: { next: params.next } }
  );
}

export async function listActiveStationItems(): Promise<
  Array<{ order: Order; item: OrderItem }>
> {
  return apiFetch<Array<{ order: Order; item: OrderItem }>>("/api/station-items");
}

export async function voidOrder(id: string): Promise<void> {
  await apiFetch<{ ok: true }>(`/api/orders/${id}`, { method: "DELETE" });
}
