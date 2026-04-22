import { test, expect } from "@playwright/test";
import {
  addFirstMenuItem,
  loginWithPin,
  PIN,
  proceedToPayment,
  selectTakeaway,
} from "./helpers";

test("09 — takeaway flow: add item → bayar QRIS → receipt", async ({ page }) => {
  await loginWithPin(page, PIN.bella);
  await expect(page).toHaveURL(/\/order/);

  await addFirstMenuItem(page);
  await selectTakeaway(page);

  await proceedToPayment(page);

  // Pilih QRIS. Non-cash → langsung bisa bayar tanpa input tendered.
  await page.getByRole("button", { name: "QRIS", exact: true }).click();

  // CardTitle di-render sebagai <div>, bukan heading role. Pakai getByText.
  await expect(page.getByText(/Konfirmasi QRIS/i)).toBeVisible();

  const payBtn = page.getByRole("button", { name: /^Bayar Rp.*— QRIS$/i });
  await expect(payBtn).toBeEnabled();
  await payBtn.click();

  await page.waitForURL(/\/receipt\//, { timeout: 15_000 });
});
