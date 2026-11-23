import { expect, test } from "@playwright/test";
import { backendLog, field, isMobile, resetBackend, signIn, watchErrors } from "./helpers";

const API = "http://localhost:4010";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");

test.beforeEach(async ({ page }) => {
  await resetBackend(page);
  await signIn(page);
});

const aiOn = (page: import("@playwright/test").Page) => page.request.patch(`${API}/api/profile`, { data: { ai_enabled: true } });

test.describe("receipt capture", () => {
  test("a photo fills in the expense, which is saved with its photo", async ({ page }) => {
    const errors = watchErrors(page);
    await aiOn(page);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Add a transaction" }).click();
    await page.getByLabel("Receipt photo to read").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText("Receipt photo will be kept with this expense.")).toBeVisible();
    await expect(page.getByLabel("Amount")).toHaveValue("1250.5");
    await expect(page.getByLabel("Note")).toHaveValue("Imtiaz Super Market");
    await expect(page.getByRole("button", { name: "Groceries" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Add expense" }).click();
    await expect(page.getByText("Expense added")).toBeVisible();
    await expect.poll(async () => (await backendLog(page)).filter((e) => e.method === "POST" && /^\/api\/transactions\/.+\/receipt$/.test(e.path)).length).toBe(1);
    const saved = (await backendLog(page)).find((e) => e.method === "POST" && e.path === "/api/transactions");
    expect(saved?.body).toMatchObject({ type: "expense", amount: 1250.5, note: "Imtiaz Super Market" });
    expect(errors).toEqual([]);
  });

  test("the transactions form can scan too", async ({ page }) => {
    await aiOn(page);
    await page.goto("/transactions");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByLabel("Receipt photo to read").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
    await expect(field(page, "Amount")).toHaveValue("1250.5");
    await expect(field(page, "Note")).toHaveValue("Imtiaz Super Market");
    await page.getByRole("button", { name: "Add", exact: true }).last().click();
    await expect.poll(async () => (await backendLog(page)).filter((e) => e.method === "POST" && /^\/api\/transactions\/.+\/receipt$/.test(e.path)).length).toBe(1);
  });

  test("an unreadable photo says so and leaves the form alone", async ({ page }) => {
    await aiOn(page);
    await page.request.get(`${API}/__scan-fails`);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Add a transaction" }).click();
    await page.getByLabel("Receipt photo to read").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText(/could not read a total/)).toBeVisible();
    await expect(page.getByLabel("Amount")).toHaveValue("");
  });

  test("with AI off it points to Settings", async ({ page }) => {
    await page.request.patch(`${API}/api/profile`, { data: { ai_enabled: false } });
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Add a transaction" }).click();
    await expect(page.getByRole("link", { name: "Turn on AI in Settings" })).toBeVisible();
  });
});

test.describe("category limits", () => {
  test("a limit warns at 80 percent, again at 100, and can be edited and removed", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/budget");
    await expect(page.getByText("No limits yet")).toBeVisible();
    await page.getByRole("button", { name: /Add a limit/ }).click();
    await page.getByRole("dialog").getByLabel("Category").selectOption({ label: "Groceries" });
    await page.getByLabel("Monthly limit").fill("20000");
    await page.getByRole("button", { name: "Add limit" }).click();
    await expect(page.getByText(/18,500.* of .*20,000/)).toBeVisible();
    await expect(page.getByText(/Nearly there/)).toBeVisible();
    // 92.5 percent: the warning at 80 arrives without a reload.
    await expect(page.getByText(/Groceries is at 80 percent of its limit/).first()).toBeVisible();

    await page.getByRole("button", { name: "Edit the Groceries limit" }).click();
    await page.getByLabel("Monthly limit").fill("10000");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/8,500.* over/)).toBeVisible();
    await expect(page.getByText(/Groceries has reached its limit/).first()).toBeVisible();

    await page.goto("/notifications");
    await expect(page.getByText("Groceries reached its limit")).toBeVisible();

    await page.goto("/budget");
    await page.getByRole("button", { name: "Remove the Groceries limit" }).click();
    await expect(page.getByText("No limits yet")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a new expense pushes a limit over without leaving the page", async ({ page }) => {
    await page.request.post(`${API}/api/category-budgets`, { data: { category_id: "00000000-0000-4000-8000-000000000101", monthly_limit: 3000 } });
    await page.goto("/transactions");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await field(page, "Amount").fill("2500");
    await field(page, "Category").selectOption({ label: "Transport" });
    await page.getByRole("button", { name: "Add", exact: true }).last().click();
    // 2,400 already spent in Transport plus 2,500 is past 3,000.
    await expect(page.getByText(/Transport has reached its limit/).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("reports", () => {
  test("shows this month against last, downloads the PDF and steps back a month", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect(page.getByText("Spending by category")).toBeVisible();
    await expect(page.getByText(/Monthly groceries/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Next month" })).toBeDisabled();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download PDF/ }).click();
    expect((await download).suggestedFilename()).toMatch(/^coinleaf-report-\d{4}-\d{2}\.pdf$/);

    await page.getByRole("button", { name: "Previous month" }).click();
    await expect(page.getByRole("button", { name: "Next month" })).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test("the monthly email can be switched on and off", async ({ page }) => {
    await page.goto("/reports");
    const sw = page.getByRole("switch", { name: "Email me the monthly report" });
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    expect((await backendLog(page)).some((e) => e.method === "PATCH" && e.path === "/api/profile" && e.body.monthly_report_email === true)).toBe(true);
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");
  });

  test("is reachable from the menu", async ({ page }) => {
    await page.goto("/dashboard");
    if (isMobile(page)) {
      await page.getByRole("link", { name: "More" }).click();
      await page.getByRole("link", { name: /Reports/ }).click();
    } else {
      await page.locator(".sidebar").getByRole("link", { name: "Reports" }).click();
    }
    await expect(page).toHaveURL(/\/reports/);
  });
});
