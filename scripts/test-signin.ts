/**
 * Test: panggil auth.api.signInUsername dari Node untuk Dewi (PIN 555555).
 * Kita expect res.ok = true.
 *
 * Run: dotenv -e .env.production -- tsx scripts/test-signin.ts
 */

import { auth } from "../lib/auth/server";

async function main() {
  const usernames = ["dewi-barista", "andi", "rudi-kasir", "c1", "c2", "c3"];
  for (const u of usernames) {
    console.log(`\n--- signInUsername(${u}, 555555) ---`);
    try {
      const res = await auth.api.signInUsername({
        body: { username: u, password: "555555" },
        asResponse: true,
      });
      console.log("status:", res.status, "ok:", res.ok);
      if (!res.ok) {
        const body = await res.text();
        console.log("body:", body.slice(0, 300));
      }
    } catch (e) {
      console.log("threw:", e instanceof Error ? e.message : e);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
