/**
 * Test: cek apakah Better Auth POS bisa verify PIN hash dari backoffice.
 *
 * Run: dotenv -e .env.production -- tsx scripts/verify-pin.ts <pin>
 */

import { auth } from "../lib/auth/server";
import { createClient } from "@libsql/client";

function clean(v: string | undefined): string {
  if (!v) return "";
  return v.trim().replace(/^["']|["']$/g, "").trim();
}

const PROD_URL = clean(process.env.DATABASE_URL);
const PROD_TOKEN = clean(process.env.DATABASE_AUTH_TOKEN);

const client = createClient({ url: PROD_URL, authToken: PROD_TOKEN });

async function main() {
  const pin = process.argv[2] ?? "555555";
  console.log(`\nTesting PIN: ${pin}\n`);

  const accounts = await client.execute(
    "SELECT user_id, password FROM account WHERE provider_id = 'credential'",
  );

  const ctx = await auth.$context;

  for (const r of accounts.rows) {
    const userId = r.user_id as string;
    const hash = r.password as string;
    if (!hash) {
      console.log(`  · ${userId}: no hash`);
      continue;
    }
    try {
      const ok = await ctx.password.verify({ hash, password: pin });
      console.log(`  · ${userId}: ${ok ? "✓ MATCH" : "✗ no match"} (hash: ${hash.slice(0, 30)}…)`);
    } catch (e) {
      console.log(`  · ${userId}: error verifying:`, e instanceof Error ? e.message : e);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("\n✗ Gagal:", err);
  process.exit(1);
});
