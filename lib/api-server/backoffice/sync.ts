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

import { eq, inArray, notInArray, and } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  fetchCategories,
  fetchMenusForOutlet,
  fetchOutlets,
  fetchPosPinsForOutlet,
  fetchPrintersForOutlet,
  fetchTaxSettings,
  fetchUsers,
  resolveOutletId,
} from "./reads";
import { backofficeCategoryToCategory, backofficeMenuToProduct } from "./mappers";
import { isBackofficeModeEnabled } from "./config";
import type { BackofficeUser } from "@/lib/types/backoffice";

/** Key untuk menyimpan timestamp last-successful-sync di tabel `system_meta`. */
const META_KEY_LAST_SYNC = "backoffice.last_synced_at";

/**
 * Key untuk simpan tax settings (PPN + service charge percent). Disimpan di
 * `system_meta` sebagai JSON supaya schema fixed dan kita tidak perlu
 * tabel baru — singleton yang dibaca order route saat hitung pajak.
 */
const META_KEY_TAX = "backoffice.tax_settings";

/**
 * Default freshness window. Setelah lewat ini, helper `ensureFreshSync` akan
 * trigger background revalidate. Boleh di-override per call. 5 menit cukup
 * agresif untuk MVP — owner ganti harga di backoffice, POS pickup max 5 menit.
 */
export const DEFAULT_FRESHNESS_MS = 5 * 60 * 1000;

export interface SyncReport {
  outletId: string;
  outlets: { upserted: number };
  taxSettings: { ppnPercent: number; servicePercent: number };
  categories: { upserted: number };
  products: { upserted: number; deactivated: number };
  users: { upserted: number };
  pins: { upserted: number; cleared: number };
  printers: { upserted: number; deactivated: number };
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

  // --- Outlets cache --------------------------------------------------------
  // Sync semua outlet (bukan cuma yang aktif POS ini) supaya kalau besok kita
  // mau implement multi-outlet switcher di POS, data sudah siap. Brand name,
  // address, dst. dipakai untuk render receipt — TIDAK boleh hardcoded.
  const boOutlets = await fetchOutlets();
  await db.transaction(async (tx) => {
    for (const o of boOutlets) {
      // Brand_name di backoffice optional — fallback ke nama outlet kalau
      // owner belum set custom brand di halaman edit struk.
      const brandName = (o.brand_name?.trim() || o.name) ?? o.name;
      const brandSubtitle = o.brand_subtitle?.trim() || null;
      const receiptFooter = o.receipt_footer ?? null;
      const taxId = o.tax_id?.trim() || null;

      await tx
        .insert(schema.outlets)
        .values({
          id: o.id,
          name: o.name,
          brandName,
          brandSubtitle,
          address: o.address ?? null,
          city: o.city ?? null,
          phone: o.phone ?? null,
          openingHours: o.opening_hours ?? null,
          // Source of truth untuk struk = backoffice. Sync overwrite full —
          // kalau owner edit di backoffice, POS pickup di sync berikutnya.
          receiptFooter,
          taxId,
          active: o.is_active,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.outlets.id,
          set: {
            name: o.name,
            brandName,
            brandSubtitle,
            address: o.address ?? null,
            city: o.city ?? null,
            phone: o.phone ?? null,
            openingHours: o.opening_hours ?? null,
            receiptFooter,
            taxId,
            active: o.is_active,
            syncedAt: new Date(),
          },
        });
    }
  });

  // --- Tax settings --------------------------------------------------------
  // Backoffice singleton tax_settings = source of truth untuk PPN & service
  // charge. POS simpan sebagai JSON di system_meta supaya order route bisa
  // baca tanpa join — diparsing oleh helper `getTaxSettings()`.
  const tax = await fetchTaxSettings();
  const taxJson = JSON.stringify({
    ppn_percent: tax.ppn_percent,
    service_charge_percent: tax.service_charge_percent,
    updated_at: tax.updated_at,
  });
  await db
    .insert(schema.systemMeta)
    .values({ key: META_KEY_TAX, value: taxJson, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.systemMeta.key,
      set: { value: taxJson, updatedAt: new Date() },
    });

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
      const username = deriveUsername(u);
      await tx
        .insert(schema.users)
        .values({
          id: u.id,
          name: u.name,
          email,
          emailVerified: true,
          role,
          username,
          displayUsername: u.name,
        })
        .onConflictDoUpdate({
          target: schema.users.id,
          set: {
            name: u.name,
            email,
            role,
            // Username juga di-update on conflict supaya kalau slugifier
            // berubah (mis. fix hyphen → underscore biar kompatibel dengan
            // Better Auth username plugin), existing rows ikut migrasi
            // tanpa perlu manual SQL UPDATE.
            username,
            displayUsername: u.name,
          },
        });
    }
  });

  // --- PIN hashes → accounts (Better Auth credential provider) -------------
  // Pull hash dari endpoint internal backoffice, lalu upsert ke tabel `account`
  // sehingga `auth.api.signInUsername` bisa men-verify PIN tanpa POS perlu
  // tahu PIN plain-text. Hash format = scrypt Better Auth, kompatibel langsung.
  //
  // Important: `account.id` di Better Auth biasanya = `userId` (1 user 1
  // credential row) — kita pakai pola yang sama supaya idempotent.
  //
  // Graceful degrade: kalau POS_WEBHOOK_SECRET belum di-set (mis. POS
  // dideploy duluan sebelum env webhook di-share), fetch ini akan throw —
  // kita catch dan SKIP PIN sync supaya catalog/users tetap ke-sync.
  // Owner bisa set env nanti, sync ulang, dan PIN-nya akan ke-pickup.
  let pins: Awaited<ReturnType<typeof fetchPosPinsForOutlet>> = [];
  let pinSyncError: string | null = null;
  try {
    pins = await fetchPosPinsForOutlet(outletId);
  } catch (e) {
    pinSyncError = e instanceof Error ? e.message : String(e);
    console.warn(
      "[backoffice] PIN sync di-skip:",
      pinSyncError,
      "— catalog & users tetap ke-sync. Set POS_WEBHOOK_SECRET di POS supaya PIN ikut sync.",
    );
  }
  // Filter pin yang user-nya benar-benar relevan untuk POS (sudah di-sync
  // ke `user` table). Hash untuk user yang tidak relevan (mis. owner) di-skip.
  const relevantUserIds = new Set(posRelevant.map((u) => u.id));
  const pinsForPos = pins.filter((p) => relevantUserIds.has(p.user_id));

  let pinsUpserted = 0;
  let pinsCleared = 0;
  // Kalau fetch PIN gagal (mis. POS_WEBHOOK_SECRET belum di-set), JANGAN
  // jalankan blok upsert + cleanup — tanpa data otoritatif kita bisa
  // accidentally hapus semua credential row yang masih valid.
  if (pinSyncError) {
    // skip seluruh blok PIN sync
  } else
  await db.transaction(async (tx) => {
    for (const pin of pinsForPos) {
      // Cek apakah user ini sudah punya credential account row.
      const existing = await tx
        .select()
        .from(schema.accounts)
        .where(
          and(
            eq(schema.accounts.userId, pin.user_id),
            eq(schema.accounts.providerId, "credential"),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await tx.insert(schema.accounts).values({
          id: pin.user_id,
          userId: pin.user_id,
          accountId: pin.user_id,
          providerId: "credential",
          password: pin.pos_pin_hash,
        });
      } else {
        await tx
          .update(schema.accounts)
          .set({ password: pin.pos_pin_hash })
          .where(eq(schema.accounts.id, existing[0].id));
      }
      pinsUpserted++;
    }

    // Untuk user POS yang DI-sync tapi backoffice tidak return PIN hash
    // (PIN di-clear di backoffice), kita harus REVOKE PIN-nya di POS:
    // hapus account row supaya signInUsername otomatis gagal.
    const pinUserIds = new Set(pinsForPos.map((p) => p.user_id));
    for (const u of posRelevant) {
      if (pinUserIds.has(u.id)) continue;
      const cred = await tx
        .select()
        .from(schema.accounts)
        .where(
          and(
            eq(schema.accounts.userId, u.id),
            eq(schema.accounts.providerId, "credential"),
          ),
        )
        .limit(1);
      if (cred.length > 0) {
        await tx.delete(schema.accounts).where(eq(schema.accounts.id, cred[0].id));
        pinsCleared++;
      }
    }
  });

  // --- Printers -----------------------------------------------------------
  // Tarik printer master data untuk outlet aktif. Backoffice sudah filter
  // hanya `is_active`. Kita upsert by id, lalu soft-delete (set active=false)
  // untuk row di local DB yang tidak ke-return — sama pola dengan products,
  // supaya history POS settings yang merefer printer lama tetap valid.
  let printersUpserted = 0;
  let printersDeactivated = 0;
  const boPrinters = await fetchPrintersForOutlet(outletId);
  await db.transaction(async (tx) => {
    for (const p of boPrinters) {
      await tx
        .insert(schema.printers)
        .values({
          id: p.id,
          outletId: p.outlet_id,
          code: p.code,
          name: p.name,
          type: p.type,
          connection: p.connection,
          address: p.address,
          paperWidth: p.paper_width,
          note: p.note,
          active: p.is_active,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.printers.id,
          set: {
            code: p.code,
            name: p.name,
            type: p.type,
            connection: p.connection,
            address: p.address,
            paperWidth: p.paper_width,
            note: p.note,
            active: p.is_active,
            syncedAt: new Date(),
          },
        });
      printersUpserted++;
    }

    // Soft-delete: printer untuk outlet ini yang sudah tidak ada di
    // backoffice (di-delete atau di-set non-aktif) → set active=false
    // di local DB. Tidak DELETE supaya pilihan kasir di localStorage
    // (printer-id) tetap resolvable saat render.
    const incomingIds = boPrinters.map((p) => p.id);
    const localForOutlet = await tx.query.printers.findMany({
      where: eq(schema.printers.outletId, outletId),
    });
    for (const local of localForOutlet) {
      if (!incomingIds.includes(local.id) && local.active) {
        await tx
          .update(schema.printers)
          .set({ active: false, syncedAt: new Date() })
          .where(eq(schema.printers.id, local.id));
        printersDeactivated++;
      }
    }
  });

  // Catat timestamp di system_meta supaya `ensureFreshSync` tau apakah perlu
  // revalidate di request berikutnya.
  await markLastSyncedAt(new Date());

  return {
    outletId,
    outlets: { upserted: boOutlets.length },
    taxSettings: {
      ppnPercent: tax.ppn_percent,
      servicePercent: tax.service_charge_percent,
    },
    categories: { upserted: posCategories.length },
    products: { upserted: posProducts.length, deactivated },
    users: { upserted: posRelevant.length },
    pins: { upserted: pinsUpserted, cleared: pinsCleared },
    printers: { upserted: printersUpserted, deactivated: printersDeactivated },
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
 *
 * Better Auth username plugin default regex hanya allow `[a-zA-Z0-9_.]+`
 * — TIDAK termasuk hyphen. `synthesizeEmail` slug-nya mengganti
 * non-word chars dengan `-`, sehingga "Dewi Barista" → "dewi-barista".
 * Username valid → tukar `-` jadi `_` supaya tetap human-readable
 * tapi lolos regex Better Auth. Karakter lain di-strip ke `_` juga,
 * lalu collapse multiple underscore.
 */
function deriveUsername(u: BackofficeUser): string {
  const local = synthesizeEmail(u).split("@")[0]?.trim() ?? "";
  const base = local || slugifyName(u.name) || u.id;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9_.]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    || u.id.toLowerCase().replace(/[^a-z0-9_.]+/g, "_");
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

