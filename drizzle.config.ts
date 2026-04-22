import type { Config } from "drizzle-kit";

/**
 * drizzle-kit config — auto-pilih dialect berdasarkan DATABASE_URL:
 *   - `libsql://...`  -> Turso (dialect: "turso", butuh DATABASE_AUTH_TOKEN)
 *   - apa pun lainnya -> SQLite lokal (dialect: "sqlite", url diteruskan apa adanya)
 *
 * Pakai env yang sama dengan runtime supaya `db:push`, `db:studio`, dsb bekerja
 * ke target yang konsisten dengan aplikasi.
 */

const url = process.env.DATABASE_URL ?? "file:pos.db";
const isTurso = url.startsWith("libsql://") || url.startsWith("https://");

export default (
  isTurso
    ? {
        schema: "./lib/db/schema.ts",
        out: "./drizzle",
        dialect: "turso",
        dbCredentials: {
          url,
          authToken: process.env.DATABASE_AUTH_TOKEN,
        },
      }
    : {
        schema: "./lib/db/schema.ts",
        out: "./drizzle",
        dialect: "sqlite",
        dbCredentials: { url },
      }
) satisfies Config;
