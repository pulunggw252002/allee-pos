/**
 * Quick inspector: print users + PIN hash status di Turso prod.
 *
 * Run: dotenv -e .env.production -- tsx scripts/inspect-users.ts
 */

import { createClient } from "@libsql/client";

function clean(v: string | undefined): string {
  if (!v) return "";
  return v.trim().replace(/^["']|["']$/g, "").trim();
}

const PROD_URL = clean(process.env.DATABASE_URL);
const PROD_TOKEN = clean(process.env.DATABASE_AUTH_TOKEN);

const client = createClient({ url: PROD_URL, authToken: PROD_TOKEN });

async function main() {
  const users = await client.execute(
    "SELECT * FROM user ORDER BY name"
  );
  console.log("\n=== USERS (n=" + users.rows.length + ") ===");
  for (const r of users.rows) {
    console.log(JSON.stringify(r, null, 2));
  }

  const accounts = await client.execute(
    "SELECT user_id, provider_id, account_id, password IS NOT NULL AS has_password FROM account ORDER BY user_id"
  );
  console.log("\n=== ACCOUNTS (n=" + accounts.rows.length + ") ===");
  for (const r of accounts.rows) {
    console.log("  · user_id=" + r.user_id, "| provider=" + r.provider_id, "| account_id=" + r.account_id, "| has_password=" + r.has_password);
  }

  const meta = await client.execute("SELECT key, value, updated_at FROM system_meta");
  console.log("\n=== SYSTEM_META (n=" + meta.rows.length + ") ===");
  for (const r of meta.rows) {
    console.log("  ·", r.key, "=", r.value, "| updated_at=" + r.updated_at);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("\n✗ Gagal:", err);
  process.exit(1);
});
