/**
 * One-shot migration helper: jalankan CREATE TABLE IF NOT EXISTS untuk
 * tabel-tabel baru yang kita tambah ke schema TANPA harus pakai
 * `drizzle-kit push` (yang sering crash di FK constraint).
 *
 * Aman dipanggil berulang — semua statement pakai `IF NOT EXISTS`.
 *
 * Run:
 *   dotenv -e .env.production -- tsx scripts/migrate-prod.ts
 *
 * Ketika nambah tabel baru di `lib/db/schema.ts`, tambahkan `CREATE TABLE
 * IF NOT EXISTS` yang setara di sini supaya prod ke-update tanpa drama
 * migration.
 */

import { createClient } from "@libsql/client";

function clean(v: string | undefined): string {
  if (!v) return "";
  return v.trim().replace(/^["']|["']$/g, "").trim();
}

const PROD_URL = clean(process.env.DATABASE_URL);
const PROD_TOKEN = clean(process.env.DATABASE_AUTH_TOKEN);

if (!PROD_URL || !PROD_URL.startsWith("libsql://")) {
  console.error("✗ DATABASE_URL harus libsql://… di .env.production");
  process.exit(1);
}
if (!PROD_TOKEN) {
  console.error("✗ DATABASE_AUTH_TOKEN kosong");
  process.exit(1);
}

const client = createClient({ url: PROD_URL, authToken: PROD_TOKEN });

interface Migration {
  name: string;
  sql: string;
}

const migrations: Migration[] = [
  {
    name: "system_meta",
    sql: `
      CREATE TABLE IF NOT EXISTS "system_meta" (
        "key" text PRIMARY KEY NOT NULL,
        "value" text NOT NULL,
        "updated_at" integer NOT NULL DEFAULT (unixepoch())
      )
    `,
  },
  {
    name: "outlet",
    sql: `
      CREATE TABLE IF NOT EXISTS "outlet" (
        "id" text PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "brand_name" text,
        "brand_subtitle" text,
        "address" text,
        "city" text,
        "phone" text,
        "opening_hours" text,
        "receipt_footer" text,
        "tax_id" text,
        "active" integer NOT NULL DEFAULT 1,
        "synced_at" integer NOT NULL DEFAULT (unixepoch())
      )
    `,
  },
  {
    name: "sync_outbox",
    sql: `
      CREATE TABLE IF NOT EXISTS "sync_outbox" (
        "id" text PRIMARY KEY NOT NULL,
        "kind" text NOT NULL,
        "ref_id" text NOT NULL,
        "payload" text NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "last_error" text,
        "last_tried_at" integer,
        "created_at" integer NOT NULL DEFAULT (unixepoch())
      )
    `,
  },
];

/**
 * Tambahin kolom kalau belum ada (idempotent ALTER TABLE). SQLite tidak
 * support `ADD COLUMN IF NOT EXISTS` — kita inspect PRAGMA table_info dulu.
 */
async function addColumnIfMissing(
  table: string,
  column: string,
  ddl: string,
): Promise<"added" | "exists"> {
  const info = await client.execute(`PRAGMA table_info(${table})`);
  const has = info.rows.some((r) => (r as Record<string, unknown>).name === column);
  if (has) return "exists";
  await client.execute(`ALTER TABLE "${table}" ADD COLUMN ${ddl}`);
  return "added";
}

async function main() {
  console.log("→ Connecting to:", PROD_URL.slice(0, 30) + "…\n");

  for (const m of migrations) {
    process.stdout.write(`  · ${m.name}: `);
    try {
      await client.execute(m.sql);
      // Verify
      const exists = await client.execute({
        sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        args: [m.name],
      });
      console.log(exists.rows.length > 0 ? "✓ ready" : "✗ verify failed");
    } catch (err) {
      console.log("✗", err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }

  // Outlet receipt customization columns (untuk DB outlet yang sudah lama
  // exist — tabel sudah ada, kolom belum).
  const outletReceiptColumns: Array<[string, string]> = [
    ["brand_subtitle", `"brand_subtitle" text`],
    ["tax_id", `"tax_id" text`],
  ];
  for (const [col, ddl] of outletReceiptColumns) {
    process.stdout.write(`  · outlet.${col}: `);
    try {
      const r = await addColumnIfMissing("outlet", col, ddl);
      console.log(r === "added" ? "✓ added" : "✓ exists");
    } catch (err) {
      console.log("✗", err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }

  console.log("\n✓ Semua migration selesai.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n✗ Gagal:", err);
  process.exit(1);
});
