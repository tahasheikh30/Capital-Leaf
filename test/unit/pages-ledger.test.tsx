import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, field, fields, findField, renderApp, uid } from "../utils";

const s = vi.hoisted(() => ({ impl: (async () => ({})) as (p: string, o?: unknown) => Promise<unknown>, peek: vi.fn(() => undefined) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/transactions" }));
vi.mock("@/lib/api", () => ({ api: (p: string, o?: unknown) => s.impl(p, o), peek: s.peek, setApiSpace: vi.fn(), clearApiCache: vi.fn(), requestsWaiting: () => 0, API_URL: "http://api.test" }));

import AiCategorize from "@/components/AiCategorize";
import CategoriesPage from "@/app/(app)/categories/page";
import IncomePage from "@/app/(app)/income/page";
import TransactionsPage from "@/app/(app)/transactions/page";
import { monthKey } from "@/lib/format";

let api: ReturnType<typeof fakeApi>;
const use = (routes: Parameters<typeof fakeApi>[0]) => { api = fakeApi({ "/households/me": { household: null }, "/ai/status": { available: false, enabled: false }, ...routes }); s.impl = api.impl as typeof s.impl; };
const confirmYes = () => vi.stubGlobal("confirm", vi.fn(() => true));
beforeEach(() => { s.peek.mockReturnValue(undefined); confirmYes(); });

const CATS = [{ id: uid(10), name: "Food", color: "#112233" }, { id: uid(11), name: "Fuel", color: "#445566" }];
const SRC = [{ id: uid(20), name: "Salary", kind: "job", expected_monthly: 100000 }, { id: uid(21), name: "Freelance", kind: "side_hustle", expected_monthly: 20000 }];
const tx = (n: number, type: "income" | "expense", amount: number, extra: Record<string, unknown> = {}) => ({ id: uid(100 + n), type, amount, occurred_on: "2026-11-0" + (n % 9 + 1), note: null, category_id: null, income_source_id: null, recurring_id: null, ...extra });
const month = monthKey(new Date());
const TX = [tx(1, "income", 100000, { income_source_id: uid(20), note: "Pay" }), tx(2, "expense", 2500, { category_id: uid(10), note: "Lunch" }), tx(3, "expense", 700), tx(4, "expense", 300, { recurring_id: uid(1), category_id: uid(11) })];

describe("Transactions page", () => {
  beforeEach(() => use({ [`/transactions?month=${month}`]: TX, "/categories": CATS, "/income-sources": SRC, "/assets": [] }));
  const open = async () => { renderApp(<TransactionsPage />); await screen.findByText("Lunch"); };

  it("lists the month with earned and spent totals", async () => {
    await open();
    expect(screen.getByText("Earned").nextSibling).toHaveTextContent(/100,000/);
    expect(screen.getByText("Spent").nextSibling).toHaveTextContent(/3,500/);
    expect(screen.getAllByRole("row")).toHaveLength(5);
  });
  it("names each row's category or source, with note and repeat marker", async () => {
    await open();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Salary");
    expect(rows[0]).toHaveTextContent("Pay");
    expect(rows[1]).toHaveTextContent("Food");
    expect(rows[2]).toHaveTextContent("Uncategorized");
    expect(rows[3]).toHaveTextContent("Repeats automatically");
  });
  it("shows income with a plus and expenses with a minus", async () => {
    await open();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0].querySelector("td.pos")).toHaveTextContent(/^\+/);
    expect(rows[1].querySelector("td.neg")).toHaveTextContent(/^-/);
  });
  it("says so when the month is empty", async () => {
    use({ [`/transactions?month=${month}`]: [], "/categories": [], "/income-sources": [] });
    renderApp(<TransactionsPage />);
    expect(await screen.findByText("Nothing recorded for this month.")).toBeInTheDocument();
  });
  it("loads another month", async () => {
    await open();
    fireEvent.change(document.querySelector('input[type="month"]')!, { target: { value: "2026-10" } });
    await waitFor(() => expect(api.calls.some((c) => c.path === "/transactions?month=2026-10")).toBe(true));
  });
  it("adds an expense with a category", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    await userEvent.type(field("Amount"), "450.5");
    await userEvent.selectOptions(field("Category"), uid(11));
    await userEvent.type(field("Note"), "Petrol");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.sent("POST", "/transactions")).toHaveLength(1));
    expect(api.sent("POST", "/transactions")[0].body).toMatchObject({ type: "expense", amount: 450.5, note: "Petrol", category_id: uid(11), income_source_id: null });
    expect(await screen.findByRole("status")).toHaveTextContent("Transaction added");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("adds income from a source, with part moved to savings", async () => {
    use({ [`/transactions?month=${month}`]: TX, "/categories": CATS, "/income-sources": SRC, "/assets": [{ id: uid(1), kind: "cash", name: "Bank", amount: 1 }], "POST /transactions": { savings: [{ asset_name: "Bank" }] } });
    await open();
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    await userEvent.selectOptions(field("Type"), "income");
    await userEvent.type(field("Amount"), "5000");
    await userEvent.selectOptions(field("Source"), uid(21));
    await userEvent.click(screen.getByLabelText(/Move part of this to savings/));
    await userEvent.type(field("Amount to move"), "1000");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.sent("POST", "/transactions")).toHaveLength(1));
    expect(api.sent("POST", "/transactions")[0].body).toMatchObject({ type: "income", amount: 5000, income_source_id: uid(21), category_id: null, savings: [{ amount: 1000, asset_id: uid(1) }] });
    expect(await screen.findByRole("status")).toHaveTextContent(/1,000.* moved to Bank/);
  });
  it("does not offer savings inside a household", async () => {
    localStorage.setItem("cl-space", uid(5));
    use({ "/households/me": { household: { id: uid(5), name: "Home", role: "owner", members: [], invites: [], limits: { members: 6 } } }, [`/transactions?month=${month}`]: TX, "/categories": CATS, "/income-sources": SRC });
    renderApp(<TransactionsPage />);
    await screen.findByText("Lunch");
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    await userEvent.selectOptions(field("Type"), "income");
    expect(screen.queryByLabelText(/Move part of this to savings/)).toBeNull();
  });
  it("shows an error toast when saving fails and keeps the form open", async () => {
    use({ [`/transactions?month=${month}`]: TX, "/categories": CATS, "/income-sources": SRC, "POST /transactions": new Error("Amount is too large") });
    await open();
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    await userEvent.type(field("Amount"), "5");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Amount is too large");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("blocks moving more to savings than the income", async () => {
    use({ [`/transactions?month=${month}`]: TX, "/categories": CATS, "/income-sources": SRC, "/assets": [{ id: uid(1), kind: "cash", name: "Bank", amount: 1 }] });
    await open();
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    await userEvent.selectOptions(field("Type"), "income");
    await userEvent.type(field("Amount"), "100");
    await userEvent.click(screen.getByLabelText(/Move part of this to savings/));
    await userEvent.type(field("Amount to move"), "500");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("cannot move more to savings");
    expect(api.sent("POST", "/transactions")).toHaveLength(0);
  });
  it("edits a transaction, with the type locked", async () => {
    await open();
    await userEvent.click(within(screen.getAllByRole("row")[2]).getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Edit transaction" })).toBeInTheDocument();
    expect(field("Type")).toBeDisabled();
    expect(field("Amount")).toHaveValue(2500);
    expect(field("Note")).toHaveValue("Lunch");
    await userEvent.clear(field("Amount")); await userEvent.type(field("Amount"), "2600");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.sent("PATCH", `/transactions/${uid(102)}`)).toHaveLength(1));
    expect(api.sent("PATCH", `/transactions/${uid(102)}`)[0].body).toMatchObject({ amount: 2600, category_id: uid(10) });
    expect(await screen.findByRole("status")).toHaveTextContent("Transaction updated");
  });
  it("cancelling an edit closes the form without saving", async () => {
    await open();
    await userEvent.click(within(screen.getAllByRole("row")[2]).getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.sent("PATCH", `/transactions/${uid(102)}`)).toHaveLength(0);
  });
  it("opening Add after an edit starts blank", async () => {
    await open();
    await userEvent.click(within(screen.getAllByRole("row")[2]).getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    expect(field("Amount")).toHaveValue(null);
    expect(field("Type")).toBeEnabled();
  });
  it("deletes after confirming", async () => {
    await open();
    await userEvent.click(within(screen.getAllByRole("row")[3]).getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith("Delete this transaction?");
    await waitFor(() => expect(api.sent("DELETE", `/transactions/${uid(103)}`)).toHaveLength(1));
    expect(await screen.findByRole("status")).toHaveTextContent("Transaction deleted");
  });
  it("does not delete when declined", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    await open();
    await userEvent.click(within(screen.getAllByRole("row")[3]).getByRole("button", { name: "Delete" }));
    expect(api.calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
  });
  it("shows a delete error", async () => {
    use({ [`/transactions?month=${month}`]: TX, "/categories": CATS, "/income-sources": SRC, "DELETE /transactions/00000000-0000-4000-8000-000000000103": new Error("Cannot delete") });
    await open();
    await userEvent.click(within(screen.getAllByRole("row")[3]).getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot delete");
  });
  it("shows fifty at a time", async () => {
    const many = Array.from({ length: 120 }, (_, i) => tx(i + 10, "expense", 1, { note: `Item ${i}` }));
    use({ [`/transactions?month=${month}`]: many, "/categories": CATS, "/income-sources": SRC });
    renderApp(<TransactionsPage />);
    await screen.findByText("Item 0");
    expect(screen.getAllByRole("row")).toHaveLength(51);
    await userEvent.click(screen.getByRole("button", { name: "Show more (70 left)" }));
    expect(screen.getAllByRole("row")).toHaveLength(101);
    await userEvent.click(screen.getByRole("button", { name: "Show more (20 left)" }));
    expect(screen.getAllByRole("row")).toHaveLength(121);
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
  });
  it("shows a load error", async () => {
    use({ [`/transactions?month=${month}`]: new Error("Cannot reach the server."), "/categories": CATS, "/income-sources": SRC });
    renderApp(<TransactionsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Add$/ }));
    expect(await screen.findByText("Cannot reach the server.")).toBeInTheDocument();
  });
  it("shows cached rows straight away", () => {
    s.peek.mockImplementation(((p: string) => (p.startsWith("/transactions") ? [tx(1, "expense", 9, { note: "Cached note" })] : undefined)) as never);
    use({ [`/transactions?month=${month}`]: new Promise(() => {}) as never });
    renderApp(<TransactionsPage />);
    expect(screen.getByText("Cached note")).toBeInTheDocument();
  });
});

describe("AiCategorize", () => {
  const uncategorised = [tx(1, "expense", 100, { note: "Careem ride" }), tx(2, "expense", 200, { note: "Gym" }), tx(3, "expense", 5, { note: "   " }), tx(4, "expense", 5, { category_id: uid(10), note: "Done" }), tx(5, "income", 5, { note: "Pay" })];
  const run = (items = uncategorised, status = { available: true, enabled: true }, extra = {}) => {
    use({ "/ai/status": status, "/categories": CATS, ...extra });
    const onApplied = vi.fn();
    renderApp(<AiCategorize items={items as never} cats={CATS as never} onApplied={onApplied} />);
    return onApplied;
  };
  it("stays hidden when AI is not set up", async () => { run(uncategorised, { available: false, enabled: false }); await waitFor(() => expect(api.sent("GET", "/ai/status")).toHaveLength(1)); expect(screen.queryByText(/without a category/)).toBeNull(); });
  it("stays hidden when nothing needs a category", async () => { run([tx(1, "expense", 5, { category_id: uid(10), note: "x" })]); await waitFor(() => expect(api.sent("GET", "/ai/status")).toHaveLength(1)); expect(screen.queryByText(/without a category/)).toBeNull(); });
  it("counts only notes that are not blank and not already categorised", async () => { run(); expect(await screen.findByText("2 expenses without a category.")).toBeInTheDocument(); });
  it("uses the singular for one", async () => { run([uncategorised[0]]); expect(await screen.findByText("1 expense without a category.")).toBeInTheDocument(); });
  it("points to Settings when AI is available but off", async () => {
    run(uncategorised, { available: true, enabled: false });
    expect(await screen.findByRole("link", { name: "Turn on AI in Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("button", { name: "Suggest categories" })).toBeNull();
  });
  it("suggests, lets you review, and applies the chosen ones", async () => {
    const onApplied = run(uncategorised, { available: true, enabled: true }, { "POST /ai/categorize": { suggestions: [{ key: uid(101), category_id: uid(11), source: "ai" }, { key: uid(102), category_id: uid(10), source: "history" }] } });
    await userEvent.click(await screen.findByRole("button", { name: "Suggest categories" }));
    expect(await screen.findByText("Suggested categories")).toBeInTheDocument();
    expect(api.sent("POST", "/ai/categorize")[0].body).toEqual({ items: [{ key: uid(101), note: "Careem ride" }, { key: uid(102), note: "Gym" }] });
    expect(screen.getByText(/AI guess/)).toBeInTheDocument();
    expect(screen.getByText(/like before/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Apply to Gym"));
    await userEvent.click(screen.getByRole("button", { name: "Apply selected" }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(api.sent("POST", "/transactions/bulk-category")[0].body).toEqual({ assignments: [{ id: uid(101), category_id: uid(11) }] });
    expect(await screen.findByRole("status")).toHaveTextContent("1 expense categorized");
  });
  it("lets you change a suggested category before applying", async () => {
    run(uncategorised, { available: true, enabled: true }, { "POST /ai/categorize": { suggestions: [{ key: uid(101), category_id: uid(11), source: "ai" }] } });
    await userEvent.click(await screen.findByRole("button", { name: "Suggest categories" }));
    await userEvent.selectOptions(await screen.findByRole("combobox"), uid(10));
    await userEvent.click(screen.getByRole("button", { name: "Apply selected" }));
    await waitFor(() => expect(api.sent("POST", "/transactions/bulk-category")).toHaveLength(1));
    expect(api.sent("POST", "/transactions/bulk-category")[0].body).toEqual({ assignments: [{ id: uid(101), category_id: uid(10) }] });
  });
  it("saves nothing if everything is unticked", async () => {
    run(uncategorised, { available: true, enabled: true }, { "POST /ai/categorize": { suggestions: [{ key: uid(101), category_id: uid(11), source: "ai" }] } });
    await userEvent.click(await screen.findByRole("button", { name: "Suggest categories" }));
    await userEvent.click(await screen.findByLabelText("Apply to Careem ride"));
    await userEvent.click(screen.getByRole("button", { name: "Apply selected" }));
    expect(api.sent("POST", "/transactions/bulk-category")).toHaveLength(0);
    expect(screen.queryByText("Suggested categories")).toBeNull();
  });
  it("cancel discards the suggestions", async () => {
    run(uncategorised, { available: true, enabled: true }, { "POST /ai/categorize": { suggestions: [{ key: uid(101), category_id: uid(11), source: "ai" }] } });
    await userEvent.click(await screen.findByRole("button", { name: "Suggest categories" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("button", { name: "Suggest categories" })).toBeInTheDocument();
    expect(api.sent("POST", "/transactions/bulk-category")).toHaveLength(0);
  });
  it("says when there are no confident suggestions", async () => {
    run(uncategorised, { available: true, enabled: true }, { "POST /ai/categorize": { suggestions: [{ key: uid(101), category_id: null, source: "ai" }] } });
    await userEvent.click(await screen.findByRole("button", { name: "Suggest categories" }));
    expect(await screen.findByRole("status")).toHaveTextContent("No confident suggestions this time");
  });
  it("shows a suggestion error", async () => {
    run(uncategorised, { available: true, enabled: true }, { "POST /ai/categorize": new Error("AI limit reached") });
    await userEvent.click(await screen.findByRole("button", { name: "Suggest categories" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("AI limit reached");
  });
  it("sends at most thirty notes, trimmed to 200 characters", async () => {
    const lots = Array.from({ length: 40 }, (_, i) => tx(i + 1, "expense", 1, { note: "n".repeat(300) }));
    run(lots as never, { available: true, enabled: true }, { "POST /ai/categorize": { suggestions: [] } });
    await userEvent.click(await screen.findByRole("button", { name: "Suggest categories" }));
    await waitFor(() => expect(api.sent("POST", "/ai/categorize")).toHaveLength(1));
    const items = (api.sent("POST", "/ai/categorize")[0].body as { items: { note: string }[] }).items;
    expect(items).toHaveLength(30);
    expect(items[0].note).toHaveLength(200);
  });
});

describe("Categories page", () => {
  beforeEach(() => use({ "/categories": CATS }));
  it("lists categories with a count", async () => {
    renderApp(<CategoriesPage />);
    expect(await screen.findByText("Food")).toBeInTheDocument();
    expect(screen.getByText("Fuel")).toBeInTheDocument();
    expect(screen.getByText("2 categories")).toBeInTheDocument();
  });
  it("says so when there are none", async () => { use({ "/categories": [] }); renderApp(<CategoriesPage />); expect(await screen.findByText("No categories yet.")).toBeInTheDocument(); });
  it("adds a category with a colour", async () => {
    renderApp(<CategoriesPage />); await screen.findByText("Food");
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    await userEvent.type(field("Name"), "Health");
    fireEvent.change(field("Colour"), { target: { value: "#ff0000" } });
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.sent("POST", "/categories")).toHaveLength(1));
    expect(api.sent("POST", "/categories")[0].body).toEqual({ name: "Health", color: "#ff0000" });
    expect(await screen.findByRole("status")).toHaveTextContent("Category added");
  });
  it("starts with the default colour and a 40 character limit", async () => {
    renderApp(<CategoriesPage />); await screen.findByText("Food");
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    expect(field("Colour")).toHaveValue("#8fa98a");
    expect(field("Name")).toHaveAttribute("maxLength", "40");
    expect(field("Name")).toBeRequired();
  });
  it("edits a category", async () => {
    renderApp(<CategoriesPage />); await screen.findByText("Food");
    await userEvent.click(within(screen.getAllByRole("row")[1]).getByRole("button", { name: "Edit" }));
    expect(field("Name")).toHaveValue("Food");
    await userEvent.clear(field("Name")); await userEvent.type(field("Name"), "Groceries");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.sent("PATCH", `/categories/${uid(10)}`)).toHaveLength(1));
    expect(api.sent("PATCH", `/categories/${uid(10)}`)[0].body).toEqual({ name: "Groceries", color: "#112233" });
  });
  it("deletes after confirming, and explains what happens to expenses", async () => {
    renderApp(<CategoriesPage />); await screen.findByText("Food");
    await userEvent.click(within(screen.getAllByRole("row")[2]).getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Past expenses stay"));
    await waitFor(() => expect(api.sent("DELETE", `/categories/${uid(11)}`)).toHaveLength(1));
  });
  it("shows the server's error when adding fails", async () => {
    use({ "/categories": CATS, "POST /categories": new Error("That already exists") });
    renderApp(<CategoriesPage />); await screen.findByText("Food");
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    await userEvent.type(field("Name"), "Food");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That already exists");
  });
});

describe("Income sources page", () => {
  beforeEach(() => use({ "/income-sources": SRC }));
  it("lists sources with their type and the expected total", async () => {
    renderApp(<IncomePage />);
    expect(await screen.findByText("Salary")).toBeInTheDocument();
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Permanent job")).toBeInTheDocument();
    expect(table.getByText("Side hustle")).toBeInTheDocument();
    expect(screen.getByText(/Expected monthly total:.*120,000/)).toBeInTheDocument();
  });
  it("says so when there are none", async () => { use({ "/income-sources": [] }); renderApp(<IncomePage />); expect(await screen.findByText(/No income sources yet/)).toBeInTheDocument(); });
  it("adds a source", async () => {
    renderApp(<IncomePage />); await screen.findByText("Salary");
    await userEvent.type(field("Name"), "Rent");
    await userEvent.selectOptions(field("Type"), "investment");
    await userEvent.type(field("Expected monthly"), "30000");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.sent("POST", "/income-sources")).toHaveLength(1));
    expect(api.sent("POST", "/income-sources")[0].body).toEqual({ name: "Rent", kind: "investment", expected_monthly: 30000 });
    expect(await screen.findByRole("status")).toHaveTextContent("Income source added");
    expect(field("Name")).toHaveValue("");
  });
  it("treats an empty expected amount as zero", async () => {
    renderApp(<IncomePage />); await screen.findByText("Salary");
    await userEvent.type(field("Name"), "Gift"); await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.sent("POST", "/income-sources")).toHaveLength(1));
    expect((api.sent("POST", "/income-sources")[0].body as { expected_monthly: number }).expected_monthly).toBe(0);
  });
  it("offers all four types", async () => {
    renderApp(<IncomePage />); await screen.findByText("Salary");
    expect(within(field("Type")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Permanent job", "Side hustle", "Investment", "Other"]);
  });
  it("edits a source, scrolling to the form", async () => {
    renderApp(<IncomePage />); await screen.findByText("Salary");
    await userEvent.click(within(screen.getAllByRole("row")[1]).getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Edit source" })).toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenCalled();
    await userEvent.clear(field("Expected monthly")); await userEvent.type(field("Expected monthly"), "110000");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.sent("PATCH", `/income-sources/${uid(20)}`)).toHaveLength(1));
    expect(api.sent("PATCH", `/income-sources/${uid(20)}`)[0].body).toEqual({ name: "Salary", kind: "job", expected_monthly: 110000 });
  });
  it("cancel leaves edit mode", async () => {
    renderApp(<IncomePage />); await screen.findByText("Salary");
    await userEvent.click(within(screen.getAllByRole("row")[1]).getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Add a source" })).toBeInTheDocument();
  });
  it("deletes after confirming", async () => {
    renderApp(<IncomePage />); await screen.findByText("Salary");
    await userEvent.click(within(screen.getAllByRole("row")[2]).getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Past transactions stay"));
    await waitFor(() => expect(api.sent("DELETE", `/income-sources/${uid(21)}`)).toHaveLength(1));
  });
  it("shows a save error", async () => {
    use({ "/income-sources": SRC, "POST /income-sources": new Error("Name already used") });
    renderApp(<IncomePage />); await screen.findByText("Salary");
    await userEvent.type(field("Name"), "Salary"); await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Name already used");
  });
  it("shows a load error", async () => {
    use({ "/income-sources": new Error("Cannot reach the server.") });
    renderApp(<IncomePage />);
    expect(await screen.findByText("Cannot reach the server.")).toBeInTheDocument();
  });
});
