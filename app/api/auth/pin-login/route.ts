import { z } from "zod";
import { db, schema } from "@/lib/db";
import { auth } from "@/lib/auth/server";
import { ApiError, handle, err } from "@/lib/api-server/response";

const bodySchema = z.object({
  pin: z.string().min(4).max(8),
});

export async function POST(req: Request) {
  return handle(async () => {
    const { pin } = bodySchema.parse(await req.json());
    const cashiers = await db.select().from(schema.users);
    for (const c of cashiers) {
      if (!c.username) continue;
      try {
        const res = await auth.api.signInUsername({
          body: { username: c.username, password: pin },
          asResponse: true,
        });
        if (res.ok) return res;
      } catch {
        // continue
      }
    }
    throw new ApiError(401, "PIN tidak valid");
  }).catch((e) => {
    if (e instanceof ApiError) return err(e.status, e.message);
    throw e;
  });
}
