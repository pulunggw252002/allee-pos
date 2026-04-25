/**
 * Reset POS prod DB — clean slate untuk integration test.
 *
 * Wipes:
 *   - Catalog cache (categories, products, stations) — akan re-sync dari backoffice.
 *   - Outlet cache.
 *   - All transactions (orders, items, payments, shifts).
 *   - sync_outbox.
 *   - system_meta (last_synced_at) — supaya next sync ditandai fresh.
 *
 * Keeps:
 *   - Better Auth users (cashier/supervisor) — POS local accounts; akan di-sync
 *     ulang dari backoffice via /api/internal/pos-pins saat hydrate.
 *
 * Idempotent. Aman di-run berulang.
 *
 * Run:  npx tsx scripts/reset-prod.ts
 */

import { config } from "dotenv";
import { createClient } from "@libsql/client";

// Prod env diset di `.env.production`. `.env.local` pakai DB lokal sqlite —
// bukan target script ini. Load `.env.production` eksplisit supaya selalu
// nge-hit Turso prod.
config({ path: ".env.production" });

function getClient() {
  const url = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL;
  const authToken =
    process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("DATABASE_URL / TURSO_DATABASE_URL belum di-set");
  if (!url.startsWith("libsql://") && !url.startsWith("https://")) {
    throw new Error(
      `[reset] DATABASE_URL bukan Turso (got: ${url}). Aborting biar gak salah hapus DB lokal.`,
    );
  }
  return createClient({ url, authToken });
}

const ORDER = [
  // Transactions (FK-safe: child first)
  "order_payment",
  "order_item",
  "\"order\"", // reserved word, must be quoted
  "shift",
  // Catalog
  "product",
  "category",
  "station",
  "restaurant_table",
  // Outlet cache (akan re-sync)
  "outlet",
  // Sync state
  "sync_outbox",
  "system_meta",
];

async function main() {
  const client = getClient();
  console.log("[reset] Wiping POS DB…");
  for (const t of ORDER) {
    try {
      const r = await client.execute(`DELETE FROM ${t}`);
      console.log(`  ✓ ${t} (${r.rowsAffected} rows)`);
    } catch (e) {
      console.warn(`  ⚠ ${t}: ${(e as Error).message}`);
    }
  }

  // Verifikasi
  const tables = ["product", "category", "outlet", "\"order\"", "shift", "sync_outbox"];
  console.log("[reset] Final state:");
  for (const t of tables) {
    const r = await client.execute(`SELECT COUNT(*) AS c FROM ${t}`);
    console.log(`  ${t.padEnd(20)} = ${r.rows[0]!.c}`);
  }

  // Hitung user (di-keep)
  const u = await client.execute('SELECT COUNT(*) AS c FROM "user"');
  console.log(`  user (kept)          = ${u.rows[0]!.c}`);

  console.log("");
  console.log("[reset] ✓ Clean. POS akan re-sync dari backoffice di hit /api/backoffice/sync berikutnya.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[reset] FAILED:", err);
    process.exit(1);
  });
