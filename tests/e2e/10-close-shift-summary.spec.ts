import { test, expect } from "@playwright/test";
import { loginWithPin, PIN } from "./helpers";

/**
 * Test terakhir — navigasi ke /shift/close. Expected cash = opening (500.000)
 * + cash_sales dari test 08.
 *
 * Verifikasi:
 *   - Summary block tampil (pakai getByText karena CardTitle bukan heading role)
 *   - Ada "Total Pendapatan" > Rp 0 (test 08 sudah bayar Tunai)
 *   - Input actual cash via numpad → klik Tutup Shift → card konfirmasi
 *     "Shift Ditutup" muncul + tombol Logout / Buka Shift Baru
 *   - Klik Logout → redirect ke /login (shift juga di-clear di sini)
 */

test("10 — close shift → confirmation card visible → logout redirects ke /login", async ({ page }) => {
  await loginWithPin(page, PIN.bella);
  await expect(page).toHaveURL(/\/order/);

  await page.goto("/shift/close");
  await expect(page).toHaveURL(/\/shift\/close/);

  // CardTitle → <div>, cari via text.
  await expect(page.getByText(/Ringkasan Shift/i).first()).toBeVisible();
  await expect(page.getByText(/Total Pendapatan/i)).toBeVisible();

  // Pastikan Total Pendapatan bukan Rp 0 (test 08 bayar Tunai).
  const revenueBlock = page.getByText(/Total Pendapatan/i).locator("..");
  await expect(revenueBlock).not.toContainText(/Rp\s*0\s*$/);

  // Input actual cash lewat numpad di dalam <main>.
  const main = page.locator("main");
  for (const ch of "500000") {
    await main
      .getByRole("button", { name: ch, exact: true })
      .first()
      .click();
  }

  // Klik "Tutup Shift" di dalam <main> (ada juga link "Tutup Shift" di header).
  await main.getByRole("button", { name: /^Tutup Shift$/i }).click();

  // Card konfirmasi harus muncul — clearShift() di-tunda ke handler tombol
  // Logout / Buka Shift Baru sehingga ShiftGuard tidak menimpali.
  await expect(page.getByText(/^Shift Ditutup$/i)).toBeVisible({ timeout: 15_000 });
  // "Selisih Kas" label di dalam Perhitungan Kas list (exact match, bukan yang di description).
  await expect(page.getByText("Selisih Kas", { exact: true })).toBeVisible();

  // Tombol Logout & Buka Shift Baru keduanya harus tersedia di dalam card
  // konfirmasi (scope ke <main> supaya tidak bentrok dengan Logout di header).
  const logoutBtn = main.getByRole("button", { name: /^Logout$/i });
  const newShiftBtn = main.getByRole("button", { name: /Buka Shift Baru/i });
  await expect(logoutBtn).toBeVisible();
  await expect(newShiftBtn).toBeVisible();

  // Klik Logout → redirect ke /login (shift di-clear + sesi di-logout).
  await logoutBtn.click();
  await page.waitForURL(/\/login/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /ALLEE Social House/i })).toBeVisible();
});
