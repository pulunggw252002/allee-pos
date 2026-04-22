# ALLEE POS — e2e Tests (Playwright)

10 skenario test end-to-end yang menelusuri alur POS paling kritis:
login → buka shift → order → bayar → tutup shift.

## Stack

- **Playwright** — browser automation (Chromium only)
- **Test DB terisolasi** — `test-pos.db` (di-reset sebelum setiap run)
- **Serial execution** — `workers: 1` karena test saling bergantung DB state

## Menjalankan

```bash
# Sekali pakai:
npm run test:e2e

# UI mode (debug interaktif):
npm run test:e2e:ui

# Buka HTML report setelah run:
npm run test:e2e:report
```

## Arsitektur

### Test DB (terisolasi)

`tests/e2e/global-setup.ts` dijalankan **sekali** sebelum semua test:

1. Hapus `test-pos.db` (dan file WAL/SHM) jika ada.
2. Push schema via `drizzle-kit push` (`DATABASE_URL=file:test-pos.db`).
3. Seed data (users, categories, products, tables) via `tsx lib/db/seed.ts`.

Next.js dev server (dispawn Playwright via `webServer`) juga di-override
ke `file:test-pos.db`, jadi DB production (Turso) **tidak akan tersentuh**.

### Port

Test server berjalan di **`http://localhost:3100`** (port 3100, bukan 3000)
supaya tidak bentrok dengan `npm run dev` yang mungkin sedang jalan.

### Eksekusi serial

`workers: 1, fullyParallel: false`. Urutan test by filename (01 → 10):

| # | Spec | Tujuan |
|---|------|--------|
| 01 | `01-login-valid-pin` | PIN valid → `/shift/open` |
| 02 | `02-login-invalid-pin` | PIN salah → toast error, stay `/login` |
| 03 | `03-guard-no-auth-redirect` | Akses `/order`/`/tables` tanpa login → `/login` |
| 04 | `04-guard-no-shift-redirect` | Login tapi belum buka shift → `/shift/open` |
| 05 | `05-open-shift-with-preset` | Klik preset 500k → shift dibuka → `/order` |
| 06 | `06-menu-search-filter` | Search menu memfilter grid |
| 07 | `07-dine-in-requires-table` | Dine-in tanpa nomor meja → tombol disabled |
| 08 | `08-takeaway-cash-checkout` | Add item → takeaway → cash "Pas" → receipt |
| 09 | `09-takeaway-qris-checkout` | Add item → takeaway → QRIS → receipt |
| 10 | `10-close-shift-summary` | `/shift/close` → summary → tutup shift |

Test 05 membuka shift untuk kasir "Bella". Test 06–10 mengandalkan shift
tersebut tetap aktif. Test 10 menutupnya.

### PIN demo (seed)

Lihat `lib/mock/cashiers.ts`:

| Cashier | PIN | Dipakai di test |
|---|---|---|
| Andi (cashier) | `111111` | 01 |
| Bella (cashier) | `222222` | 04–10 |
| Sinta (supervisor) | `999999` | — |

## Helpers

`tests/e2e/helpers.ts` — reusable functions:

- `loginWithPin(page, pin)` — goto `/login`, ketik PIN, tunggu redirect
- `openShiftWithPreset500k(page)` — klik preset "500k" + submit
- `addFirstMenuItem(page)` — tap menu-card pertama
- `selectTakeaway(page)` — pilih order type Takeaway (lewatin requirement meja)
- `proceedToPayment(page)` — klik "Lanjutkan ke Pembayaran", tunggu nav
- `typePin(page, pin)` — ketik digit PIN via numpad

## Troubleshooting

**`EADDRINUSE: port 3100 already in use`**
Ada proses sebelumnya masih menempel. `Stop-Process -Name node` di PowerShell
atau ubah `PORT` di `playwright.config.ts`.

**Test 10 gagal dengan "Total Pendapatan Rp 0"**
Test 08 dan/atau 09 gagal sehingga tidak ada order dibayar. Jalankan ulang
`npm run test:e2e` — global-setup akan reset DB.

**Sesi tidak terhapus di test**
Tiap `test()` di Playwright punya browser context sendiri (fresh cookies).
Tapi DB shared — kalau mau isolasi penuh, jalankan globalSetup sebagai
`beforeEach` (akan memperlambat test).
