import { expect, test } from "@playwright/test";
import { PAGES, isMobile, resetBackend, signIn, watchErrors } from "./helpers";

test.beforeEach(async ({ page }) => { await signIn(page); });
test.beforeAll(async ({ request }) => { await request.post("http://localhost:4010/__reset"); });

test.describe("every signed in page", () => {
  for (const name of PAGES) {
    test(`/${name} loads cleanly, fits the screen and has a footer`, async ({ page }) => {
      const errors = watchErrors(page);
      const failed: string[] = [];
      page.on("response", (r) => { if (r.status() >= 400 && r.url().includes("localhost:4010")) failed.push(`${r.status()} ${r.url()}`); });
      await page.goto(`/${name}`);
      await expect(page.locator("h1").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scrolling").toBe(true);
      await expect(page.locator(".site-footer")).toBeVisible();
      expect(failed).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});

test.describe("navigation", () => {
  test("the dashboard shows what is left to spend and the latest activity", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Left to spend this month")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Latest" })).toBeVisible();
    await expect(page.getByText("Monthly groceries")).toBeVisible();
  });

  test("moves between pages with the main navigation", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
    if (isMobile(page)) {
      await nav.getByRole("link", { name: "Activity" }).click();
      await expect(page).toHaveURL(/\/transactions/);
      await nav.getByRole("link", { name: "Budget" }).click();
      await expect(page).toHaveURL(/\/budget/);
      await nav.getByRole("link", { name: "Wealth" }).click();
      await expect(page).toHaveURL(/\/net-worth/);
      await nav.getByRole("link", { name: "More" }).click();
      await expect(page).toHaveURL(/\/more/);
    } else {
      await nav.getByRole("link", { name: "Transactions" }).click();
      await expect(page).toHaveURL(/\/transactions/);
      await nav.getByRole("link", { name: "Goals" }).click();
      await expect(page).toHaveURL(/\/goals/);
      await nav.getByRole("link", { name: "Settings" }).click();
      await expect(page).toHaveURL(/\/settings/);
    }
  });

  test("the More page lists the remaining sections", async ({ page }) => {
    await page.goto("/more");
    for (const l of ["Goals", "Stocks", "Settings"]) await expect(page.getByRole("link", { name: new RegExp(l) }).first()).toBeVisible();
  });

  test("signing out returns to the landing or login page", async ({ page }) => {
    test.skip(isMobile(page), "the sign out button lives in the desktop sidebar");
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /sign out|log out/i }).click();
    await expect(page).toHaveURL(/\/(login)?$/);
  });
});

test("pages stay usable with the sample data reset between runs", async ({ page }) => {
  await resetBackend(page);
  await page.goto("/transactions");
  await expect(page.getByText("Monthly groceries")).toBeVisible();
});
