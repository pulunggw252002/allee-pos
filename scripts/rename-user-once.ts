/**
 * One-shot rename on the POS local DB to mirror the backoffice rename of
 * "POS Renon Service" → "POS Renon Servicer".
 *
 * Normally the POS would pick this up on the next backoffice → POS sync
 * (which derives `email` + `username` deterministically from the name).
 * This script forces the change immediately so we don't have to wait for
 * the next sync window or trigger one manually from the UI.
 *
 * Run once: `npx tsx scripts/rename-user-once.ts`
 * Safe to re-run: no-op if no row matches.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@libsql/client";

const USER_ID = "usr_moe9v3xx3m4nex9t";
const NEW_NAME = "POS Renon Servicer";
const NEW_EMAIL = "pos-renon-servicer@allee.local";
const NEW_USERNAME = "pos_renon_servicer";

async function main() {
  const url = process.env.DATABASE_URL;
  const authToken = process.env.DATABASE_AUTH_TOKEN;
  if (!url) throw new Error("DATABASE_URL not set");

  const c = createClient({ url, authToken });

  const before = await c.execute({
    sql: "SELECT id, name, email, username, display_username FROM user WHERE id = ?",
    args: [USER_ID],
  });
  if (before.rows.length === 0) {
    console.log("[pos-rename] no row — skipping.");
    return;
  }
  console.log("[pos-rename] before:", before.rows[0]);

  await c.execute({
    sql: "UPDATE user SET name = ?, email = ?, username = ?, display_username = ?, updated_at = unixepoch() WHERE id = ?",
    args: [NEW_NAME, NEW_EMAIL, NEW_USERNAME, NEW_NAME, USER_ID],
  });

  const after = await c.execute({
    sql: "SELECT id, name, email, username, display_username FROM user WHERE id = ?",
    args: [USER_ID],
  });
  console.log("[pos-rename] after :", after.rows[0]);
  console.log("[pos-rename] ✓ done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[pos-rename] FAILED:", err);
    process.exit(1);
  });
