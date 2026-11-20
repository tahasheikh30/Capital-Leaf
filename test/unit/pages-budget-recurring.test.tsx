import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, field, renderApp, uid } from "../utils";

const s = vi.hoisted(() => ({ impl: (async () => ({})) as (p: string, o?: unknown) => Promise<unknown>, peek: vi.fn(() => undefined) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/budget" }));
vi.mock("@/lib/api", () => ({ api: (p: string, o?: unknown) => s.impl(p, o), peek: s.peek, setApiSpace: vi.fn(), clearApiCache: vi.fn(), requestsWaiting: () => 0, API_URL: "http://api.test" }));

import BudgetPage from "@/app/(app)/budget/page";
import RecurringPage from "@/app/(app)/recurring/page";
import { monthKey } from "@/lib/format";

let api: ReturnType<typeof fakeApi>;
const use = (routes: Parameters<typeof fakeApi>[0]) => { api = fakeApi({ "/households/me": { household: null }, ...routes }); s.impl = api.impl as typeof s.impl; };
beforeEach(() => { s.peek.mockReturnValue(undefined); vi.stubGlobal("confirm", vi.fn(() => true)); });
const month = monthKey(new Date());
const SUMMARY_URL = `/budget-rules/summary?month=${month}`;

const summary = (over: Record<string, unknown> = {}) => ({ base: 200000, usingExpected: false, basis: "earned", taxSetAside: 0, allocated: 60000, spendable: 140000, spent: 50000, remaining: 90000, movedToSavings: 0,
  rules: [{ id: uid(1), name: "Savings", mode: "percent", value: 20, amount: 40000 }, { id: uid(2), name: "Family", mode: "fixed", value: 20000, amount: 20000 }], ...over });

describe("Budget page", () => {
  it("shows the four figures and each rule", async () => {
    use({ [SUMMARY_URL]: summary() });
    renderApp(<BudgetPage />);
    expect(await screen.findByText("Savings")).toBeInTheDocument();
    const stat = (label: string) => screen.getByText(label).nextSibling;
    expect(stat("Income")).toHaveTextContent(/200,000/);
    expect(stat("Set aside")).toHaveTextContent(/60,000/);
    expect(stat("Spending budget")).toHaveTextContent(/140,000/);
    expect(stat("Left after spending")).toHaveTextContent(/90,000/);
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByText("Fixed")).toBeInTheDocument();
  });
  it.each([[{ basis: "average" }, /your average monthly income/], [{ basis: "expected", usingExpected: true }, /expected monthly income/], [{}, /income earned this month/]])("explains where the income figure comes from (%j)", async (over, text) => {
    use({ [SUMMARY_URL]: summary(over) });
    renderApp(<BudgetPage />);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });
  it("mentions tax that is also set aside", async () => {
    use({ [SUMMARY_URL]: summary({ taxSetAside: 15000 }) });
    renderApp(<BudgetPage />);
    expect(await screen.findByText(/Set aside \(plus .*15,000.* tax\)/)).toBeInTheDocument();
  });
  it("marks a negative budget and a negative remainder", async () => {
    use({ [SUMMARY_URL]: summary({ spendable: -100, remaining: -50 }) });
    renderApp(<BudgetPage />);
    await screen.findByText("Savings");
    expect(screen.getByText("Spending budget").nextSibling).toHaveClass("neg");
    expect(screen.getByText("Left after spending").nextSibling).toHaveClass("neg");
  });
  it("mentions money moved to savings, or taken back", async () => {
    use({ [SUMMARY_URL]: summary({ movedToSavings: 30000 }) });
    const first = renderApp(<BudgetPage />);
    expect(await screen.findByText(/Includes .*30,000.* moved to savings this month/)).toBeInTheDocument();
    first.unmount();
    use({ [SUMMARY_URL]: summary({ movedToSavings: -4000 }) });
    renderApp(<BudgetPage />);
    expect(await screen.findByText(/Includes .*4,000.* taken back out of savings/)).toBeInTheDocument();
  });
  it("suggests a first rule when there are none", async () => {
    use({ [SUMMARY_URL]: summary({ rules: [] }) });
    renderApp(<BudgetPage />);
    expect(await screen.findByText(/Try adding Savings at 20 percent/)).toBeInTheDocument();
  });
  it("adds a percent rule", async () => {
    use({ [SUMMARY_URL]: summary() });
    renderApp(<BudgetPage />); await screen.findByText("Savings");
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    await userEvent.type(field("Name"), "Giving");
    await userEvent.type(field("Percent"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Add rule" }));
    await waitFor(() => expect(api.sent("POST", "/budget-rules")).toHaveLength(1));
    expect(api.sent("POST", "/budget-rules")[0].body).toEqual({ name: "Giving", mode: "percent", value: 5 });
    expect(await screen.findByRole("status")).toHaveTextContent("Rule added");
  });
  it("switches the value label for a fixed amount", async () => {
    use({ [SUMMARY_URL]: summary() });
    renderApp(<BudgetPage />); await screen.findByText("Savings");
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    await userEvent.selectOptions(field("How"), "fixed");
    expect(field("Amount")).toBeInTheDocument();
    await userEvent.type(field("Name"), "Rent"); await userEvent.type(field("Amount"), "9000");
    await userEvent.click(screen.getByRole("button", { name: "Add rule" }));
    await waitFor(() => expect(api.sent("POST", "/budget-rules")).toHaveLength(1));
    expect(api.sent("POST", "/budget-rules")[0].body).toEqual({ name: "Rent", mode: "fixed", value: 9000 });
  });
  it("edits a rule", async () => {
    use({ [SUMMARY_URL]: summary() });
    renderApp(<BudgetPage />); await screen.findByText("Savings");
    await userEvent.click(within(screen.getAllByRole("row")[1]).getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Edit rule" })).toBeInTheDocument();
    expect(field("Percent")).toHaveValue(20);
    await userEvent.clear(field("Percent")); await userEvent.type(field("Percent"), "25");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.sent("PATCH", `/budget-rules/${uid(1)}`)).toHaveLength(1));
    expect(api.sent("PATCH", `/budget-rules/${uid(1)}`)[0].body).toEqual({ name: "Savings", mode: "percent", value: 25 });
  });
  it("deletes a rule", async () => {
    use({ [SUMMARY_URL]: summary() });
    renderApp(<BudgetPage />); await screen.findByText("Savings");
    await userEvent.click(within(screen.getAllByRole("row")[2]).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.sent("DELETE", `/budget-rules/${uid(2)}`)).toHaveLength(1));
  });
  it("shows the server's error and keeps the form", async () => {
    use({ [SUMMARY_URL]: summary(), "POST /budget-rules": new Error("Percent cannot be over 100") });
    renderApp(<BudgetPage />); await screen.findByText("Savings");
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    await userEvent.type(field("Name"), "Big"); await userEvent.type(field("Percent"), "150");
    await userEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Percent cannot be over 100");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("shows a load error", async () => {
    use({ [SUMMARY_URL]: new Error("Cannot reach the server.") });
    renderApp(<BudgetPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Add$/ }));
    expect(await screen.findByText("Cannot reach the server.")).toBeInTheDocument();
  });
});

const CATS = [{ id: uid(10), name: "Bills", color: "#111111" }];
const SRC = [{ id: uid(20), name: "Salary", kind: "job", expected_monthly: 1 }];
const item = (n: number, over: Record<string, unknown> = {}) => ({ id: uid(300 + n), type: "expense", amount: 5000, note: null, category_id: uid(10), income_source_id: null, frequency: "monthly", start_date: "2026-01-01", end_date: null, next_due: "2026-12-01", active: true, ...over });

describe("Recurring page", () => {
  const ITEMS = [item(1, { note: "House rent" }), item(2, { type: "income", amount: 90000, category_id: null, income_source_id: uid(20), frequency: "weekly" }), item(3, { active: false, category_id: null, note: "Old gym" })];
  beforeEach(() => use({ "/recurring": ITEMS, "/categories": CATS, "/income-sources": SRC }));
  const open = async () => { renderApp(<RecurringPage />); await screen.findByText("House rent"); };

  it("lists items with their label, repeat, next date and signed amount", async () => {
    await open();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Bills");
    expect(rows[0]).toHaveTextContent("Every month");
    expect(rows[0]).toHaveTextContent("2026-12-01");
    expect(rows[0].querySelector("td.neg")).toHaveTextContent(/^-/);
    expect(rows[1]).toHaveTextContent("Salary");
    expect(rows[1]).toHaveTextContent("Every week");
    expect(rows[1].querySelector("td.pos")).toHaveTextContent(/^\+.*90,000/);
  });
  it("shows a paused item as paused and offers to resume", async () => {
    await open();
    const row = screen.getAllByRole("row")[3];
    expect(row).toHaveClass("row-paused");
    expect(row).toHaveTextContent("Paused");
    expect(row).toHaveTextContent("Uncategorized");
    expect(within(row).getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });
  it("falls back to 'Other income' for an income without a source", async () => {
    use({ "/recurring": [item(5, { type: "income", category_id: null, income_source_id: null })], "/categories": CATS, "/income-sources": SRC });
    renderApp(<RecurringPage />);
    expect(await screen.findByText("Other income")).toBeInTheDocument();
  });
  it("says so when empty", async () => { use({ "/recurring": [], "/categories": [], "/income-sources": [] }); renderApp(<RecurringPage />); expect(await screen.findByText(/Nothing repeating yet/)).toBeInTheDocument(); });
  it("adds a monthly bill", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    await userEvent.type(field("Amount"), "1200");
    await userEvent.selectOptions(field("Category"), uid(10));
    fireEvent.change(field("Starts"), { target: { value: "2026-12-05" } });
    await userEvent.type(field("Note"), "Internet");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.sent("POST", "/recurring")).toHaveLength(1));
    expect(api.sent("POST", "/recurring")[0].body).toEqual({ type: "expense", amount: 1200, frequency: "monthly", start_date: "2026-12-05", end_date: null, note: "Internet", category_id: uid(10), income_source_id: null });
    expect(await screen.findByRole("status")).toHaveTextContent("Repeating item added");
  });
  it("adds a repeating income with an end date", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    await userEvent.selectOptions(field("Type"), "income");
    await userEvent.type(field("Amount"), "100");
    await userEvent.selectOptions(field("Repeats"), "weekly");
    await userEvent.selectOptions(field("Source"), uid(20));
    fireEvent.change(field("Ends (optional)"), { target: { value: "2027-01-01" } });
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.sent("POST", "/recurring")).toHaveLength(1));
    expect(api.sent("POST", "/recurring")[0].body).toMatchObject({ type: "income", frequency: "weekly", end_date: "2027-01-01", income_source_id: uid(20), category_id: null });
  });
  it("explains that missed entries are added straight away", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    expect(screen.getByText(/missed entries are added straight away/)).toBeInTheDocument();
  });
  it("edits only what can change: type, repeat and start are locked", async () => {
    await open();
    await userEvent.click(within(screen.getAllByRole("row")[1]).getByRole("button", { name: "Edit" }));
    for (const l of ["Type", "Repeats", "Starts"]) expect(field(l)).toBeDisabled();
    expect(screen.queryByText(/missed entries/)).toBeNull();
    await userEvent.clear(field("Amount")); await userEvent.type(field("Amount"), "5500");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.sent("PATCH", `/recurring/${uid(301)}`)).toHaveLength(1));
    expect(api.sent("PATCH", `/recurring/${uid(301)}`)[0].body).toEqual({ amount: 5500, note: "House rent", end_date: null, category_id: uid(10), income_source_id: null });
  });
  it("pauses an active item and resumes a paused one", async () => {
    await open();
    await userEvent.click(within(screen.getAllByRole("row")[1]).getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(api.sent("PATCH", `/recurring/${uid(301)}`)).toHaveLength(1));
    expect(api.sent("PATCH", `/recurring/${uid(301)}`)[0].body).toEqual({ active: false });
    expect(await screen.findByRole("status")).toHaveTextContent("Paused");
    await userEvent.click(within(screen.getAllByRole("row")[3]).getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(api.sent("PATCH", `/recurring/${uid(303)}`)).toHaveLength(1));
    expect(api.sent("PATCH", `/recurring/${uid(303)}`)[0].body).toEqual({ active: true });
  });
  it("deletes after confirming and says entries already made stay", async () => {
    await open();
    await userEvent.click(within(screen.getAllByRole("row")[1]).getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Entries already created stay"));
    await waitFor(() => expect(api.sent("DELETE", `/recurring/${uid(301)}`)).toHaveLength(1));
  });
  it("does nothing when deleting is declined", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    await open();
    await userEvent.click(within(screen.getAllByRole("row")[1]).getByRole("button", { name: "Delete" }));
    expect(api.calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
  });
  it("shows the server's error when saving fails", async () => {
    use({ "/recurring": ITEMS, "/categories": CATS, "/income-sources": SRC, "POST /recurring": new Error("Start date is too far back") });
    await open();
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    await userEvent.type(field("Amount"), "5");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Start date is too far back");
  });
  it("shows a load error", async () => {
    use({ "/recurring": new Error("Cannot reach the server."), "/categories": CATS, "/income-sources": SRC });
    renderApp(<RecurringPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Add$/ }));
    expect(await screen.findByText("Cannot reach the server.")).toBeInTheDocument();
  });
});
