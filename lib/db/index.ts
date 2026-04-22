import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

/**
 * Database client — satu driver (libSQL) untuk dev (file lokal) dan prod (Turso).
 *
 * ENV:
 *   DATABASE_URL          - "file:pos.db" (dev) atau "libsql://<db>-<org>.turso.io" (prod)
 *   DATABASE_AUTH_TOKEN   - hanya dibutuhkan saat DATABASE_URL adalah libsql:// remote
 *
 * Driver pakai `@libsql/client`, yang:
 *   - Mendukung file lokal (`file:...`) via SQLite native di balik layar.
 *   - Mendukung remote Turso via HTTP/WebSocket.
 *   - Semua operasi **async** (berbeda dengan better-sqlite3 yang sync).
 */

const url = process.env.DATABASE_URL ?? "file:pos.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;

const client: Client = createClient({ url, authToken });

// PRAGMA hanya berlaku untuk file lokal (libSQL mengabaikan PRAGMA untuk remote).
if (url.startsWith("file:")) {
  // Fire-and-forget; libSQL tidak expose sync API, jadi pragma dijalankan pada koneksi pertama.
  void client.execute("PRAGMA journal_mode = WAL");
  void client.execute("PRAGMA foreign_keys = ON");
}

export const db = drizzle(client, { schema });
export { schema };
