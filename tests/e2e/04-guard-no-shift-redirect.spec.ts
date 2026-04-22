import { test, expect } from "@playwright/test";
import { loginWithPin, PIN } from "./helpers";

test("04 — login tapi belum buka shift, akses /order redirect ke /shift/open", async ({ page }) => {
  await loginWithPin(page, PIN.bella);
  await expect(page).toHaveURL(/\/shift\/open/);

  // Coba paksa ke /order — shift-guard harus redirect balik ke /shift/open.
  await page.goto("/order");
  await page.waitForURL(/\/shift\/open/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /Buka Shift/i })).toBeVisible();
});
