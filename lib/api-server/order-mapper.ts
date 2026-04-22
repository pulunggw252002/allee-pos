import type { InferSelectModel } from "drizzle-orm";
import { schema } from "@/lib/db";

type OrderRow = InferSelectModel<typeof schema.orders>;
type ItemRow = InferSelectModel<typeof schema.orderItems>;
type PaymentRow = InferSelectModel<typeof schema.orderPayments>;

export function mapOrder(
  order: OrderRow,
  items: ItemRow[],
  payment: PaymentRow | null | undefined
) {
  return {
    id: order.id,
    shiftId: order.shiftId,
    cashierId: order.cashierId,
    cashierName: order.cashierName,
    orderType: order.orderType,
    tableNumber: order.tableNumber ?? undefined,
    customerName: order.customerName ?? undefined,
    deliveryProvider: order.deliveryProvider ?? undefined,
    isOpenBill: Boolean(order.isOpenBill),
    items: items.map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.productName,
      unitPrice: it.unitPrice,
      qty: it.qty,
      note: it.note ?? undefined,
      stationId: it.stationId,
      status: it.status,
    })),
    subtotal: order.subtotal,
    tax: order.tax,
    service: order.service,
    discount: order.discount,
    total: order.total,
    status: order.status,
    payment: payment
      ? {
          method: payment.method,
          amount: payment.amount,
          tendered: payment.tendered ?? undefined,
          change: payment.change ?? undefined,
          paidAt: payment.paidAt,
        }
      : undefined,
    createdAt: order.createdAt,
    paidAt: order.paidAt ?? undefined,
    note: order.note ?? undefined,
  };
}

export function mapFullOrder(
  row: OrderRow & { items?: ItemRow[]; payment?: PaymentRow | null }
) {
  return mapOrder(row, row.items ?? [], row.payment ?? null);
}
