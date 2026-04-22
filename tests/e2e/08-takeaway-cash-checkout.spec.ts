import { test, expect } from "@playwright/test";
import {
  addFirstMenuItem,
  loginWithPin,
  PIN,
  proceedToPayment,
  selectTakeaway,
} from "./helpers";

test("08 — takeaway flow: add item → cash 'Pas' → receipt", async ({ page }) => {
  await loginWithPin(page, PIN.bella);
  await expect(page).toHaveURL(/\/order/);

  await addFirstMenuItem(page);
  await selectTakeaway(page);

  await proceedToPayment(page);

  // Method "Tunai" default ada; klik untuk memastikan terpilih.
  await page.getByRole("button", { name: "Tunai", exact: true }).click();

  // Klik tombol "Pas" → mengisi tendered = total.
  await page.getByRole("button", { name: "Pas", exact: true }).click();

  // Kembalian 0 → "Rp 0" atau kembalian hijau.
  // Tombol bayar harus enabled (tendered >= total).
  const payBtn = page.getByRole("button", { name: /^Bayar Rp.*— Tunai$/i });
  await expect(payBtn).toBeEnabled();
  await payBtn.click();

  // Redirect ke receipt.
  await page.waitForURL(/\/receipt\//, { timeout: 15_000 });
  // Sonner toast "Pembayaran berhasil".
  await expect(page.locator("[data-sonner-toast]").first()).toBeVisible({ timeout: 10_000 });
});
