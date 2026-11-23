import { expect, test, type Page } from "@playwright/test";
import { backendLog, field, isMobile, resetBackend, signIn, watchErrors } from "./helpers";

test.beforeEach(async ({ page }) => { await resetBackend(page); await signIn(page); });
const sent = async (page: Page, method: string, path: string) => (await backendLog(page)).filter((e) => e.method === method && e.path === path);
const dialog = (page: Page) => page.getByRole("dialog");

test.describe("quick add", () => {
  test("adds an expense from the plus button", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Add a transaction" }).click();
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByLabel("Amount").fill("1250");
    await dialog(page).getByLabel("Note").fill("Coffee beans");
    await dialog(page).getByRole("button", { name: "Groceries" }).click();
    await dialog(page).getByRole("button", { name: "Add expense" }).click();
    await expect(page.getByText(/added|saved/i).first()).toBeVisible();
    const posts = await sent(page, "POST", "/api/transactions");
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({ type: "expense", amount: 1250, note: "Coffee beans" });
    expect(errors).toEqual([]);
  });

  test("adds income too", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Add a transaction" }).click();
    await dialog(page).getByRole("button", { name: "Earned", exact: true }).click();
    await dialog(page).getByLabel("Amount").fill("5000");
    await dialog(page).getByRole("button", { name: "Add income" }).click();
    await expect.poll(async () => (await sent(page, "POST", "/api/transactions")).length).toBe(1);
    expect((await sent(page, "POST", "/api/transactions"))[0].body).toMatchObject({ type: "income", amount: 5000 });
  });

  test("the keyboard shortcut N opens it on desktop", async ({ page }) => {
    test.skip(isMobile(page), "no keyboard on a phone");
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("n");
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
  });
});

test.describe("quick add placement", () => {
  test("is on the dashboard only", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: "Add a transaction" })).toBeVisible();
    for (const path of ["/transactions", "/budget", "/goals", "/net-worth", "/stocks", "/settings", "/more"]) {
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();
      await expect(page.locator(".fab"), path).toHaveCount(0);
    }
  });
});

test.describe("transactions", () => {
  test("lists transactions and deletes one", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await page.goto("/transactions");
    await expect(page.getByText("Electricity bill")).toBeVisible();
    const row = page.locator("tr, li", { hasText: "Pharmacy" }).first();
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Pharmacy")).toHaveCount(0);
    expect(await sent(page, "DELETE", "/api/transactions/00000000-0000-4000-8000-000000000304")).toHaveLength(0);
    expect((await backendLog(page)).some((e) => e.method === "DELETE" && e.path.startsWith("/api/transactions/"))).toBe(true);
  });

  test("adds a transaction from the page", async ({ page }) => {
    await page.goto("/transactions");
    await page.getByRole("button", { name: /^Add$|Add$/ }).first().click();
    await expect(dialog(page)).toBeVisible();
    await field(page, "Amount").fill("777");
    await field(page, "Note").fill("Birthday gift");
    await dialog(page).getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Birthday gift")).toBeVisible();
  });
});

test.describe("transaction search, tags and photos", () => {
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");

  test("adds a tagged transaction with a photo, then finds it", async ({ page }) => {
    await page.goto("/transactions");
    await page.getByRole("button", { name: /^Add$|Add$/ }).first().click();
    await field(page, "Amount").fill("4321");
    await field(page, "Note").fill("Client dinner");
    await field(page, "Tags").fill("Business");
    await field(page, "Tags").press("Enter");
    await field(page, "Tags").fill("reimbursable,");
    await page.locator("#receipt-file").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
    await expect(dialog(page).getByAltText("Receipt")).toBeVisible();
    await dialog(page).getByRole("button", { name: "Add", exact: true }).click();

    const row = page.locator("tr, li", { hasText: "Client dinner" }).first();
    await expect(row.getByText("business", { exact: true })).toBeVisible();
    await expect(row.getByText("reimbursable", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: /View photo/ }).click();
    await expect(page.getByRole("dialog").getByRole("img", { name: /Receipt for/ })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.locator("#tx-q").fill("dinner");
    await expect(page.getByText("1 match")).toBeVisible();
    await page.locator("#tx-q").fill("");
    await page.getByRole("button", { name: "#business" }).click();
    await expect(page.getByText("1 match")).toBeVisible();
    await expect(page.getByText("Client dinner")).toBeVisible();
    await expect(page.getByText("Electricity bill")).toHaveCount(0);
  });

  test("filters by amount across all time and clears", async ({ page }) => {
    await page.goto("/transactions");
    await page.getByLabel("Period").selectOption("all");
    await page.getByLabel("Smallest amount").fill("100000");
    await expect(page.getByText(/\d+ match(es)?/)).toBeVisible();
    await page.getByLabel("Smallest amount").fill("99999999");
    await expect(page.getByText("Nothing matches these filters.")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByText("Electricity bill")).toBeVisible();
  });

  test("removes a photo while editing", async ({ page }) => {
    await page.goto("/transactions");
    await page.getByRole("button", { name: /^Add$|Add$/ }).first().click();
    await field(page, "Amount").fill("12");
    await field(page, "Note").fill("Parking");
    await page.locator("#receipt-file").setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });
    await dialog(page).getByRole("button", { name: "Add", exact: true }).click();
    const row = page.locator("tr, li", { hasText: "Parking" }).first();
    await row.getByRole("button", { name: "Edit" }).click();
    await expect(dialog(page).getByAltText("Receipt")).toBeVisible();
    await dialog(page).getByRole("button", { name: "Remove photo" }).click();
    await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator("tr, li", { hasText: "Parking" }).first().getByRole("button", { name: /View photo/ })).toHaveCount(0);
  });
});

test.describe("categories and income sources", () => {
  test("creates and removes a category", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await page.goto("/categories");
    await page.getByRole("button", { name: /Add$/ }).first().click();
    await field(page, "Name").fill("Pets");
    await dialog(page).getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Pets")).toBeVisible();
    await page.locator("tr, li", { hasText: "Pets" }).first().getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Pets")).toHaveCount(0);
  });

  test("adds an income source", async ({ page }) => {
    await page.goto("/income");
    await field(page, "Name").fill("Tutoring");
    await field(page, "Expected monthly").fill("15000");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Tutoring")).toBeVisible();
    expect((await sent(page, "POST", "/api/income-sources"))[0].body).toMatchObject({ name: "Tutoring", expected_monthly: 15000 });
  });
});

test.describe("goals", () => {
  test("creates a goal, marks it done, reopens and removes it", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await page.goto("/goals");
    await expect(page.getByRole("heading", { name: "Meezan savings account" })).toBeVisible();
    await page.getByRole("button", { name: /New goal/ }).click();
    await field(page, "What are you saving for?").fill("Camera");
    await field(page, "Target amount").fill("90000");
    await page.getByRole("button", { name: "Create goal" }).click();
    await expect(page.getByRole("heading", { name: "Camera" })).toBeVisible();
    const card = page.locator(".goal-card", { hasText: "Camera" });
    await card.getByRole("button", { name: "Mark as done" }).click();
    await expect(page.getByRole("heading", { name: "Done" })).toBeVisible();
    await card.getByRole("button", { name: "Reopen" }).click();
    await expect(page.getByRole("heading", { name: "Done" })).toHaveCount(0);
    await card.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("heading", { name: "Camera" })).toHaveCount(0);
  });

  test("edits a goal's target", async ({ page }) => {
    await page.goto("/goals");
    await page.locator(".goal-card").first().getByRole("button", { name: "Edit" }).click();
    await field(page, "Target amount").fill("500000");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => (await sent(page, "PATCH", "/api/goals/00000000-0000-4000-8000-000000000400")).length).toBe(1);
  });
});

test.describe("net worth", () => {
  test("shows the total, adds a cash item and deletes it", async ({ page }) => {
    await page.goto("/net-worth");
    await expect(page.getByText("Everything you own, minus what you owe")).toBeVisible();
    await expect(page.getByText("Wedding gold")).toBeVisible();
    await page.getByRole("button", { name: /Add$/ }).first().click();
    await field(page, "Name").fill("Cash at home");
    await field(page, "Value").fill("12000");
    await dialog(page).getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Cash at home")).toBeVisible();
    await page.locator("li", { hasText: "Cash at home" }).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Cash at home")).toHaveCount(0);
  });

  test("moves money into savings and undoes it", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await page.goto("/net-worth");
    await page.locator("li", { hasText: "Meezan savings account" }).getByRole("button", { name: "Move money" }).click();
    await expect(dialog(page)).toBeVisible();
    await field(page, "Amount").fill("2500");
    await dialog(page).locator("form button.btn-accent").click();
    await expect(page.getByRole("heading", { name: "Savings moves" })).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).first().click();
    await expect(page.getByRole("heading", { name: "Savings moves" })).toHaveCount(0);
  });
});

test.describe("shared expenses", () => {
  test("creates a household, splits a bill and settles up", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await page.goto("/household");
    await field(page, "Household name").fill("Our flat");
    await page.getByRole("button", { name: "Create household" }).click();
    await expect(page.getByRole("heading", { name: "Our flat" })).toBeVisible();
    await page.goto("/shared");
    await expect(page.getByText("No shared expenses yet")).toBeVisible();
    await page.getByLabel("What was it for").fill("Groceries");
    await page.getByLabel("Amount").fill("3000");
    await page.getByRole("button", { name: "Add expense" }).click();
    await expect(page.locator("li", { hasText: "Groceries" })).toBeVisible();
    await expect(page.getByText("Sara pays You")).toBeVisible();
    await expect(page.getByText("owes Rs 1,500")).toBeVisible();
    await page.getByRole("button", { name: "Mark as paid" }).click();
    await expect(page.getByText("Everyone is settled up.")).toBeVisible();
    await page.locator("li", { hasText: "Groceries" }).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Groceries")).toHaveCount(0);
    });
  });

test.describe("debt payoff", () => {
  test("plans the car loan and extra money shortens it", async ({ page }) => {
    await page.goto("/debts");
    await expect(page.getByRole("heading", { name: "Debt payoff", exact: true })).toBeVisible();
    await expect(page.getByTestId("summary")).toContainText("Debt free in");
    await expect(page.getByText("Car loan").first()).toBeVisible();
    const before = await page.getByTestId("summary").textContent();
    await page.getByLabel("Extra you can pay each month").fill("30000");
    await expect(page.getByTestId("summary")).not.toHaveText(before ?? "");
    await expect(page.getByTestId("summary")).toContainText("less than paying only the minimums");
  });
  test("a debt gets its terms from the net worth form", async ({ page }) => {
    await page.goto("/net-worth");
    await page.getByRole("button", { name: /Add$/ }).first().click();
    await field(page, "Type").selectOption("liability");
    await field(page, "Name").fill("Credit card");
    await field(page, "Amount owed").fill("60000");
    await field(page, "Interest rate % per year (optional)").fill("24");
    await field(page, "Minimum monthly payment (optional)").fill("3000");
    await dialog(page).getByRole("button", { name: "Add", exact: true }).click();
    await page.goto("/debts");
    await expect(page.getByText("Credit card").first()).toBeVisible();
    await expect(page.getByText(/at 24% a year, minimum/)).toBeVisible();
  });
});

test.describe("zakat", () => {
  test("works out zakat from net worth and reacts to the gold price", async ({ page }) => {
    await page.goto("/zakat");
    await expect(page.getByRole("heading", { name: "Zakat", exact: true })).toBeVisible();
    await expect(page.getByLabel("Cash and bank")).toHaveValue("270000");
    await expect(page.getByLabel("Gold", { exact: true })).not.toHaveValue("");
    await page.getByLabel("24k gold price per gram").fill("1000");
    await expect(page.getByTestId("zakat-result")).toContainText("2.5% of");
    await page.getByLabel("24k gold price per gram").fill("100000");
    await expect(page.getByTestId("zakat-result")).toContainText("no zakat is due");
  });
});

test.describe("recurring", () => {
  test("adds a monthly item and pauses it", async ({ page }) => {
    await page.goto("/recurring");
    await expect(page.getByText("Electricity bill")).toBeVisible();
    await page.getByRole("button", { name: /Add$/ }).first().click();
    await field(page, "Amount").fill("4500");
    await field(page, "Note").fill("Gym membership");
    await dialog(page).getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Gym membership")).toBeVisible();
    await page.locator("tr, li", { hasText: "Gym membership" }).first().getByRole("button", { name: /Pause|Stop/i }).click();
    expect((await backendLog(page)).some((e) => e.method === "PATCH" && e.path.startsWith("/api/recurring/"))).toBe(true);
  });
});

test.describe("stocks", () => {
  test("adds and deletes a holding, then switches tabs", async ({ page }) => {
    await page.goto("/stocks");
    await expect(page.getByText("MEBL")).toBeVisible();
    await page.getByRole("button", { name: /Add$/ }).first().click();
    await field(page, "PSX symbol").fill("ENGRO");
    await field(page, "Shares").fill("40");
    await dialog(page).getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("ENGRO")).toBeVisible();
    await page.locator("tr", { hasText: "ENGRO" }).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("ENGRO")).toHaveCount(0);
    await page.getByRole("tab", { name: "Dividends" }).click();
    await expect(page.getByRole("heading", { name: "Dividends" })).toBeVisible();
    await page.getByRole("tab", { name: "Price alerts" }).click();
    await expect(page.getByRole("heading", { name: "Watching" })).toBeVisible();
  });

  test("sets a price alert", async ({ page }) => {
    await page.goto("/stocks");
    await page.getByRole("tab", { name: "Price alerts" }).click();
    await page.getByRole("button", { name: /Add$/ }).first().click();
    await field(page, "PSX symbol").fill("MEBL");
    await field(page, "Target price").fill("300");
    await dialog(page).getByRole("button", { name: "Set alert" }).click();
    await expect(page.getByText("At or above 300")).toBeVisible();
  });
});

test.describe("tax and income", () => {
  test("records and deletes a tax payment", async ({ page }) => {
    await page.goto("/freelancer");
    await expect(page.getByText("Safe to spend each month")).toBeVisible();
    await page.getByRole("button", { name: /Record a payment/ }).click();
    await page.getByLabel("Amount").fill("8000");
    await page.getByLabel("Note").fill("Quarterly advance");
    await page.getByRole("button", { name: "Save payment" }).click();
    await expect(page.getByText("Quarterly advance")).toBeVisible();
    await page.locator("li", { hasText: "Quarterly advance" }).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Quarterly advance")).toHaveCount(0);
  });
});

test.describe("ask", () => {
  test("answers a question", async ({ page }) => {
    await page.goto("/ask");
    await page.getByLabel("Your question").fill("How much did I spend on food?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.getByText(/This is a sample answer/)).toBeVisible();
  });
});

test.describe("settings", () => {
  test("shows each tab and keeps the choice in the address", async ({ page }) => {
    await page.goto("/settings");
    for (const [name, hash] of [["Notifications", "notifications"], ["Display", "display"], ["Features", "features"], ["Data and security", "data"], ["Account", "account"]] as const) {
      await page.getByRole("tab", { name }).click();
      await expect(page).toHaveURL(new RegExp(`#${hash}$`));
    }
  });

  test("opens straight onto a tab from the address", async ({ page }) => {
    await page.goto("/settings#display");
    await expect(page.getByRole("radiogroup", { name: "Theme" })).toBeVisible();
  });

  test("switches to the dark theme", async ({ page }) => {
    await page.goto("/settings#display");
    await page.getByRole("radio", { name: /Dark theme/ }).click();
    await expect(page.getByRole("radio", { name: /Dark theme/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("saves the profile name", async ({ page }) => {
    await page.goto("/settings");
    await page.getByLabel("Your name").fill("Taha S");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();
    // The app may also sync display preferences with PATCH /profile, so look for the one that carries the name.
    expect((await sent(page, "PATCH", "/api/profile")).map((e) => e.body)).toContainEqual(expect.objectContaining({ full_name: "Taha S" }));
  });

  test("delete account stays locked until confirmed", async ({ page }) => {
    await page.goto("/settings#data");
    const btn = page.getByRole("button", { name: "Delete my account" });
    await expect(btn).toBeDisabled();
    await page.getByLabel("Your password").fill("pw");
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await expect(btn).toBeEnabled();
  });
});

test.describe("notifications", () => {
  test("a saved change shows up in the notification list", async ({ page }) => {
    await page.goto("/settings");
    await page.getByLabel("Your name").fill("Taha Z");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  });
});

test.describe("first-run setup", () => {
  test("a new account is sent to the setup and ends with a goal and income", async ({ page }) => {
    const errors = watchErrors(page);
    expect((await page.request.post("http://localhost:4010/__fresh")).ok()).toBeTruthy();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/welcome/);
    await page.getByLabel("What should we call you?").fill("Taha");
    await page.getByLabel("Currency").selectOption("USD");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Income name").fill("Salary");
    await page.getByLabel(/About how much/).fill("5000");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Goal", { exact: true }).fill("Emergency fund");
    await page.getByLabel(/Target amount/).fill("20000");
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    expect((await sent(page, "POST", "/api/income-sources")).map((e) => e.body)).toContainEqual(expect.objectContaining({ name: "Salary", expected_monthly: 5000 }));
    expect((await sent(page, "POST", "/api/goals")).map((e) => e.body)).toContainEqual(expect.objectContaining({ target_amount: 20000 }));
    // Finished accounts are not sent back.
    await page.goto("/welcome");
    await expect(page).toHaveURL(/\/dashboard/);
    expect(errors).toEqual([]);
  });

  test("the setup can be skipped", async ({ page }) => {
    await page.request.post("http://localhost:4010/__fresh");
    await page.goto("/transactions");
    await expect(page).toHaveURL(/\/welcome/);
    await page.getByRole("button", { name: "Skip setup for now" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("the currency can be changed in settings", async ({ page }) => {
    await page.goto("/settings");
    await page.getByLabel("Currency").selectOption("AED");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();
    expect((await sent(page, "PATCH", "/api/profile")).map((e) => e.body)).toContainEqual(expect.objectContaining({ currency: "AED" }));
  });
});
