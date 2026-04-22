import { test, expect } from "@playwright/test";

test("03 — akses /order tanpa login redirect ke /login", async ({ page }) => {
  await page.goto("/order");
  await page.waitForURL(/\/login/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /ALLEE Social House/i })).toBeVisible();
});

test("03b — akses /tables tanpa login redirect ke /login", async ({ page }) => {
  await page.goto("/tables");
  await page.waitForURL(/\/login/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /ALLEE Social House/i })).toBeVisible();
});
