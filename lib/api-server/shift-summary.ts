import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError } from "./response";

export type PaymentMethod = "cash" | "qris" | "card" | "transfer";

export async function computeShiftSummary(shiftId: string) {
  const shift = await db.query.shifts.findFirst({
    where: eq(schema.shifts.id, shiftId),
  });
  if (!shift) throw new ApiError(404, "Shift tidak ditemukan");

  const paidOrders = await db.query.orders.findMany({
    where: eq(schema.orders.shiftId, shiftId),
    with: { payment: true },
  });
  const breakdown: Record<PaymentMethod, number> = {
    cash: 0,
    qris: 0,
    card: 0,
    transfer: 0,
  };
  let totalRevenue = 0;
  let orderCount = 0;
  for (const o of paidOrders) {
    if (o.status !== "paid" || !o.payment) continue;
    breakdown[o.payment.method as PaymentMethod] += o.total;
    totalRevenue += o.total;
    orderCount += 1;
  }
  const cashSales = breakdown.cash;
  const expectedCash = shift.openingCash + cashSales;
  const actualCash = shift.actualCash ?? 0;
  return {
    shift,
    totalRevenue,
    orderCount,
    breakdown,
    cashSales,
    expectedCash,
    actualCash,
    cashDifference: actualCash - expectedCash,
  };
}
