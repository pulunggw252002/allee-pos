import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { ApiError, handle, ok } from "@/lib/api-server/response";
import { requireSession } from "@/lib/api-server/session";
import { newId } from "@/lib/api-server/ids";
import { getTaxRates } from "@/lib/api-server/runtime-config";
import { mapFullOrder } from "@/lib/api-server/order-mapper";

const createSchema = z.object({
  shiftId: z.string().min(1),
  orderType: z.enum(["dine-in", "takeaway", "delivery"]),
  tableNumber: z.string().optional(),
  customerName: z.string().optional(),
  deliveryProvider: z.string().optional(),
  isOpenBill: z.boolean().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        qty: z.number().int().positive(),
        note: z.string().optional(),
      })
    )
    .min(1, "Order harus punya minimal 1 item."),
  discount: z.number().int().nonnegative().optional(),
  note: z.string().optional(),
});

export async function GET(req: Request) {
  return handle(async () => {
    await requireSession();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const shiftId = url.searchParams.get("shiftId");
    const open = url.searchParams.get("open");

    const conditions: SQL[] = [];
    if (status) conditions.push(eq(schema.orders.status, status as "draft" | "open" | "paid" | "void"));
    if (shiftId) conditions.push(eq(schema.orders.shiftId, shiftId));
    if (open === "1") conditions.push(eq(schema.orders.status, "open"));

    const rows = await db.query.orders.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      with: { items: true, payment: true },
      orderBy: [desc(schema.orders.createdAt)],
    });
    return ok(rows.map(mapFullOrder));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireSession();
    const body = createSchema.parse(await req.json());

    // Shift harus aktif
    const shift = await db.query.shifts.findFirst({ where: eq(schema.shifts.id, body.shiftId) });
    if (!shift) throw new ApiError(400, "Shift tidak ditemukan");
    if (shift.closedAt) throw new ApiError(400, "Shift sudah ditutup");

    const tableNumber = body.tableNumber?.trim() || undefined;
    const customerName = body.customerName?.trim() || undefined;
    const deliveryProvider = body.deliveryProvider?.trim() || undefined;
    const isOpenBill = Boolean(body.isOpenBill);

    if (body.orderType === "dine-in" && !tableNumber) {
      throw new ApiError(400, "Dine-in wajib isi nomor meja.");
    }
    if (body.orderType === "delivery" && !deliveryProvider) {
      throw new ApiError(400, "Delivery wajib pilih layanan (Grab, Gojek, dll).");
    }
    if (isOpenBill && !customerName) {
      throw new ApiError(400, "Open Bill wajib isi nama pelanggan.");
    }

    // Ambil produk, hitung harga
    const productIds = body.items.map((it) => it.productId);
    const products = await db.query.products.findMany({
      where: inArray(schema.products.id, productIds),
    });
    const prodMap = new Map(products.map((p) => [p.id, p]));

    const items = body.items.map((it) => {
      const p = prodMap.get(it.productId);
      if (!p) throw new ApiError(400, `Produk ${it.productId} tidak ditemukan`);
      if (!p.active) throw new ApiError(400, `Produk ${p.name} sudah tidak aktif`);
      return {
        id: newId("oi"),
        productId: p.id,
        productName: p.name,
        unitPrice: p.price,
        qty: it.qty,
        note: it.note ?? null,
        stationId: p.stationId,
        status: "pending" as const,
      };
    });

    const subtotal = items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
    const discount = body.discount ?? 0;
    const afterDiscount = Math.max(0, subtotal - discount);
    // Tax & service di-resolve dinamis dari config yang di-sync dari backoffice
    // — TIDAK hardcode di server. Kalau backoffice belum di-sync, helper return
    // default supaya order calc tetap jalan (graceful degrade).
    const { taxRate, serviceRate } = await getTaxRates();
    const tax = Math.round(afterDiscount * taxRate);
    const service = Math.round(afterDiscount * serviceRate);
    const total = afterDiscount + tax + service;

    const orderId = newId("ord");
    const createdAt = new Date().toISOString();

    const created = await db.transaction(async (tx) => {
      await tx.insert(schema.orders).values({
        id: orderId,
        shiftId: body.shiftId,
        cashierId: user.id,
        cashierName: user.name,
        orderType: body.orderType,
        tableNumber: tableNumber ?? null,
        customerName: customerName ?? null,
        deliveryProvider: deliveryProvider ?? null,
        isOpenBill,
        subtotal,
        discount,
        tax,
        service,
        total,
        status: "open",
        note: body.note ?? null,
        createdAt,
        paidAt: null,
      });

      await tx.insert(schema.orderItems).values(
        items.map((it) => ({ ...it, orderId }))
      );

      if (body.orderType === "dine-in" && tableNumber) {
        await tx
          .update(schema.tables)
          .set({ status: "occupied", orderId })
          .where(eq(schema.tables.number, tableNumber));
      }

      return tx.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
        with: { items: true, payment: true },
      });
    });

    if (!created) throw new ApiError(500, "Gagal membuat order");
    return ok(mapFullOrder(created), { status: 201 });
  });
}
