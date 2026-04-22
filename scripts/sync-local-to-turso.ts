/**
 * One-shot: wipe Turso → copy semua isi pos.db lokal ke Turso.
 *
 * Kapan dipakai: saat migrasi awal dari mode file lokal ke Turso,
 * dan kamu mau bawa SEMUA data (termasuk shift/order test) ke Turso
 * tanpa mismatch foreign key.
 *
 * Setelah ini sukses:
 *   - Turso = source of truth (ID user/shift/order konsisten).
 *   - Arahkan .env.local ke Turso juga agar dev writes langsung ke Turso.
 *
 * Run:
 *   npm run db:sync:local-to-prod
 */

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../lib/db/schema";

const LOCAL_URL = "file:pos.db";

/** Bersihkan nilai env: buang whitespace, CR/LF, dan quote pembungkus. */
function clean(v: string | undefined): string {
  if (!v) return "";
  return v.trim().replace(/^["']|["']$/g, "").trim();
}

const PROD_URL = clean(process.env.DATABASE_URL);
const PROD_TOKEN = clean(process.env.DATABASE_AUTH_TOKEN);

// Diagnostic — jangan log token, cuma panjang & prefix URL
console.log("[diag] DATABASE_URL prefix:", PROD_URL.slice(0, 20) || "(empty)");
console.log("[diag] DATABASE_AUTH_TOKEN length:", PROD_TOKEN.length);

if (!PROD_URL || !PROD_URL.startsWith("libsql://")) {
  console.error("\n✗ DATABASE_URL harus `libsql://…turso.io`.");
  console.error("  Yang terbaca sekarang:", JSON.stringify(PROD_URL));
  console.error("  Pastikan .env.production ada di root project dan isinya:");
  console.error("    DATABASE_URL=libsql://<db>-<org>.turso.io");
  console.error("    DATABASE_AUTH_TOKEN=<token>");
  console.error("  (TANPA quote, TANPA spasi setelah =)\n");
  process.exit(1);
}
if (!PROD_TOKEN) {
  console.error("✗ DATABASE_AUTH_TOKEN tidak di-set (atau kosong setelah di-trim).");
  process.exit(1);
}

const local = drizzle(createClient({ url: LOCAL_URL }), { schema });
const prod = drizzle(createClient({ url: PROD_URL, authToken: PROD_TOKEN }), { schema });

/** Urutan WIPE: reverse FK (child dulu). */
const WIPE_ORDER = [
  { name: "orderPayments", table: schema.orderPayments },
  { name: "orderItems", table: schema.orderItems },
  { name: "orders", table: schema.orders },
  { name: "shifts", table: schema.shifts },
  { name: "tables", table: schema.tables },
  { name: "products", table: schema.products },
  { name: "categories", table: schema.categories },
  { name: "stations", table: schema.stations },
  { name: "sessions", table: schema.sessions },
  { name: "accounts", table: schema.accounts },
  { name: "verifications", table: schema.verifications },
  { name: "users", table: schema.users },
] as const;

/** Urutan COPY: FK-respecting (parent dulu). */
const COPY_ORDER = [
  { name: "users", table: schema.users },
  { name: "accounts", table: schema.accounts },
  { name: "sessions", table: schema.sessions },
  { name: "verifications", table: schema.verifications },
  { name: "stations", table: schema.stations },
  { name: "categories", table: schema.categories },
  { name: "products", table: schema.products },
  { name: "tables", table: schema.tables },
  { name: "shifts", table: schema.shifts },
  { name: "orders", table: schema.orders },
  { name: "orderItems", table: schema.orderItems },
  { name: "orderPayments", table: schema.orderPayments },
] as const;

async function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("\n⚠️  DESTRUCTIVE — ini akan MENGHAPUS semua data di Turso:");
  console.log("   " + PROD_URL);
  console.log("   lalu meng-copy isi `pos.db` lokal ke sana.\n");
  console.log("   Tekan Ctrl+C dalam 5 detik untuk batal…");
  await wait(5000);

  console.log("\n→ Wiping Turso (reverse FK order)…");
  for (const { name, table } of WIPE_ORDER) {
    await prod.delete(table);
    console.log(`  · cleared ${name}`);
  }

  console.log("\n→ Copying from local → Turso…");
  for (const { name, table } of COPY_ORDER) {
    const rows = await local.select().from(table);
    if (!rows.length) {
      console.log(`  · ${name}: (empty, skip)`);
      continue;
    }
    // libsql batch: 500 rows per insert aman
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await prod.insert(table).values(rows.slice(i, i + CHUNK) as any);
    }
    console.log(`  ✓ ${name}: ${rows.length} rows`);
  }

  console.log("\n✓ Done. Turso sekarang identik dengan pos.db lokal.");
  console.log("  Langkah berikutnya: arahkan .env.local ke Turso juga biar dev writes masuk ke Turso.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n✗ Gagal:");
  if (err instanceof Error) {
    console.error("  message:", err.message);
    // libsql errors sering nyimpen info di .cause
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause) console.error("  cause:  ", cause);
    if (err.stack) console.error("  stack:\n", err.stack.split("\n").slice(0, 5).join("\n"));
  } else {
    console.error("  raw:", err);
  }
  process.exit(1);
});
