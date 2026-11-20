import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, field, fields, findField, renderApp, uid } from "../utils";

const h = vi.hoisted(() => ({ impl: (async () => []) as (p: string, o?: unknown) => Promise<unknown>, peek: vi.fn(() => undefined) }));
vi.mock("@/lib/api", () => ({ api: (p: string, o?: unknown) => h.impl(p, o), peek: h.peek, setApiSpace: vi.fn(), clearApiCache: vi.fn() }));

import DashboardGoals from "@/components/DashboardGoals";
import MoveMoney from "@/components/MoveMoney";
import QuickAdd from "@/components/QuickAdd";
import { SavingsSplitFields, useSavingsSplit } from "@/components/SavingsSplit";

const asset = (n: number, kind: string, name: string, amount: number | null) => ({ id: uid(n), kind, name, amount });
const ASSETS = [asset(1, "cash", "Bank", 50000), asset(2, "mutual_fund", "Meezan Fund", 10000), asset(3, "gold", "Gold", null), asset(4, "liability", "Loan", 5000), asset(5, "other", "Bonds", 0)];

let api: ReturnType<typeof fakeApi>;
const use = (routes: Parameters<typeof fakeApi>[0]) => { api = fakeApi(routes); h.impl = api.impl as typeof h.impl; };
beforeEach(() => { h.peek.mockReturnValue(undefined); use({ "/assets": ASSETS }); });

describe("useSavingsSplit", () => {
  const setup = async (income = 1000) => {
    const hook = renderHook(() => useSavingsSplit(true, true));
    await waitFor(() => expect(hook.result.current.targets.length).toBe(3));
    return hook;
  };
  it("only offers cash, funds and other as places to save", async () => {
    const { result } = await setup();
    expect(result.current.targets.map((t) => t.name)).toEqual(["Bank", "Meezan Fund", "Bonds"]);
  });
  it("builds nothing while switched off", async () => { const { result } = await setup(); expect(result.current.build(1000)).toBeNull(); });
  it("asks for an amount", async () => {
    const { result } = await setup(); act(() => result.current.setOn(true));
    expect(result.current.build(1000)).toEqual({ error: "Enter how much to move to savings." });
  });
  it("sends one move to the first item by default", async () => {
    const { result } = await setup(); act(() => result.current.setOn(true));
    act(() => result.current.update(result.current.rows[0].key, { amount: "300" }));
    expect(result.current.build(1000)).toEqual({ savings: [{ amount: 300, asset_id: uid(1) }], total: 300 });
  });
  it("splits across items, each row taking the next free one", async () => {
    const { result } = await setup(); act(() => result.current.setOn(true)); act(() => result.current.add());
    act(() => { result.current.update(result.current.rows[0].key, { amount: "100" }); result.current.update(result.current.rows[1].key, { amount: "200" }); });
    expect(result.current.build(1000)).toEqual({ savings: [{ amount: 100, asset_id: uid(1) }, { amount: 200, asset_id: uid(2) }], total: 300 });
  });
  it("names the row that is missing an amount", async () => {
    const { result } = await setup(); act(() => result.current.setOn(true)); act(() => result.current.add());
    act(() => result.current.update(result.current.rows[0].key, { amount: "100" }));
    expect(result.current.build(1000)).toEqual({ error: "Enter how much to move in row 2." });
  });
  it("refuses the same item twice", async () => {
    const { result } = await setup(); act(() => result.current.setOn(true)); act(() => result.current.add());
    act(() => { for (const r of result.current.rows) result.current.update(r.key, { amount: "10", target: uid(1) }); });
    expect(result.current.build(1000)).toEqual({ error: "Each item can only be used once. Combine the amounts instead." });
  });
  it("needs a name for a new item", async () => {
    const { result } = await setup(); act(() => result.current.setOn(true));
    act(() => result.current.update(result.current.rows[0].key, { amount: "10", target: "new" }));
    expect(result.current.build(1000)).toEqual({ error: "Give the new savings item a name." });
    act(() => result.current.update(result.current.rows[0].key, { newName: "  Rainy day ", newKind: "mutual_fund" }));
    expect(result.current.build(1000)).toEqual({ savings: [{ amount: 10, new_asset: { kind: "mutual_fund", name: "Rainy day" } }], total: 10 });
  });
  it("cannot move more than the income", async () => {
    const { result } = await setup(); act(() => result.current.setOn(true));
    act(() => result.current.update(result.current.rows[0].key, { amount: "1000.01" }));
    expect(result.current.build(1000)).toEqual({ error: "You cannot move more to savings than the income." });
    act(() => result.current.update(result.current.rows[0].key, { amount: "1000" }));
    expect("savings" in (result.current.build(1000) as object)).toBe(true);
  });
  it("limits the rows to five and keeps at least one", async () => {
    const { result } = await setup();
    for (let i = 0; i < 8; i++) act(() => result.current.add());
    expect(result.current.rows).toHaveLength(5);
    for (let i = 0; i < 8; i++) act(() => result.current.remove(result.current.rows[0].key));
    expect(result.current.rows).toHaveLength(1);
  });
  it("reset switches it off and clears the rows", async () => {
    const { result } = await setup(); act(() => result.current.setOn(true)); act(() => result.current.add());
    act(() => result.current.reset());
    expect([result.current.on, result.current.rows.length]).toEqual([false, 1]);
  });
  it("does not load items when closed or unavailable", () => {
    renderHook(() => useSavingsSplit(false, true)); renderHook(() => useSavingsSplit(true, false));
    expect(api.calls).toHaveLength(0);
  });
  it("copes with the items failing to load", async () => {
    use({ "/assets": new Error("down") });
    const { result } = renderHook(() => useSavingsSplit(true, true));
    await waitFor(() => expect(api.calls.length).toBe(1));
    expect(result.current.targets).toEqual([]);
    act(() => result.current.setOn(true)); act(() => result.current.update(result.current.rows[0].key, { amount: "5" }));
    expect(result.current.resolve(0)).toBe("new");
  });
});

function Split({ income }: { income: string }) {
  const s = useSavingsSplit(true, true);
  return <SavingsSplitFields s={s} income={income} />;
}
describe("SavingsSplitFields", () => {
  it("starts collapsed", () => { render(<Split income="1000" />); expect(screen.getByLabelText(/Move part of this to savings/)).not.toBeChecked(); expect(screen.queryByLabelText("Amount to move")).toBeNull(); });
  it("opens a row, and shows what stays as income", async () => {
    render(<Split income="1000" />);
    await userEvent.click(screen.getByLabelText(/Move part of this/));
    await userEvent.type(field("Amount to move"), "250");
    expect(screen.getByText(/750.* stays as income/)).toBeInTheDocument();
  });
  it("warns when over the income", async () => {
    render(<Split income="100" />);
    await userEvent.click(screen.getByLabelText(/Move part of this/));
    await userEvent.type(field("Amount to move"), "150");
    expect(screen.getByText(/50.* over the income/)).toHaveClass("neg");
  });
  it("lists items with short kinds and a new-item choice", async () => {
    render(<Split income="1000" />);
    await userEvent.click(screen.getByLabelText(/Move part of this/));
    const select = await findField("Move it to");
    await waitFor(() => expect(within(select).getByRole("option", { name: "Bank (cash)" })).toBeInTheDocument());
    expect(within(select).getByRole("option", { name: "Meezan Fund (fund)" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "A new savings item" })).toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: /Gold|Loan/ })).toBeNull();
  });
  it("shows name and type fields for a new item", async () => {
    render(<Split income="1000" />);
    await userEvent.click(screen.getByLabelText(/Move part of this/));
    await userEvent.selectOptions(await findField("Move it to"), "new");
    expect(field("Name of the new item")).toBeInTheDocument();
    expect(field("Type")).toBeInTheDocument();
  });
  it("adds and removes parts, up to five", async () => {
    render(<Split income="1000" />);
    await userEvent.click(screen.getByLabelText(/Move part of this/));
    const add = screen.getByRole("button", { name: /Add another item/ });
    for (let i = 0; i < 4; i++) await userEvent.click(add);
    expect(fields("Amount to move")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /Add another item/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Remove part 2" }));
    expect(fields("Amount to move")).toHaveLength(4);
  });
  it("disables an item another part already uses", async () => {
    render(<Split income="1000" />);
    await userEvent.click(screen.getByLabelText(/Move part of this/));
    await userEvent.click(screen.getByRole("button", { name: /Add another item/ }));
    await waitFor(() => expect(fields("Move it to")).toHaveLength(2));
    const [first, second] = fields("Move it to");
    await waitFor(() => expect(first).toHaveValue(uid(1)));
    expect(second).toHaveValue(uid(2));
    expect(within(second).getByRole("option", { name: "Bank (cash)" })).toBeDisabled();
  });
});

describe("MoveMoney", () => {
  const open = (props: Partial<React.ComponentProps<typeof MoveMoney>> = {}) => {
    const onClose = vi.fn(), onDone = vi.fn();
    renderApp(<MoveMoney open onClose={onClose} onDone={onDone} {...props} />);
    return { onClose, onDone };
  };
  it("moves money to an item", async () => {
    const { onDone, onClose } = open();
    await screen.findByRole("option", { name: /Bank, / });
    await userEvent.type(field("Amount"), "1200");
    await userEvent.click(screen.getByRole("button", { name: "Move to savings" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const post = api.sent("POST", "/savings-transfers")[0].body as Record<string, unknown>;
    expect(post).toMatchObject({ direction: "in", amount: 1200, asset_id: uid(1) });
    expect(post.occurred_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(onClose).toHaveBeenCalled();
  });
  it("moves into a new item", async () => {
    open();
    await userEvent.selectOptions(await findField("Move it to"), "new");
    await userEvent.type(field("Amount"), "5");
    await userEvent.type(field("Name of the new item"), "Rainy day");
    await userEvent.selectOptions(field("Type"), "mutual_fund");
    await userEvent.click(screen.getByRole("button", { name: "Move to savings" }));
    await waitFor(() => expect(api.sent("POST", "/savings-transfers")).toHaveLength(1));
    expect(api.sent("POST", "/savings-transfers")[0].body).toMatchObject({ new_asset: { kind: "mutual_fund", name: "Rainy day" } });
  });
  it("asks for a name for a new item", async () => {
    open();
    await userEvent.selectOptions(await findField("Move it to"), "new");
    await userEvent.type(field("Amount"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Move to savings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Give the new savings item a name");
    expect(api.sent("POST", "/savings-transfers")).toHaveLength(0);
  });
  it("only lists items that hold money when moving back", async () => {
    open({ direction: "out" });
    await screen.findByRole("option", { name: /Bank, / });
    expect(screen.getByRole("option", { name: /Meezan Fund/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Bonds/ })).toBeNull();
    expect(screen.queryByRole("option", { name: "A new savings item" })).toBeNull();
  });
  it("refuses to take more than an item holds", async () => {
    open({ direction: "out", assetId: uid(2) });
    await screen.findByRole("option", { name: /Meezan Fund/ });
    await userEvent.type(field("Amount"), "10001");
    await userEvent.click(screen.getByRole("button", { name: "Move back to spending" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Meezan Fund only holds/);
    expect(api.sent("POST", "/savings-transfers")).toHaveLength(0);
  });
  it("moves back to spending", async () => {
    open({ direction: "out", assetId: uid(1) });
    await screen.findByRole("option", { name: /Bank, / });
    await userEvent.type(field("Amount"), "700");
    await userEvent.click(screen.getByRole("button", { name: "Move back to spending" }));
    await waitFor(() => expect(api.sent("POST", "/savings-transfers")).toHaveLength(1));
    expect(api.sent("POST", "/savings-transfers")[0].body).toMatchObject({ direction: "out", amount: 700, asset_id: uid(1) });
  });
  it("switches direction", async () => {
    open();
    await userEvent.click(screen.getByRole("button", { name: "Back to spending" }));
    expect(screen.getByRole("button", { name: "Move back to spending" })).toBeInTheDocument();
    expect(screen.getByText(/can be spent again/)).toBeInTheDocument();
  });
  it("tells you when nothing holds money yet", async () => {
    use({ "/assets": [asset(9, "cash", "Empty", 0)] });
    open({ direction: "out" });
    expect(await screen.findByText(/None of your savings items hold any money/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move back to spending" })).toBeDisabled();
  });
  it("shows the server's error and stays open", async () => {
    use({ "/assets": ASSETS, "POST /savings-transfers": new Error("Nope, that failed") });
    const { onClose } = open();
    await screen.findByRole("option", { name: /Bank, / });
    await userEvent.type(field("Amount"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Move to savings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nope, that failed");
    expect(onClose).not.toHaveBeenCalled();
  });
  it("renders nothing when closed", () => { renderApp(<MoveMoney open={false} onClose={() => {}} />); expect(screen.queryByRole("dialog")).toBeNull(); });
});

describe("QuickAdd", () => {
  const CATS = [{ id: uid(10), name: "Food", color: "#112233" }, { id: uid(11), name: "Fuel", color: "#445566" }];
  const SRC = [{ id: uid(20), name: "Salary", kind: "job", expected_monthly: 1 }];
  const TX = [{ id: uid(30), type: "expense", amount: 5, occurred_on: "2026-11-01", note: "Careem", category_id: uid(11), income_source_id: null }];
  beforeEach(() => use({ "/assets": ASSETS, "/categories": CATS, "/income-sources": SRC, "/transactions": TX }));
  const openIt = async () => { renderApp(<QuickAdd />); await userEvent.click(screen.getByRole("button", { name: "Add a transaction" })); await screen.findByRole("button", { name: "Food" }); };

  it("opens from the button and from the N key", async () => {
    renderApp(<QuickAdd />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document.body, { key: "n" });
    expect(await screen.findByRole("dialog", { name: "Add a transaction" })).toBeInTheDocument();
  });
  it("ignores N while typing, with a modifier, or when a sheet is already open", async () => {
    renderApp(<><input aria-label="box" /><QuickAdd /></>);
    fireEvent.keyDown(screen.getByLabelText("box"), { key: "n" });
    fireEvent.keyDown(document.body, { key: "n", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "n", metaKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    document.body.classList.add("sheet-open");
    fireEvent.keyDown(document.body, { key: "n" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("adds an expense with a category", async () => {
    await openIt();
    await userEvent.type(screen.getByLabelText("Amount"), "450");
    await userEvent.type(screen.getByLabelText("Note"), "Lunch");
    await userEvent.click(screen.getByRole("button", { name: "Food" }));
    await userEvent.click(screen.getByRole("button", { name: "Add expense" }));
    await waitFor(() => expect(api.sent("POST", "/transactions")).toHaveLength(1));
    expect(api.sent("POST", "/transactions")[0].body).toMatchObject({ type: "expense", amount: 450, note: "Lunch", category_id: uid(10), income_source_id: null });
    expect(await screen.findByRole("status")).toHaveTextContent("Expense added");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("remembers the category used with a note last time", async () => {
    await openIt();
    await userEvent.type(screen.getByLabelText("Note"), "careem");
    expect(screen.getByRole("button", { name: "Fuel" })).toHaveAttribute("aria-pressed", "true");
  });
  it("does not override a category the person picked", async () => {
    await openIt();
    await userEvent.click(screen.getByRole("button", { name: "Food" }));
    await userEvent.type(screen.getByLabelText("Note"), "Careem");
    expect(screen.getByRole("button", { name: "Food" })).toHaveAttribute("aria-pressed", "true");
  });
  it("tapping a selected category again clears it", async () => {
    await openIt();
    await userEvent.click(screen.getByRole("button", { name: "Food" }));
    await userEvent.click(screen.getByRole("button", { name: "Food" }));
    expect(screen.getByRole("button", { name: "Food" })).toHaveAttribute("aria-pressed", "false");
  });
  it("refuses an empty or zero amount", async () => {
    await openIt();
    await userEvent.type(screen.getByLabelText("Amount"), "0");
    fireEvent.submit(screen.getByLabelText("Amount").closest("form")!);
    expect(await screen.findByText("Enter an amount greater than zero.")).toBeInTheDocument();
    expect(api.sent("POST", "/transactions")).toHaveLength(0);
  });
  it("switches to income and shows sources and the savings option", async () => {
    await openIt();
    expect(screen.queryByLabelText(/Move part of this to savings/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Earned" }));
    expect(screen.getByRole("button", { name: "Salary" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Move part of this to savings/)).toBeInTheDocument();
  });
  it("adds income with part moved to savings", async () => {
    await openIt();
    await userEvent.click(screen.getByRole("button", { name: "Earned" }));
    await userEvent.type(screen.getByLabelText("Amount"), "50000");
    await userEvent.click(screen.getByLabelText(/Move part of this to savings/));
    await userEvent.type(field("Amount to move"), "10000");
    api.calls.length = 0;
    use({ "/assets": ASSETS, "/categories": CATS, "/income-sources": SRC, "/transactions": TX, "POST /transactions": { id: "x", savings: [{ asset_name: "Bank" }] } });
    await userEvent.click(screen.getByRole("button", { name: "Add income" }));
    await waitFor(() => expect(api.sent("POST", "/transactions")).toHaveLength(1));
    expect(api.sent("POST", "/transactions")[0].body).toMatchObject({ type: "income", amount: 50000, savings: [{ amount: 10000, asset_id: uid(1) }] });
    expect(await screen.findByRole("status")).toHaveTextContent(/Income added\..*10,000.* moved to Bank/);
  });
  it("blocks moving more than the income", async () => {
    await openIt();
    await userEvent.click(screen.getByRole("button", { name: "Earned" }));
    await userEvent.type(screen.getByLabelText("Amount"), "100");
    await userEvent.click(screen.getByLabelText(/Move part of this to savings/));
    await userEvent.type(field("Amount to move"), "500");
    await userEvent.click(screen.getByRole("button", { name: "Add income" }));
    expect(await screen.findByText("You cannot move more to savings than the income.")).toBeInTheDocument();
    expect(api.sent("POST", "/transactions")).toHaveLength(0);
  });
  it("lets you pick yesterday", async () => {
    await openIt();
    await userEvent.click(screen.getByRole("button", { name: "Yesterday" }));
    await userEvent.type(screen.getByLabelText("Amount"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Add expense" }));
    await waitFor(() => expect(api.sent("POST", "/transactions")).toHaveLength(1));
    const d = new Date(); d.setDate(d.getDate() - 1);
    expect((api.sent("POST", "/transactions")[0].body as { occurred_on: string }).occurred_on).toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  });
  it("shows the server's error inside the form", async () => {
    use({ "/categories": CATS, "/income-sources": SRC, "/transactions": TX, "POST /transactions": new Error("Too many requests") });
    await openIt();
    await userEvent.type(screen.getByLabelText("Amount"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Add expense" }));
    expect(await screen.findByText("Too many requests")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("explains when there are no categories yet", async () => {
    use({ "/categories": [], "/income-sources": [], "/transactions": [] });
    renderApp(<QuickAdd />);
    await userEvent.click(screen.getByRole("button", { name: "Add a transaction" }));
    expect(await screen.findByText(/No categories yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Earned" }));
    expect(screen.getByText(/No income sources yet/)).toBeInTheDocument();
  });
  it("clears the form after adding", async () => {
    await openIt();
    await userEvent.type(screen.getByLabelText("Amount"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Add expense" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Add a transaction" }));
    expect(await screen.findByLabelText("Amount")).toHaveValue(null);
  });
});

describe("DashboardGoals", () => {
  const goal = (n: number, name: string, percent: number, done = false) => ({ id: uid(n), name, kind: "cash", saved: percent * 10, target_amount: 1000, target_date: null, done, percent, remaining: 1000 - percent * 10, reached: percent >= 100, days_left: null, overdue: false, monthly_needed: null });
  it("shows the three closest goals, nearest first, with a link to all", async () => {
    use({ "/goals": [goal(1, "A", 10), goal(2, "B", 90), goal(3, "C", 50), goal(4, "D", 70), goal(5, "Done", 100, true)] });
    renderApp(<DashboardGoals />);
    const items = await screen.findAllByRole("listitem");
    expect(items.map((i) => i.querySelector(".ledger-main")?.firstChild?.textContent)).toEqual(["B", "D", "C"]);
    expect(screen.getByRole("link", { name: "All goals" })).toHaveAttribute("href", "/goals");
    expect(screen.getByText("90%")).toBeInTheDocument();
  });
  it("shows nothing when every goal is done or there are none", async () => {
    use({ "/goals": [goal(1, "Done", 100, true)] });
    renderApp(<DashboardGoals />);
    await waitFor(() => expect(api.sent("GET", "/goals")).toHaveLength(1));
    expect(screen.queryByRole("heading", { name: "Goals" })).toBeNull();
  });
  it("shows nothing when the goals cannot load", async () => {
    use({ "/goals": new Error("x") });
    renderApp(<DashboardGoals />);
    await waitFor(() => expect(api.sent("GET", "/goals")).toHaveLength(1));
    expect(screen.queryByRole("heading", { name: "Goals" })).toBeNull();
  });
  it("uses cached goals straight away", () => {
    h.peek.mockReturnValue([goal(1, "Cached", 40)] as never);
    renderApp(<DashboardGoals />);
    expect(screen.getByText("Cached")).toBeInTheDocument();
  });
});
