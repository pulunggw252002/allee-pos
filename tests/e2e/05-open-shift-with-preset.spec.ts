import { test, expect } from "@playwright/test";
import { loginWithPin, openShiftWithPreset500k, PIN } from "./helpers";

test("05 — buka shift Bella via preset 500k dan lanjut ke /order", async ({ page }) => {
  await loginWithPin(page, PIN.bella);
  await openShiftWithPreset500k(page);

  await expect(page).toHaveURL(/\/order/);
  // Order page: cart panel header "Order Baru".
  await expect(page.getByRole("heading", { name: /Order Baru/i })).toBeVisible();
  // Menu search input.
  await expect(page.getByPlaceholder("Cari menu…")).toBeVisible();
});
