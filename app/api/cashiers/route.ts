import { db, schema } from "@/lib/db";
import { handle, ok } from "@/lib/api-server/response";

export async function GET() {
  return handle(async () => {
    const rows = await db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        username: schema.users.username,
        role: schema.users.role,
      })
      .from(schema.users);
    return ok(rows);
  });
}
