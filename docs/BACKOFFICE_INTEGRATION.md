# Backoffice ↔ POS Integration

POS ALLEE bisa berjalan dalam dua mode:

| Mode | `BACKOFFICE_MODE` | Sumber data |
|---|---|---|
| **Standalone** (default) | `false` / unset | DB lokal POS (Turso). Catalog di-seed via `db:seed`. |
| **Backoffice-connected** | `true` | Backoffice ALLEE = source of truth untuk catalog (kategori, menu, HPP) dan users. POS push transaksi & void ke backoffice. |

> Kontrak penuh ada di `Backoffice ALLEE/docs/pos-api-contract.md` (v1.1).

---

## 1. Cara mengaktifkan mode backoffice

### 1.1. Set env (Vercel / hosting)
Tambahkan ke `.env.production` atau dashboard env Vercel:

```env
BACKOFFICE_MODE=true
BACKOFFICE_API_URL=https://allee-backoffice.vercel.app
BACKOFFICE_SERVICE_EMAIL=pos-device-1@allee.local
BACKOFFICE_SERVICE_PASSWORD=<password-yang-di-set-di-backoffice>
# Optional. Kalau kosong, auto-detect dari /api/session.outlet_id.
NEXT_PUBLIC_OUTLET_ID=out_dago
```

Service account harus dibuat dulu di backoffice dengan role `kasir` atau
`kepala_toko`. Owner di backoffice → menu Users → Add User.

### 1.2. Push schema baru ke Turso prod
Field `hpp_cached` ditambahkan ke `product` dalam migrasi 0001. Jalankan:

```bash
npm run db:push:prod
```

Kolom default 0 → tidak break data existing. Untuk produk yang sudah ada,
`hpp_cached` akan di-overwrite saat sync pertama.

### 1.3. Sync awal
Setelah deploy, login sebagai supervisor lalu trigger:

```bash
curl -X POST https://pos.allee.example.com/api/backoffice/sync \
  -H "Cookie: <session-cookie-supervisor>"
```

Atau sediakan tombol di UI settings (TODO Phase 2).

Response:
```json
{
  "outletId": "out_dago",
  "categories": { "upserted": 4 },
  "products": { "upserted": 18, "deactivated": 0 },
  "users": { "upserted": 5 },
  "durationMs": 842
}
```

### 1.4. Verifikasi
```bash
curl https://pos.allee.example.com/api/backoffice/status
# {
#   "mode": "backoffice",
#   "enabled": true,
#   "configured": true,
#   "outletId": "out_dago",
#   "synced": true
# }
```

---

## 2. Apa yang di-sync, apa yang TIDAK

### Di-sync dari backoffice → POS
- **Categories** (`/api/categories`): id, name, sort_order.
- **Menus** (`/api/menus`, filter outlet): id, name, price, hpp_cached, is_active.
- **Users** yang assigned ke outlet ini, role `kasir`/`kepala_toko`/`barista`/`kitchen`/`waiters`.
  Role mapping: `kepala_toko`/`owner` → `supervisor`, lain → `cashier`.

### Tetap POS-only
- **Stations** (st-bar, st-kitchen) — KDS routing.
- **Tables** — POS tidak punya tabel di backoffice.
- **Shifts** — POS-only sampai backoffice ship konsep shift.
- **Better Auth tables** (sessions, accounts, verification).

### POS → backoffice (write)
Saat `BACKOFFICE_MODE=true`:
- **`POST /api/transactions`** — di-trigger setelah user pay sukses.
- **`POST /api/transactions/:id/items/:itemId/void`** — di-trigger setelah void per item di POS.

Push semua best-effort: kegagalan backoffice **tidak ng-block** kasir.
Failure di-log; perlu retry queue di Phase 2.

---

## 3. Mapping schema

| Backoffice | POS | Catatan |
|---|---|---|
| `Menu.id` | `Product.id` | identical, opaque string |
| `Menu.price` | `Product.price` | IDR int |
| `Menu.hpp_cached` | `Product.hppCached` | dipakai sebagai `hpp_snapshot` saat push |
| `Menu.category_id` | `Product.categoryId` | identical |
| — | `Product.stationId` | POS-only; default `st-bar`. Override via env `BACKOFFICE_STATION_MAP` (JSON). Heuristik: kategori "food/snack/makanan" → `st-kitchen`. |
| `Category.sort_order` | `Category.order` | numeric |
| `OrderType: dine_in` | `OrderType: dine-in` | |
| `OrderType: take_away` | `OrderType: takeaway` | |
| `OrderType: delivery` | `OrderType: delivery` | |
| `OrderType: online` | (tidak ada di POS) | POS skip — backoffice yg handle |
| `User.role: owner` | `role: supervisor` | |
| `User.role: kepala_toko` | `role: supervisor` | |
| `User.role: kasir` etc. | `role: cashier` | |

---

## 4. Cara kerja saat runtime

```
┌──────────────┐                              ┌────────────────┐
│  POS device  │   1. sign-in service acct    │  Backoffice    │
│              │ ───────────────────────────▶ │  /api/auth/    │
│              │ ◀───────────────────────────  │  sign-in       │
│              │   2. cookie session           │                │
│              │                                │                │
│              │   3. POST /api/backoffice/sync│                │
│              │   (supervisor manual / cron)  │                │
│              │                                │                │
│              │   ┌── reads ─▶  /api/categories,                │
│              │   │             /api/menus,                     │
│              │   │             /api/users,                     │
│              │   │             /api/session                    │
│              │   ▼                                              │
│  Local DB    │   4. upsert categories, products, users         │
│  (Turso)     │                                                  │
│              │                                                  │
│              │   5. Kasir buka order → pay                     │
│              │      (semua read pakai DB lokal)                │
│              │                                                  │
│              │   6. POST /api/transactions  ─────────────────▶ │
│              │      (best-effort, idempotent via POS id)        │
│              │                                                  │
│              │   7. POST /api/transactions/:id/items/:item/void│
│              │      saat kasir void per item ────────────────▶ │
└──────────────┘                              └────────────────┘
```

Cookie session di-cache di memory module-scope per warm instance Vercel.
Auto-retry sekali kalau backoffice respond 401 (cookie expired).

---

## 5. Limitasi & gap

1. **Service account interim** — semua transaksi POS akan ter-attribute ke
   user backoffice yang sama (service account email). Audit "siapa kasir"
   tetap akurat di POS local DB. Backoffice akan tambah PIN endpoint
   sehingga POS bisa login per kasir → transaksi ter-attribute personal.

2. **Item ID matching saat void** — backoffice generate `transaction_item.id`
   sendiri (≠ POS `order_item.id`). POS identifikasi item via INDEX (urutan
   POST), dengan cross-check `name_snapshot`. Kalau backoffice di future
   reorder items, push void item akan throw → safe but loses void on
   backoffice (POS local tetap void, tinggal manual reconcile).

3. **No queue / retry** — push gagal hanya di-log. Phase 2: tambah retry
   queue di local DB (table `outbox_events`) untuk eventual consistency.

4. **Bundle, addon, ingredient** — POS belum support. Push transaksi selalu
   `bundle_id: null`, `addons: []`. Sync tidak narik addon-groups/bundles.

5. **HPP snapshot saat standalone** — produk POS yang di-seed via
   `db:seed` punya `hppCached = 0`. Kalau push ke backoffice (mode aktif
   tapi tidak sync dulu), profit di backoffice = revenue. Selalu sync
   sebelum POS dipakai live.

6. **Multi-outlet** — POS device per outlet. Set `NEXT_PUBLIC_OUTLET_ID`
   eksplisit untuk lock; jangan share device antar outlet sambil ganti
   service account on-the-fly.

---

## 6. Troubleshooting

### `Backoffice mode tidak aktif`
`BACKOFFICE_MODE` tidak di-set ke `true`. Cek env hosting.

### `Sign-in ke backoffice gagal (401)`
Email/password service account salah, atau user belum dibuat di backoffice.
Cek dashboard backoffice → Users.

### `Sign-in sukses tapi cookie session tidak ditemukan`
Backoffice mungkin baru ganti nama cookie. Pastikan cookie name masih
`allee.session_token`. Kalau ganti, update regex di
`lib/api-server/backoffice/client.ts:parseSetCookie`.

### Push transaksi log warning tapi pay sukses
Itu by design (best-effort). Cek warning di Vercel logs untuk tahu
kenapa push gagal — biasanya HPP/subtotal mismatch karena local catalog
ketinggalan. Jalankan sync ulang.

### `Item mismatch saat void`
Index item di POS tidak cocok dengan urutan items di backoffice. Hindari
reorder items di backoffice setelah push. Untuk fix manual: void langsung
di backoffice via dashboard, lalu reconcile dengan POS local.

---

## 7. Rollback

Set `BACKOFFICE_MODE=false` (atau hapus env-nya) → POS langsung jalan
standalone lagi. Catalog yang sudah ke-sync tetap di local DB sampai
di-overwrite oleh seed berikutnya.

Tidak ada cleanup data: semua produk/kategori dari sync coexist dengan
seed lokal — yang punya id sama akan di-update, beda id stays.
