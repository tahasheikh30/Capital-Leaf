import { expect, test } from "@playwright/test";
import { resetBackend, signIn, watchErrors } from "./helpers";

test.beforeEach(async ({ page }) => { await resetBackend(page); });

test.describe("Google sign-in", () => {
  test("login and sign up offer it", async ({ page }) => {
    for (const path of ["/login", "/signup"]) {
      await page.goto(path);
      await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    }
  });
});

test.describe("two-step sign-in", () => {
  test("a session that still owes its code is sent to the code page, and the right code opens the app", async ({ page }) => {
    const errors = watchErrors(page);
    await page.request.post("http://localhost:4010/__mfa");
    await signIn(page, { mfa: true });
    await page.goto("/budget");
    await expect(page).toHaveURL(/\/verify/);
    await page.getByLabel("Authentication code").fill("000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.locator(".error")).toContainText("did not work");
    await page.getByLabel("Authentication code").fill("123456");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/budget");
    await expect(page).toHaveURL(/\/budget/);
    expect(errors.filter((e) => !/400|mfa|Invalid TOTP/i.test(e))).toEqual([]);
  });

  test("it can be set up from settings", async ({ page }) => {
    await signIn(page);
    await page.goto("/settings#data");
    await page.getByRole("button", { name: "Set up two-step sign-in" }).click();
    await expect(page.getByAltText("QR code for your authenticator app")).toBeVisible();
    await expect(page.getByText("JBSWY3DPEHPK3PXP")).toBeVisible();
    await page.getByLabel("Code from your app").fill("123456");
    await page.getByRole("button", { name: "Turn on", exact: true }).click();
    await expect(page.getByText("Two-step sign-in is on")).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn off" })).toBeVisible();
  });
});

test.describe("app lock", () => {
  test("a PIN locks the app on every open and unlocks it", async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page);
    await page.goto("/settings#data");
    await page.getByLabel(/Choose a PIN/).fill("4827");
    await page.getByLabel("Repeat the PIN").fill("4827");
    await page.getByRole("button", { name: "Turn on app lock" }).click();
    await expect(page.getByText("App lock is on")).toBeVisible();

    await page.reload();
    const lock = page.getByRole("dialog", { name: "CoinLeaf is locked" });
    await expect(lock).toBeVisible();
    await lock.getByLabel("PIN").fill("1111");
    await lock.getByRole("button", { name: "Unlock" }).click();
    await expect(lock.getByRole("alert")).toContainText("9 tries left");
    await lock.getByLabel("PIN").fill("4827");
    await lock.getByRole("button", { name: "Unlock" }).click();
    await expect(lock).toBeHidden();
    await expect(page.getByRole("heading", { name: /Settings/ }).first()).toBeVisible();

    // The page behind the lock cannot be used while locked.
    await page.getByRole("button", { name: "Lock now" }).click();
    await expect(lock).toBeVisible();
    await expect(page.locator(".shell")).toHaveAttribute("inert", "");
    await page.getByLabel("PIN").fill("4827");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(lock).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("turning it off removes the lock", async ({ page }) => {
    await signIn(page);
    await page.goto("/settings#data");
    await page.getByLabel(/Choose a PIN/).fill("4827");
    await page.getByLabel("Repeat the PIN").fill("4827");
    await page.getByRole("button", { name: "Turn on app lock" }).click();
    await page.getByRole("button", { name: "Turn off app lock" }).click();
    await page.reload();
    await expect(page.getByRole("heading", { name: /Settings/ }).first()).toBeVisible();
    await expect(page.getByRole("dialog", { name: "CoinLeaf is locked" })).toHaveCount(0);
  });
});
