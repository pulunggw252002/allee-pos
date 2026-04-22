import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";

/**
 * Global setup — di-run Playwright sekali sebelum semua test.
 *
 * Step:
 *   1. Hapus file test DB (dan WAL/SHM sibling) supaya test start dari schema baru.
 *   2. Jalankan `drizzle-kit push` → bikin schema dari scratch.
 *   3. Jalankan `tsx lib/db/seed.ts` → insert users (PIN login), catalog, tables.
 *
 * Semua sub-process dijalankan dengan DATABASE_URL=file:test-pos.db
 * supaya seed.ts, drizzle.config.ts, dan auth/server.ts konsisten nunjuk
 * ke DB yang sama dengan yang dipakai `next dev` (via webServer env).
 */

const TEST_DB = "test-pos.db";
const ROOT = process.cwd();

function rmIfExists(file: string) {
  const full = path.join(ROOT, file);
  if (existsSync(full)) {
    unlinkSync(full);
    console.log(`  · removed ${file}`);
  }
}

function runCmd(label: string, cmd: string) {
  console.log(`\n→ ${label}`);
  execSync(cmd, {
    stdio: "inherit",
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL: `file:${TEST_DB}`,
      DATABASE_AUTH_TOKEN: "",
      BETTER_AUTH_SECRET: "test-e2e-allee-pos-32char-minimum-secret-xyz",
      BETTER_AUTH_URL: "http://localhost:3100",
    },
  });
}

async function globalSetup() {
  console.log("\n[e2e] Resetting test database…");
  rmIfExists(TEST_DB);
  rmIfExists(`${TEST_DB}-shm`);
  rmIfExists(`${TEST_DB}-wal`);

  runCmd("drizzle push (test DB)", "npx drizzle-kit push");
  runCmd("seed (test DB)", "npx tsx lib/db/seed.ts");

  console.log("\n[e2e] Test database ready.\n");
}

export default globalSetup;
