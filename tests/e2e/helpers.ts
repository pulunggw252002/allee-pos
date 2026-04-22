import { expect, type Page } from "@playwright/test";

/**
 * Helpers untuk e2e POS flow.
 *
 * PIN demo (seed: lib/mock/cashiers.ts):
 *   - Andi (cashier)            → 111111
 *   - Bella (cashier)           → 222222
 *   - Sinta (supervisor)        → 999999
 */

export const PIN = {
  andi: "111111",
  bella: "222222",
  sinta: "999999",
  // PIN 6 digit yang TIDAK ada di seed (lib/mock/cashiers.ts).
  // Numpad di login page pakai allowLeadingZero, jadi "000000" juga valid bentuk PIN.
  invalid: "987654",
} as const;

/** Ketuk tombol numpad dengan label exact (1-9, 0, C). */
export async function tapNumpad(page: Page, digit: string) {
  await page
    .getByRole("button", { name: digit, exact: true })
    .first()
    .click();
}

/** Ketik PIN via tombol numpad (PIN auto-submit saat panjangnya 6). */
export async function typePin(page: Page, pin: string) {
  for (const ch of pin) {
    await tapNumpad(page, ch);
  }
}

/** Login dengan PIN; tunggu sampai redirect ke /order atau /shift/open. */
export async function loginWithPin(page: Page, pin: string) {
  await page.goto("/login");
  // Tombol "C" (clear) di numpad login ada, jadi target selector harus tepat.
  await expect(page.getByRole("heading", { name: /ALLEE Social House/i })).toBeVisible();
  await typePin(page, pin);
  // Tunggu redirect setelah PIN 6-digit auto-submit.
  await page.waitForURL(/\/(order|shift\/open)/, { timeout: 15_000 });
}

/**
 * Buka shift dengan klik preset "500k" (500.000 IDR), lalu submit.
 * Precondition: current page sudah di /shift/open.
 */
export async function openShiftWithPreset500k(page: Page) {
  await expect(page).toHaveURL(/\/shift\/open/);
  await page.getByRole("button", { name: "500k", exact: true }).click();
  await page.getByRole("button", { name: /Buka Shift — Rp\s*500\.000/i }).click();
  await page.waitForURL(/\/order/, { timeout: 15_000 });
}

/** Klik menu item pertama yang terlihat (untuk flow cepat). */
export async function addFirstMenuItem(page: Page) {
  // menu-item-card = <button> berisi emoji + nama + harga.
  const cards = page.locator("button:has(.text-3xl)");
  await cards.first().waitFor({ state: "visible" });
  await cards.first().click();
  // Tunggu cart ter-update (badge "1" di item card atau cart menampilkan ≥ 1 item).
  // Cart header: "<n> item · <m> qty" — kita verifikasi bukan lagi "0 item".
  await expect(page.getByText(/0 item · 0 qty/i)).toHaveCount(0, { timeout: 5_000 });
}

/** Ubah jenis order ke Takeaway (menghindari requirement nomor meja). */
export async function selectTakeaway(page: Page) {
  await page.getByRole("button", { name: "Takeaway", exact: true }).click();
}

/** Klik tombol "Lanjutkan ke Pembayaran". */
export async function proceedToPayment(page: Page) {
  await page.getByRole("button", { name: /Lanjutkan ke Pembayaran/i }).click();
  await page.waitForURL(/\/payment\//, { timeout: 15_000 });
}
