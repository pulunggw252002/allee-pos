import { test, expect } from "@playwright/test";
import { typePin, PIN } from "./helpers";

test("02 — PIN salah menampilkan toast error dan tidak redirect", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /ALLEE Social House/i })).toBeVisible();

  await typePin(page, PIN.invalid);

  // Toast sonner muncul — pesan error bebas, cek substring umum.
  const toast = page.locator('[data-sonner-toast]');
  await expect(toast.first()).toBeVisible({ timeout: 10_000 });

  // Tetap di /login, tidak redirect.
  await expect(page).toHaveURL(/\/login/);
});
