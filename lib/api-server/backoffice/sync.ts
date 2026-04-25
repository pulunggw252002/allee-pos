/**
 * Sync data master backoffice → DB lokal POS.
 *
 * Filosofi:
 *  - Backoffice = source of truth untuk catalog (kategori, menu) dan users.
 *  - POS local DB = cache yang isinya hasil sync. Semua route lain
 *    (`/api/products`, `/api/categories`, dst.) tetap baca dari local DB,
 *    sehingga FK relasi (order_item.product_id, dll.) tetap valid dan POS
 *    bisa terus jalan walau backoffice sedang down.
 *  - Sync bisa di-trigger 3 cara:
 *      1. Manual: `POST /api/backoffice/sync` (UI tombol / curl supervisor).
 *      2. Stale-while-revalidate: dipicu otomatis oleh `ensureFreshSync` saat
 *         GET /api/products|categories|cashiers kalau last sync > 5 menit.
 *         Background, **tidak ng-block response** ke kasir.
 *      3. First-run await: kalau belum pernah sync, request pertama nunggu
 *         sync sukses supaya catalog tidak kosong.
 *  - Tidak ada lazy fetch per click (POS read tetap dari DB lokal); latency
 *    backoffice cuma kena saat sync background, kasir tidak kerasa.
 *
 * Konsep yang TIDAK di-sync:
 *  - Stations/KDS routing → POS-only (lihat mappers.ts).
 *  - Tables → POS-only.
 *  - Shifts → POS-only.
 *  - Orders → POS adalah PENULIS, backoffice adalah pembaca. Lihat writes.ts.
 *  - Better Auth tables (sessions, accounts, verification) → POS-only.
 *
 * Soft delete:
 *  - Untuk produk yang hilang dari backoffice (di-archive owner), POS
 *    set `active = false` daripada DELETE. Alasannya: order_item.product_id
 *    masih reference produk lama untuk audit history.
 */

import { eq, inArray, notInArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  fetchCategories,
  fetchMenusForOutlet,
  fetchUsers,
  resolveOutletId,
} from "./reads";
import { backofficeCategoryToCategory, backofficeMenuToProduct } from "./mappers";
import { isBackofficeModeEnabled } from "./config";
import type { BackofficeUser } from "@/lib/types/backoffice";

/** Key untuk menyimpan timestamp last-successful-sync di tabel `system_meta`. */
const META_KEY_LAST_SYNC = "backoffice.last_synced_at";

/**
 * Default freshness window. Setelah lewat ini, helper `ensureFreshSync` akan
 * trigger background revalidate. Boleh di-override per call. 5 menit cukup
 * agresif untuk MVP — owner ganti harga di backoffice, POS pickup max 5 menit.
 */
export const DEFAULT_FRESHNESS_MS = 5 * 60 * 1000;

export interface SyncReport {
  outletId: string;
  categories: { upserted: number };
  products: { upserted: number; deactivated: number };
  users: { upserted: number };
  durationMs: number;
}

/**
 * Pull catalog + users dari backoffice ke local DB. Idempotent — aman dijalankan
 * berulang. Throw kalau BACKOFFICE_MODE off atau backoffice unreachable.
 */
export async function syncFromBackoffice(): Promise<SyncReport> {
  if (!isBackofficeModeEnabled()) {
    throw new Error("BACKOFFICE_MODE belum aktif — set di env dulu");
  }
  const start = Date.now();
  const outletId = await resolveOutletId();

  // --- Categories -----------------------------------------------------------
  const boCategories = await fetchCategories();
  const posCategories = boCategories.map(backofficeCategoryToCategory);

  await db.transaction(async (tx) => {
    for (const c of posCategories) {
      // SQLite UPSERT lewat ON CONFLICT — drizzle bridge.
      await tx
        .insert(schema.categories)
        .values({ id: c.id, name: c.name, order: c.order })
        .onConflictDoUpdate({
          target: schema.categories.id,
          set: { name: c.name, order: c.order },
        });
    }
  });

  // --- Menus → products -----------------------------------------------------
  const boMenus = await fetchMenusForOutlet(outletId);
  // Build lookup category name buat heuristic station (food → st-kitchen).
  const catName = new Map(boCategories.map((c) => [c.id, c.name]));
  const posProducts = boMenus.map((m) =>
    backofficeMenuToProduct(m, { categoryName: catName.get(m.category_id) })
  );

  // Pastikan station yg di-rujuk produk sudah ada (st-bar, st-kitchen).
  // Stations lokal sudah seeded saat install, tapi defensive di sini.
  const stationIds = Array.from(new Set(posProducts.map((p) => p.stationId)));
  if (stationIds.length > 0) {
    const existing = await db.query.stations.findMany({
      where: inArray(schema.stations.id, stationIds),
    });
    const existingIds = new Set(existing.map((s) => s.id));
    const missing = stationIds.filter((id) => !existingIds.has(id));
    if (missing.length > 0) {
      await db.insert(schema.stations).values(
        missing.map((id) => ({
          id,
          name: id === "st-kitchen" ? "Kitchen" : id === "st-bar" ? "Bar" : id,
        }))
      );
    }
  }

  let deactivated = 0;
  await db.transaction(async (tx) => {
    for (const p of posProducts) {
      await tx
        .insert(schema.products)
        .values({
          id: p.id,
          name: p.name,
          price: p.price,
          categoryId: p.categoryId,
          stationId: p.stationId,
          imageEmoji: p.imageEmoji ?? null,
          active: p.active,
          hppCached: p.hppCached,
        })
        .onConflictDoUpdate({
          target: schema.products.id,
          set: {
            name: p.name,
            price: p.price,
            categoryId: p.categoryId,
            stationId: p.stationId,
            imageEmoji: p.imageEmoji ?? null,
            active: p.active,
            hppCached: p.hppCached,
          },
        });
    }

    // Soft-delete: produk yang sudah ada di local tapi tidak ada di backoffice
    // (di-archive owner) → set active=false. Tidak DELETE karena order_item
    // history masih reference.
    const incomingIds = posProducts.map((p) => p.id);
    if (incomingIds.length > 0) {
      const result = await tx
        .update(schema.products)
        .set({ active: false })
        .where(notInArray(schema.products.id, incomingIds));
      // Drizzle libSQL tidak return rowsAffected konsisten; kita estimate
      // dari diff count (good enough untuk telemetry).
      const localAll = await tx.query.products.findMany();
      deactivated = localAll.filter(
        (p) => !incomingIds.includes(p.id) && !p.active
      ).length;
      void result;
    }
  });

  // --- Users → users (cashiers) --------------------------------------------
  const boUsers = await fetchUsers();
  // Filter: hanya yang assigned ke outlet ini DAN role yang relevan untuk POS.
  const posRelevant = boUsers.filter(
    (u) =>
      u.outlet_id === outletId &&
      ["kasir", "kepala_toko", "barista", "kitchen", "waiters"].includes(u.role)
  );

  await db.transaction(async (tx) => {
    for (const u of posRelevant) {
      const role = mapBackofficeRoleToPos(u);
      const email = synthesizeEmail(u);
      await tx
        .insert(schema.users)
        .values({
          id: u.id,
          name: u.name,
          email,
          emailVerified: true,
          role,
          username: deriveUsername(u),
          displayUsername: u.name,
        })
        .onConflictDoUpdate({
          target: schema.users.id,
          set: {
            name: u.name,
            email,
            role,
            displayUsername: u.name,
          },
        });
    }
  });

  // Catat timestamp di system_meta supaya `ensureFreshSync` tau apakah perlu
  // revalidate di request berikutnya.
  await markLastSyncedAt(new Date());

  return {
    outletId,
    categories: { upserted: posCategories.length },
    products: { upserted: posProducts.length, deactivated },
    users: { upserted: posRelevant.length },
    durationMs: Date.now() - start,
  };
}

/** Simpan timestamp last-sync ke `system_meta`. */
async function markLastSyncedAt(at: Date): Promise<void> {
  await db
    .insert(schema.systemMeta)
    .values({
      key: META_KEY_LAST_SYNC,
      value: at.toISOString(),
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: schema.systemMeta.key,
      set: { value: at.toISOString(), updatedAt: at },
    });
}

/**
 * Ambil timestamp last-sync. null kalau belum pernah sync sukses.
 */
export async function getLastSyncedAt(): Promise<Date | null> {
  const row = await db
    .select()
    .from(schema.systemMeta)
    .where(eq(schema.systemMeta.key, META_KEY_LAST_SYNC))
    .limit(1);
  if (!row[0]) return null;
  const d = new Date(row[0].value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * In-flight sync guard — biar concurrent request yang sama-sama detect
 * "stale" tidak fire 5 sync paralel ke backoffice. Pakai promise tunggal
 * di module scope; kalau sync running, calls berikutnya re-use promise itu.
 */
let inFlight: Promise<SyncReport> | null = null;
/**
 * Trailing-edge flag: di-set saat webhook datang sementara sync sedang jalan.
 * Setelah sync current selesai, kita fire **satu** sync tambahan biar mutation
 * yang masuk *selama* sync sebelumnya berlangsung tetap ke-pickup.
 *
 * Tanpa ini ada race subtle: sync mulai → owner update menu di backoffice →
 * sync selesai (belum lihat update terbaru) → webhook tiba → dedupedSync
 * lihat tidak ada in-flight, fire sync baru. Itu OK. Tapi kalau dua webhook
 * tiba berturut-turut sambil sync jalan, webhook ke-2 akan join in-flight,
 * yang TIDAK lihat update yang trigger webhook ke-2. Trailing flag mengatasi
 * itu.
 */
let trailingScheduled = false;

/**
 * Wrapper sync: returns existing promise kalau sync sedang jalan (de-dupe).
 */
async function dedupedSync(): Promise<SyncReport> {
  if (inFlight) return inFlight;
  inFlight = syncFromBackoffice().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Khusus dipanggil dari webhook receiver. Kalau sync belum jalan → fire
 * sync sekarang. Kalau sync sedang jalan → schedule trailing sync supaya
 * perubahan yang trigger webhook ini ke-pickup setelah sync current selesai.
 *
 * Return promise yang resolve saat sync (current ATAU trailing) selesai —
 * caller boleh `void`-kan untuk fire-and-forget.
 */
export async function triggerSyncForWebhook(): Promise<SyncReport> {
  if (!inFlight) return dedupedSync();
  // Sudah ada sync jalan. Tandai trailing sehingga setelah selesai kita
  // fire sekali lagi, lalu await yang trailing itu. Kalau sudah ada trailing
  // dijadwalkan, cukup join — semua webhook saat ini akan ke-cover oleh
  // trailing sync yang sama.
  if (trailingScheduled) return inFlight;
  trailingScheduled = true;
  // Tunggu current sync selesai (jangan throw — biarkan caller decide kalau
  // mau handle), lalu langsung fire trailing.
  try {
    await inFlight;
  } catch {
    // ignore — trailing tetap jalan supaya kita coba pickup state terbaru
  }
  trailingScheduled = false;
  return dedupedSync();
}

/**
 * Stale-while-revalidate: kalau local catalog stale (last sync > maxAgeMs ATAU
 * belum pernah sync), trigger sync di background tanpa await. Return segera
 * supaya request yg invoke ini tidak ng-block. Sync error di-log, tidak throw.
 *
 * Pemakaian: di GET /api/products, /api/categories, /api/cashiers — auto-pickup
 * perubahan backoffice tanpa kasir kudu pencet tombol "sync" manual.
 *
 * `awaitFirstRun = true` → kalau **belum pernah** sync sama sekali, await
 * sync sampai selesai supaya catalog tidak kosong saat first request setelah
 * deploy. Subsequent stale-revalidate tetap fire-and-forget.
 */
export async function ensureFreshSync(opts: {
  maxAgeMs?: number;
  awaitFirstRun?: boolean;
} = {}): Promise<void> {
  if (!isBackofficeModeEnabled()) return;

  const maxAge = opts.maxAgeMs ?? DEFAULT_FRESHNESS_MS;
  const last = await getLastSyncedAt();
  const fresh = last && Date.now() - last.getTime() < maxAge;
  if (fresh) return;

  const neverSynced = !last;
  const promise = dedupedSync().catch((e) => {
    console.warn(
      "[backoffice] auto-sync gagal (stale-while-revalidate):",
      e instanceof Error ? e.message : e
    );
    return null;
  });

  if (neverSynced && opts.awaitFirstRun) {
    // First-run: tunggu sync selesai biar response tidak return catalog
    // kosong setelah deploy fresh.
    await promise;
  } else {
    // Background: jangan ng-block request. Promise di-fire, error di-handle
    // di .catch() di atas.
    void promise;
  }
}

/**
 * Map backoffice role → POS local role. POS hanya kenal "cashier" | "supervisor".
 *  - kepala_toko / owner → supervisor (akses void, close shift selisih besar, dll)
 *  - kasir / barista / kitchen / waiters → cashier
 */
function mapBackofficeRoleToPos(u: BackofficeUser): "cashier" | "supervisor" {
  return u.role === "kepala_toko" || u.role === "owner" ? "supervisor" : "cashier";
}

/**
 * Slugify konsisten dengan backoffice/scripts/seed.ts → emailFor():
 *   lowercase + NFKD + replace non-word → "-" + trim "-".
 * Penting: harus deterministik biar email login user POS = email yg sama
 * dengan yang ada di tabel `user_auth` backoffice (kalau-kalau besok kita
 * mau cross-login).
 */
function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Backoffice GET /api/users TIDAK expose email (ada di table user_auth
 * terpisah). Untuk POS local DB kita synthesize sesuai konvensi seed
 * backoffice — `<slug>@allee.local`. Kalau backoffice nanti expose email
 * di response, helper ini auto-prefer field aslinya.
 */
function synthesizeEmail(u: BackofficeUser): string {
  if (u.email && u.email.trim()) return u.email.trim();
  const slug = slugifyName(u.name);
  return `${slug || u.id}@allee.local`;
}

/**
 * Username untuk login POS. Pakai email-local-part. Better Auth butuh
 * unique. Backoffice tidak expose username eksplisit, jadi kita derive
 * deterministik dari nama via synthesizeEmail.
 */
function deriveUsername(u: BackofficeUser): string {
  const local = synthesizeEmail(u).split("@")[0]?.trim();
  if (local) return local.toLowerCase();
  return slugifyName(u.name) || u.id.toLowerCase();
}

/**
 * Lightweight check: apakah local DB sudah pernah di-sync? Pakai untuk gate
 * UI atau warning "POS belum sinkron — minta admin run sync".
 */
export async function isLocalCatalogSynced(): Promise<boolean> {
  if (!isBackofficeModeEnabled()) return true; // standalone mode: catalog selalu valid
  const [cat] = await db.select().from(schema.categories).limit(1);
  const [prod] = await db.select().from(schema.products).limit(1);
  return Boolean(cat && prod);
}

