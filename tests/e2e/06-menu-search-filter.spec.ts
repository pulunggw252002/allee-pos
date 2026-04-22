import { test, expect } from "@playwright/test";
import { loginWithPin, PIN } from "./helpers";

test("06 — cari menu mem-filter produk di grid", async ({ page }) => {
  await loginWithPin(page, PIN.bella);
  await expect(page).toHaveURL(/\/order/);

  // Tunggu menu grid render (ada produk → ada card emoji).
  const cards = page.locator("button:has(.text-3xl)");
  await cards.first().waitFor({ state: "visible" });
  const initialCount = await cards.count();
  expect(initialCount).toBeGreaterThan(0);

  // Cari kata yang tidak mungkin match produk mana pun.
  const search = page.getByPlaceholder("Cari menu…");
  await search.fill("zzzxyznotfound");

  // "Tidak ada menu yang cocok." empty state.
  await expect(page.getByText(/Tidak ada menu yang cocok/i)).toBeVisible();

  // Bersihkan lagi — harus tampil lagi.
  await search.fill("");
  await cards.first().waitFor({ state: "visible" });
  expect(await cards.count()).toBe(initialCount);
});
