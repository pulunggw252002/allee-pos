import { test, expect } from "@playwright/test";
import {
  loginWithPin,
  openShiftWithPreset500k,
  PIN,
  proceedToPayment,
  selectTakeaway,
} from "./helpers";

/**
 * 11 — void per item dari receipt page.
 *
 * Flow:
 *  1. Login + buka shift (sudah dijalankan oleh test 05/08; pakai PIN Bella).
 *  2. Add 2 item ke cart (bukan 1, supaya void item bukan item terakhir → tidak
 *     ditolak server).
 *  3. Takeaway → bayar tunai pas → receipt.
 *  4. Klik tombol "Void" di item pertama → isi alasan → confirm.
 *  5. Verifikasi: badge VOID muncul di item, banner di luar struk muncul,
 *     total di-recompute (≠ payment.amount), refund line muncul.
 */
test("11 — void item dari receipt: badge muncul, total berkurang, refund tampil", async ({
  page,
}) => {
  await loginWithPin(page, PIN.bella);
  // Kalau shift belum ada (isolated run), buka dulu via preset 500k.
  if (page.url().includes("/shift/open")) {
    await openShiftWithPreset500k(page);
  }
  await expect(page).toHaveURL(/\/order/);

  // Tambah dua item berbeda. Kita ambil dua produk pertama yang terlihat.
  const cards = page.locator("button:has(.text-3xl)");
  await cards.first().waitFor({ state: "visible" });
  await cards.nth(0).click();
  await cards.nth(1).click();
  // Tunggu cart ter-update setidaknya 2 qty.
  await expect(page.getByText(/0 item · 0 qty/i)).toHaveCount(0, { timeout: 5_000 });

  await selectTakeaway(page);
  await proceedToPayment(page);

  await page.getByRole("button", { name: "Tunai", exact: true }).click();
  await page.getByRole("button", { name: "Pas", exact: true }).click();

  const payBtn = page.getByRole("button", { name: /^Bayar Rp.*— Tunai$/i });
  await expect(payBtn).toBeEnabled();
  await payBtn.click();

  await page.waitForURL(/\/receipt\//, { timeout: 15_000 });

  // Snapshot total awal dari struk.
  const totalLineBefore = page
    .locator(".print-receipt")
    .getByText("TOTAL", { exact: true })
    .locator("..");
  await expect(totalLineBefore).toBeVisible();
  const totalTextBefore = (await totalLineBefore.innerText()).trim();

  // Klik tombol "Void" pertama (di item pertama).
  const voidBtns = page.getByRole("button", { name: /^Void$/i });
  await voidBtns.first().click();

  // Dialog muncul — isi alasan + confirm.
  await expect(page.getByRole("heading", { name: /Void Item/i })).toBeVisible();
  await page.getByLabel(/Alasan void/i).fill("salah menu — tes e2e");
  await page.getByRole("button", { name: /^Void Item$/ }).click();

  // Toast sukses.
  await expect(page.locator("[data-sonner-toast]").first()).toBeVisible({
    timeout: 10_000,
  });

  // Badge "VOID" muncul di salah satu item.
  await expect(
    page.locator(".print-receipt").getByText("VOID", { exact: true }).first()
  ).toBeVisible({ timeout: 10_000 });

  // Banner di luar struk: "1 item di-void • nilai ... tidak masuk revenue."
  await expect(
    page.getByText(/item di-void.*tidak masuk revenue/i)
  ).toBeVisible();

  // Refund line muncul di struk.
  await expect(
    page.locator(".print-receipt").getByText(/Refund Item Void/i)
  ).toBeVisible();

  // Total setelah void berbeda dari sebelum (lebih kecil).
  const totalLineAfter = page
    .locator(".print-receipt")
    .getByText("TOTAL", { exact: true })
    .locator("..");
  const totalTextAfter = (await totalLineAfter.innerText()).trim();
  expect(totalTextAfter).not.toEqual(totalTextBefore);
});
