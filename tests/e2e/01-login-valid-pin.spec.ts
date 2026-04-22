import { test, expect } from "@playwright/test";
import { loginWithPin, PIN } from "./helpers";

test("01 — login dengan PIN valid redirect ke /shift/open", async ({ page }) => {
  await loginWithPin(page, PIN.andi);
  // Kasir belum buka shift di test DB fresh → harus ke /shift/open.
  await expect(page).toHaveURL(/\/shift\/open/);
  await expect(page.getByRole("heading", { name: /Buka Shift/i })).toBeVisible();
  // Header sub-text: "Kasir: <name>" — unik di halaman, tidak bentrok dengan toast.
  await expect(page.getByText(/Kasir:\s*Andi/)).toBeVisible();
});
