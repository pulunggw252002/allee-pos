import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handle, ok } from "@/lib/api-server/response";
import { ensureFreshSync } from "@/lib/api-server/backoffice/sync";

/**
 * GET /api/cashiers — daftar staff yang BISA login PIN ke POS ini.
 *
 * Filter via inner-join `account` provider=credential — kalau credential
 * row sudah di-revoke (mis. user di-deactivate di backoffice atau resigned
 * dan sync sudah cleanup), name-nya tidak muncul lagi di picker. Tanpa
 * filter ini, kasir lama tetap bocor di dropdown meski PIN-nya tidak
 * valid lagi — bingung-in user.
 */
export async function GET() {
  return handle(async () => {
    await ensureFreshSync({ awaitFirstRun: true });
    const rows = await db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        username: schema.users.username,
        role: schema.users.role,
      })
      .from(schema.users)
      .innerJoin(
        schema.accounts,
        and(
          eq(schema.accounts.userId, schema.users.id),
          eq(schema.accounts.providerId, "credential"),
        ),
      );
    return ok(rows);
  });
}
