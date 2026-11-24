import { expect, test } from "@playwright/test";
import { resetBackend, signIn, watchErrors } from "./helpers";

const API = "http://localhost:4010";
const log = async (page: import("@playwright/test").Page) => (await (await page.request.get(`${API}/__log`)).json()) as { method: string; path: string; body: Record<string, unknown> }[];

test.beforeEach(async ({ page }) => { await resetBackend(page); });

test.describe("offline add and sync", () => {
  test("an entry added with no connection is kept, then sent once when back online", async ({ page, context }) => {
    const errors = watchErrors(page);
    await signIn(page);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Add a transaction" }).click();
    await context.setOffline(true);
    await page.getByLabel("Amount").fill("123");
    await page.getByLabel("Note").fill("Offline tea");
    await page.getByRole("button", { name: "Add expense" }).click();
    await expect(page.getByText("Saved on this device")).toBeVisible();
    await expect(page.locator(".sync-banner")).toContainText("1 entry waiting to sync");
    expect((await log(page)).filter((e) => e.method === "POST" && e.path === "/api/transactions")).toHaveLength(0);

    await context.setOffline(false);
    await expect(page.getByText("1 offline entry synced")).toBeVisible();
    await expect(page.locator(".sync-banner")).toHaveCount(0);
    const posts = (await log(page)).filter((e) => e.method === "POST" && e.path === "/api/transactions");
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({ amount: 123, note: "Offline tea", type: "expense", id: expect.any(String) });

    await page.goto("/transactions");
    await expect(page.getByText("Offline tea")).toBeVisible();
    expect(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|net::/i.test(e))).toEqual([]);
  });

  test("a queued entry survives a reload and can be synced by hand", async ({ page }) => {
    await signIn(page);
    await page.goto("/dashboard");
    // The server cannot be reached, but the app itself is still open.
    await page.route("**/api/transactions", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
    await page.getByRole("button", { name: "Add a transaction" }).click();
    await page.getByLabel("Amount").fill("77");
    await page.getByLabel("Note").fill("Kept");
    await page.getByRole("button", { name: "Add expense" }).click();
    await expect(page.getByText("Saved on this device")).toBeVisible();
    await page.reload();
    await expect(page.locator(".sync-banner")).toContainText("1 entry waiting to sync");
    await page.getByRole("button", { name: "Show" }).click();
    await expect(page.locator(".sync-list")).toContainText("Kept");
    await page.unroute("**/api/transactions");
    await page.getByRole("button", { name: "Sync now" }).click();
    await expect(page.getByText("1 offline entry synced")).toBeVisible();
    const posts = (await log(page)).filter((e) => e.method === "POST" && e.path === "/api/transactions");
    expect(posts).toHaveLength(1);
  });

  test("the same entry sent twice is only saved once", async ({ page }) => {
    await signIn(page);
    const body = { id: "7d0f3b0e-8f4a-4a5c-9c55-0e5f0d6b9a11", type: "expense", amount: 5, occurred_on: "2026-11-20", note: "dup" };
    for (let i = 0; i < 2; i++) await page.request.post(`${API}/api/transactions`, { data: body, headers: { Authorization: "Bearer x" } });
    const rows = await (await page.request.get(`${API}/api/transactions`)).json();
    expect(rows.filter((t: { note: string }) => t.note === "dup")).toHaveLength(1);
  });

  test("the offline page offers the person's categories and income sources", async ({ page }) => {
    await signIn(page);
    await page.goto("/dashboard");
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("coinleaf.lists.")))).toBe(true);
    await page.goto("/offline.html");
    const category = page.getByLabel(/^Category/);
    await expect(category.locator("option")).toContainText(["No category", "Groceries", "Transport"]);
    await expect(page.getByLabel(/^Income source/)).toBeHidden();
    await category.selectOption({ label: "Transport" });
    await page.getByLabel("Amount").fill("320");
    await page.getByRole("button", { name: "Save on this device" }).click();
    await expect(page.locator("#offline-msg")).toContainText("1 waiting to sync");

    await page.getByLabel("Type").selectOption("income");
    await expect(category).toBeHidden();
    await expect(page.getByLabel(/^Income source/)).toBeVisible();
    await expect(page.getByLabel(/^Income source/).locator("option")).toHaveCount(3);

    await page.goto("/dashboard");
    await expect(page.getByText("1 offline entry synced")).toBeVisible();
    const sent = (await log(page)).find((e) => e.method === "POST" && e.path === "/api/transactions" && (e.body as { amount?: number }).amount === 320);
    expect((sent?.body as { category_id?: string }).category_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("the app form still offers categories after the connection drops", async ({ page, context }) => {
    await signIn(page);
    await page.goto("/dashboard");
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("coinleaf.lists.")))).toBe(true);
    await context.route(/localhost:4010\/api\/(categories|income-sources|transactions\?month)/, (r) => r.abort());
    await page.getByRole("button", { name: "Add a transaction" }).click();
    await expect(page.getByRole("button", { name: "Groceries" })).toBeVisible();
    await expect(page.getByText("No categories yet")).toHaveCount(0);
  });

  test("the offline page can note an entry that the app then sends", async ({ page }) => {
    await signIn(page);
    await page.goto("/dashboard");
    await expect(page.locator(".sync-banner")).toHaveCount(0); // lets the app remember who is signed in
    await page.goto("/offline.html");
    await page.getByLabel("Amount").fill("45");
    await page.getByLabel(/Note/).fill("From offline page");
    await page.getByRole("button", { name: "Save on this device" }).click();
    await expect(page.locator("#offline-msg")).toContainText("1 waiting to sync");
    await page.goto("/dashboard");
    await expect(page.getByText("1 offline entry synced")).toBeVisible();
    const posts = (await log(page)).filter((e) => e.method === "POST" && e.path === "/api/transactions");
    expect(posts[0].body).toMatchObject({ amount: 45, note: "From offline page" });
  });
});

test.describe("home screen shortcuts and widget", () => {
  test("the shortcut link opens the add form", async ({ page }) => {
    await signIn(page);
    await page.goto("/dashboard?add=income");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add income" })).toBeVisible();
  });

  test("the manifest lists shortcuts and the widget", async ({ page }) => {
    const m = await (await page.request.get("/manifest.webmanifest")).json();
    expect(m.shortcuts.map((s: { url: string }) => s.url)).toEqual(["/dashboard?add=expense", "/dashboard?add=income", "/glance"]);
    expect(m.widgets[0]).toMatchObject({ tag: "left-to-spend", ms_ac_template: "/widgets/left-to-spend.json" });
    for (const f of ["/widgets/left-to-spend.json", "/widgets/left-to-spend-preview.png", "/glance.webmanifest", "/offline.js"]) expect((await page.request.get(f)).ok(), f).toBeTruthy();
  });

  test("turn the widget on in settings and see the number on the glance page", async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page);
    await page.goto("/settings#data");
    await page.getByRole("button", { name: "Turn on the widget" }).click();
    const link = page.getByLabel("Your widget link");
    await expect(link).toHaveValue(/\/glance#t=clw_/);
    const url = await link.inputValue();

    // The glance page needs no sign-in, only the link.
    const fresh = await page.context().browser()!.newContext();
    const glance = await fresh.newPage();
    await glance.goto(url);
    await expect(glance.getByText(/Left to spend, \d{4}-\d{2}/)).toBeVisible();
    await expect(glance.locator(".glance-amount")).toContainText(/Rs|PKR/);
    await expect(glance.locator('link[rel="manifest"]')).toHaveAttribute("href", "/glance.webmanifest");

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Turn off", exact: true }).click();
    await expect(page.getByRole("button", { name: "Turn on the widget" })).toBeVisible();
    await glance.getByRole("button", { name: "Refresh" }).click();
    await expect(glance.locator(".error")).toContainText("turned off");
    await fresh.close();
    expect(errors.filter((e) => !/401/.test(e))).toEqual([]);
  });

  test("the glance page without a link explains what to do", async ({ page }) => {
    await page.goto("/glance");
    await expect(page.getByText(/Open the widget link/)).toBeVisible();
  });
});
