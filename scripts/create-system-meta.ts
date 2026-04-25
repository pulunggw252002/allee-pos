/**
 * One-shot: buat tabel `system_meta` di Turso prod kalau belum ada.
 *
 * Latar belakang: drizzle-kit `push --force` gagal karena FK constraint
 * pada tabel lain — padahal kita cuma butuh nambah 1 tabel baru.
 * Script ini cuma menjalankan CREATE TABLE IF NOT EXISTS, aman dipanggil
 * berulang.
 *
 * Run:
 *   dotenv -e .env.production -- tsx scripts/create-system-meta.ts
 */

import { createClient } from "@libsql/client";

function clean(v: string | undefined): string {
  if (!v) return "";
  return v.trim().replace(/^["']|["']$/g, "").trim();
}

const PROD_URL = clean(process.env.DATABASE_URL);
const PROD_TOKEN = clean(process.env.DATABASE_AUTH_TOKEN);

if (!PROD_URL || !PROD_URL.startsWith("libsql://")) {
  console.error("✗ DATABASE_URL harus libsql://…");
  process.exit(1);
}
if (!PROD_TOKEN) {
  console.error("✗ DATABASE_AUTH_TOKEN kosong");
  process.exit(1);
}

const client = createClient({ url: PROD_URL, authToken: PROD_TOKEN });

async function main() {
  console.log("→ Connecting to:", PROD_URL.slice(0, 30) + "…");

  // Cek apakah sudah ada
  const existsRes = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    args: ["system_meta"],
  });
  if (existsRes.rows.length > 0) {
    console.log("✓ Tabel `system_meta` sudah ada — skip create.");
  } else {
    console.log("→ Membuat tabel `system_meta`…");
    await client.execute(`
      CREATE TABLE "system_meta" (
        "key" text PRIMARY KEY NOT NULL,
        "value" text NOT NULL,
        "updated_at" integer NOT NULL DEFAULT (unixepoch())
      )
    `);
    console.log("✓ Tabel `system_meta` berhasil dibuat.");
  }

  // Show current rows
  const rows = await client.execute("SELECT key, value, updated_at FROM system_meta");
  console.log(`\nIsi tabel saat ini (${rows.rows.length} row):`);
  for (const r of rows.rows) {
    console.log("  ·", r.key, "=", r.value, "(updated_at:", r.updated_at + ")");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("\n✗ Gagal:");
  if (err instanceof Error) {
    console.error("  message:", err.message);
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause) console.error("  cause:  ", cause);
  } else {
    console.error("  raw:", err);
  }
  process.exit(1);
});
