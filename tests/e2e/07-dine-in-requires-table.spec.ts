import { test, expect } from "@playwright/test";
import { addFirstMenuItem, loginWithPin, PIN } from "./helpers";

test("07 — dine-in tanpa nomor meja → tombol pembayaran disabled + badge warning", async ({ page }) => {
  await loginWithPin(page, PIN.bella);
  await expect(page).toHaveURL(/\/order/);

  await addFirstMenuItem(page);

  // Default orderType = "dine-in"; nomor meja belum diisi.
  const tableInput = page.locator("#table-no");
  await expect(tableInput).toBeVisible();
  await expect(tableInput).toHaveValue("");

  // Badge destructive di area total.
  await expect(page.getByText(/Nomor meja wajib diisi/i)).toBeVisible();

  // Tombol "Lanjutkan ke Pembayaran" harus disabled.
  const payBtn = page.getByRole("button", { name: /Lanjutkan ke Pembayaran/i });
  await expect(payBtn).toBeDisabled();

  // Isi nomor meja → tombol aktif, badge hilang.
  await tableInput.fill("A1");
  await expect(page.getByText(/Nomor meja wajib diisi/i)).toHaveCount(0);
  await expect(payBtn).toBeEnabled();
});
