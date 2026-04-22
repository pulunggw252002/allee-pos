# Production Database Setup — Turso

Aplikasi ini pakai **libSQL** sebagai driver (lihat `lib/db/index.ts`). Driver
yang sama melayani dua mode lewat satu ENV `DATABASE_URL`:

- **Dev**: `file:pos.db` — SQLite lokal di folder project.
- **Prod**: `libsql://<db>-<org>.turso.io` — Turso (distributed SQLite).

Tidak ada refactor code saat switch — cukup ganti env.

---

## 1. Install Turso CLI

```bash
# macOS / Linux
curl -sSfL https://get.tur.so/install.sh | bash

# Windows (PowerShell)
irm get.tur.so/install.ps1 | iex

# Verifikasi
turso --version
```

## 2. Sign up / login

```bash
turso auth signup   # atau: turso auth login
```

## 3. Create the production database

```bash
# Ganti <nama-db> dengan nama yang kamu mau (mis. allee-pos-prod)
turso db create allee-pos-prod

# (Opsional) pilih region terdekat — default sudah dipilih otomatis
# Daftar region: `turso db locations`
# Contoh: Singapore
turso db create allee-pos-prod --location sin
```

## 4. Ambil URL dan auth token

```bash
# URL (format: libsql://allee-pos-prod-<org>.turso.io)
turso db show allee-pos-prod --url

# Auth token (token read+write, default masa berlaku lama — simpan aman)
turso db tokens create allee-pos-prod
```

## 5. Set environment variables

Salin `.env.production.example` → `.env.production` (atau set di dashboard
Vercel/Railway/hosting kamu), lalu isi:

```bash
DATABASE_URL=libsql://allee-pos-prod-<org>.turso.io
DATABASE_AUTH_TOKEN=<token dari step 4>
BETTER_AUTH_SECRET=<random 32+ chars — generate dengan `openssl rand -base64 32`>
BETTER_AUTH_URL=https://pos.allee.example.com
```

## 6. Push schema ke Turso

Dari mesin dev kamu, load env prod sementara dan jalankan:

```bash
# Bash / zsh
DATABASE_URL="libsql://allee-pos-prod-<org>.turso.io" \
DATABASE_AUTH_TOKEN="<token>" \
npm run db:push
```

```powershell
# PowerShell
$env:DATABASE_URL="libsql://allee-pos-prod-<org>.turso.io"
$env:DATABASE_AUTH_TOKEN="<token>"
npm run db:push
```

`drizzle-kit` akan otomatis pakai dialect `turso` karena URL diawali `libsql://`
(lihat `drizzle.config.ts`).

## 7. Seed data awal (opsional — hanya kalau mau preload kasir/produk)

> ⚠️ Seed script default membuat kasir dummy (`c1`/`111111`, dst). Untuk prod
> asli, sebaiknya **jangan** pakai seed ini — nanti Back Office yang akan
> mengisi data kasir/produk/meja. Seed di bawah hanya untuk smoke test.

```bash
DATABASE_URL="libsql://allee-pos-prod-<org>.turso.io" \
DATABASE_AUTH_TOKEN="<token>" \
npm run db:seed
```

## 8. Verifikasi dari Drizzle Studio

```bash
DATABASE_URL="libsql://allee-pos-prod-<org>.turso.io" \
DATABASE_AUTH_TOKEN="<token>" \
npm run db:studio
```

Buka https://local.drizzle.studio — kamu sekarang melihat data Turso
(dialect berubah jadi `turso` otomatis).

---

## Checklist Deploy

- [ ] `DATABASE_URL` & `DATABASE_AUTH_TOKEN` di-set di hosting
- [ ] `BETTER_AUTH_SECRET` diganti dari dev default ke random 32+ chars
- [ ] `BETTER_AUTH_URL` = domain prod yang beneran dipakai
- [ ] `npm run db:push` sudah dijalankan di target prod
- [ ] Kasir pertama sudah dibuat (lewat seed atau lewat Back Office nanti)
- [ ] Test login PIN dari browser production

## Catatan

- **Backup**: Turso otomatis snapshot. Untuk dump manual: `turso db shell <db-name> ".dump" > backup.sql`.
- **Replikasi multi-region**: `turso db replicate <db-name> <location>`. POS sudah-read-heavy, read-replica dekat outlet = latency turun drastis.
- **Quota**: free tier Turso cukup besar (1 DB, 9 GB, 1B rows read/bulan). Untuk 1 outlet, cukup setahun penuh.
- **Local dev tetap pakai file**: `DATABASE_URL=file:pos.db` di `.env.local`. Tidak ada biaya atau latency jaringan.
