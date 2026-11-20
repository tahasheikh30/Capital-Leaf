import { expect, test } from "@playwright/test";
import { watchErrors } from "./helpers";

test.describe("public pages", () => {
  test("landing page shows the headline and calls to action", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Make room for what matters.");
    await expect(page.getByRole("link", { name: /Create your free account/ }).first()).toHaveAttribute("href", "/signup");
    await expect(page.getByRole("link", { name: "Log in" }).first()).toHaveAttribute("href", "/login");
    expect(errors).toEqual([]);
  });

  test("landing sections fade in as they are scrolled to", async ({ page }) => {
    await page.goto("/");
    const reveal = page.locator(".lp [data-reveal], .lp .lp-reveal").first();
    if ((await reveal.count()) === 0) test.skip(true, "no reveal elements on this page");
    await reveal.scrollIntoViewIfNeeded();
    await expect(reveal).toBeVisible();
  });

  test("landing page does not scroll sideways", async ({ page }) => {
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  for (const [path, heading] of [["/privacy", "Privacy policy"], ["/terms", "Terms of use"]] as const) {
    test(`${path} renders its policy`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    });
  }

  for (const path of ["/login", "/signup", "/forgot-password"]) {
    test(`${path} shows a form with an email field`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(path);
      await expect(page.locator("form")).toBeVisible();
      await expect(page.locator('input[type="email"]')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test("login links to sign up and password reset", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: /sign up|create/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /forgot/i })).toBeVisible();
  });

  test("an unknown address shows the not found page", async ({ page }) => {
    const res = await page.goto("/definitely-not-a-page");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("link", { name: /home|back|dashboard/i }).first()).toBeVisible();
  });

  test("protected pages send visitors to log in", async ({ page }) => {
    for (const path of ["/dashboard", "/transactions", "/net-worth", "/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test("security headers are set, with a nonce based CSP", async ({ page }) => {
    const res = await page.goto("/login");
    const csp = res?.headers()["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  test("a signed in visitor is taken from login to the dashboard", async ({ page }) => {
    const { signIn } = await import("./helpers");
    await signIn(page);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
