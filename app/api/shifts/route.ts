import { isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { ApiError, handle, ok } from "@/lib/api-server/response";
import { requireSession } from "@/lib/api-server/session";
import { newId } from "@/lib/api-server/ids";

const openSchema = z.object({
  openingCash: z.number().int().nonnegative(),
  note: z.string().optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireSession();
    const body = openSchema.parse(await req.json());

    const active = await db.query.shifts.findFirst({
      where: isNull(schema.shifts.closedAt),
    });
    if (active) throw new ApiError(409, "Masih ada shift aktif. Tutup dulu sebelum buka shift baru.");
    if (body.openingCash < 0) throw new ApiError(400, "Kas awal tidak boleh negatif");

    const shift = {
      id: newId("shift"),
      cashierId: user.id,
      cashierName: user.name,
      openingCash: body.openingCash,
      note: body.note ?? null,
      openedAt: new Date().toISOString(),
      actualCash: null,
      closedAt: null,
    };
    await db.insert(schema.shifts).values(shift);
    return ok(shift, { status: 201 });
  });
}
