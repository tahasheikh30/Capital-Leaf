import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useEffect, useState, type ComponentType } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, field, findField, renderApp, uid } from "../utils";

const s = vi.hoisted(() => ({ impl: (async () => ({})) as (p: string, o?: unknown) => Promise<unknown>, peek: vi.fn(() => undefined) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/goals" }));
vi.mock("@/lib/api", () => ({ api: (p: string, o?: unknown) => s.impl(p, o), peek: s.peek, setApiSpace: vi.fn(), clearApiCache: vi.fn(), requestsWaiting: () => 0, API_URL: "http://api.test" }));
// next/dynamic is replaced by a plain loader so the charts (stubbed below) show up deterministically.
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<ComponentType<Record<string, unknown>>>) =>
    function Lazy(props: Record<string, unknown>) {
      const [Comp, setComp] = useState<ComponentType<Record<string, unknown>> | null>(null);
      useEffect(() => { loader().then((c) => setComp(() => c)); }, []);
      return Comp ? <Comp {...props} /> : null;
    },
}));
vi.mock("@/components/DashboardCharts", () => ({
  MonthlyChart: ({ data }: { data: unknown[] }) => <div data-testid="monthly-chart">{data.length} months</div>,
  CategoryChart: ({ data }: { data: unknown[] }) => <div data-testid="category-chart">{data.length} categories</div>,
}));

import GoalsPage from "@/app/(app)/goals/page";
import DashboardPage from "@/app/(app)/dashboard/page";
import { monthKey } from "@/lib/format";

let api: ReturnType<typeof fakeApi>;
const use = (routes: Parameters<typeof fakeApi>[0]) => { api = fakeApi({ "/households/me": { household: null }, ...routes }); s.impl = api.impl as typeof s.impl; };
beforeEach(() => { s.peek.mockReturnValue(undefined); vi.stubGlobal("confirm", vi.fn(() => true)); });

const goal = (over: Record<string, unknown> = {}) => ({ id: uid(1), name: "Laptop", target_amount: 100000, target_date: null, saved: 25000, percent: 25, remaining: 75000, reached: false, overdue: false, done: false, days_left: null, monthly_needed: null, ...over });

describe("Goals page", () => {
  it("shows an empty state, then a skeleton before load", async () => {
    use({ "/goals": [] });
    renderApp(<GoalsPage />);
    expect(await screen.findByText("No goals yet")).toBeInTheDocument();
  });
  it("shows the error when loading fails", async () => {
    use({ "/goals": new Error("Server down") });
    renderApp(<GoalsPage />);
    expect(await screen.findByText("Server down")).toBeInTheDocument();
  });
  it("lists active goals with amounts, percent and what is left", async () => {
    use({ "/goals": [goal()] });
    renderApp(<GoalsPage />);
    expect(await screen.findByText("Laptop")).toBeInTheDocument();
    expect(screen.getByText(/25,000/)).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText(/75,000.* to go/)).toBeInTheDocument();
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
  });
  it.each([
    [{ days_left: -3, overdue: true, target_date: "2026-11-01" }, "Past the date", /3 days past the date/],
    [{ days_left: 0, target_date: "2026-11-17" }, null, /due today/],
    [{ days_left: 20, target_date: "2026-12-07" }, null, /20 days left/],
    [{ days_left: 200, target_date: "2027-06-05" }, null, /7 months left/],
  ])("describes time left (%j)", async (over, badge, text) => {
    use({ "/goals": [goal(over)] });
    renderApp(<GoalsPage />);
    expect(await screen.findByText(text)).toBeInTheDocument();
    if (badge) expect(screen.getByText(badge)).toBeInTheDocument();
  });
  it("shows the monthly hint and the reached badge", async () => {
    use({ "/goals": [goal({ monthly_needed: 5000 }), goal({ id: uid(2), name: "Trip", reached: true, percent: 100, remaining: 0, saved: 100000 })] });
    renderApp(<GoalsPage />);
    expect(await screen.findByText(/Put aside about .*5,000.* a month/)).toBeInTheDocument();
    expect(screen.getByText("Target reached")).toBeInTheDocument();
  });
  it("puts finished goals under Done and offers reopen", async () => {
    use({ "/goals": [goal({ done: true }), goal({ id: uid(2), name: "Bike" })] });
    renderApp(<GoalsPage />);
    expect(await screen.findByRole("heading", { name: "Done" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add money" })).toHaveLength(1);
  });
  it("hides Take out when nothing is saved", async () => {
    use({ "/goals": [goal({ saved: 0 })] });
    renderApp(<GoalsPage />);
    await screen.findByText("Laptop");
    expect(screen.queryByRole("button", { name: "Take out" })).not.toBeInTheDocument();
  });
  it("creates a goal with a new savings item", async () => {
    use({ "/goals": [] });
    const user = userEvent.setup();
    renderApp(<GoalsPage />);
    await screen.findByText("No goals yet");
    await user.click(screen.getByRole("button", { name: /New goal/ }));
    await user.type(await findField("What are you saving for?"), "Camera");
    await user.type(field("Target amount"), "50000");
    await user.click(screen.getByRole("button", { name: "Create goal" }));
    await waitFor(() => expect(api.sent("POST", "/goals")).toHaveLength(1));
    expect(api.sent("POST", "/goals")[0].body).toEqual({ target_amount: 50000, target_date: null, new_item: { kind: "cash", name: "Camera" } });
    expect(await screen.findByText(/Goal created/)).toBeInTheDocument();
  });
  it("can choose another type and a date for the new item", async () => {
    use({ "/goals": [] });
    const user = userEvent.setup();
    renderApp(<GoalsPage />);
    await screen.findByText("No goals yet");
    await user.click(screen.getByRole("button", { name: /New goal/ }));
    await user.type(await findField("What are you saving for?"), "Fund");
    await user.type(field("Target amount"), "9");
    fireEvent.change(field("Target date (optional)"), { target: { value: "2027-01-01" } });
    await user.selectOptions(field("Type of item"), "mutual_fund");
    await user.click(screen.getByRole("button", { name: "Create goal" }));
    await waitFor(() => expect(api.sent("POST", "/goals")).toHaveLength(1));
    expect(api.sent("POST", "/goals")[0].body).toMatchObject({ target_date: "2027-01-01", new_item: { kind: "mutual_fund", name: "Fund" } });
  });
  it("lists only savings items that are not goals yet and attaches to one", async () => {
    use({ "/goals": [goal()], "/assets": [
      { id: uid(1), name: "Laptop", kind: "cash", amount: 1 },
      { id: uid(5), name: "Vault", kind: "cash", amount: 700 },
      { id: uid(6), name: "House", kind: "property", amount: 9 },
    ] });
    const user = userEvent.setup();
    renderApp(<GoalsPage />);
    await screen.findByText("Laptop");
    await user.click(screen.getByRole("button", { name: /New goal/ }));
    const where = await findField("Where is the money kept?");
    await waitFor(() => expect(where.querySelectorAll("option")).toHaveLength(2));
    expect(where).not.toHaveTextContent("House");
    await user.selectOptions(where, uid(5));
    expect(field("What are you saving for?")).toBeDisabled();
    expect(screen.queryByText("Type of item")).not.toBeInTheDocument();
    await user.type(field("Target amount"), "1000");
    await user.click(screen.getByRole("button", { name: "Create goal" }));
    await waitFor(() => expect(api.sent("POST", "/goals")).toHaveLength(1));
    expect(api.sent("POST", "/goals")[0].body).toEqual({ target_amount: 1000, target_date: null, asset_id: uid(5) });
  });
  it("copes with the assets list failing", async () => {
    use({ "/goals": [], "/assets": new Error("nope") });
    const user = userEvent.setup();
    renderApp(<GoalsPage />);
    await screen.findByText("No goals yet");
    await user.click(screen.getByRole("button", { name: /New goal/ }));
    expect(await findField("Where is the money kept?")).toBeInTheDocument();
  });
  it("shows an error toast when creating fails", async () => {
    use({ "/goals": [], "POST /goals": new Error("Too many goals") });
    const user = userEvent.setup();
    renderApp(<GoalsPage />);
    await screen.findByText("No goals yet");
    await user.click(screen.getByRole("button", { name: /New goal/ }));
    await user.type(await findField("What are you saving for?"), "X");
    await user.type(field("Target amount"), "5");
    await user.click(screen.getByRole("button", { name: "Create goal" }));
    expect(await screen.findByText("Too many goals")).toBeInTheDocument();
  });
  it("edits a goal's name, target and date", async () => {
    use({ "/goals": [goal({ target_date: "2027-01-01" })] });
    const user = userEvent.setup();
    renderApp(<GoalsPage />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(await findField("What are you saving for?")).toHaveValue("Laptop");
    expect(field("Target amount")).toHaveValue(100000);
    expect(field("Target date (optional)")).toHaveValue("2027-01-01");
    expect(screen.queryByText("Where is the money kept?")).not.toBeInTheDocument();
    await user.clear(field("What are you saving for?"));
    await user.type(field("What are you saving for?"), "Laptop Pro");
    fireEvent.change(field("Target date (optional)"), { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.sent("PATCH", `/goals/${uid(1)}`)).toHaveLength(1));
    expect(api.sent("PATCH", `/goals/${uid(1)}`)[0].body).toEqual({ name: "Laptop Pro", target_amount: 100000, target_date: null });
    expect(await screen.findByText("Goal updated")).toBeInTheDocument();
  });
  it("marks done and reopens", async () => {
    use({ "/goals": [goal()] });
    const user = userEvent.setup();
    renderApp(<GoalsPage />);
    await user.click(await screen.findByRole("button", { name: "Mark as done" }));
    await waitFor(() => expect(api.sent("PATCH", `/goals/${uid(1)}`)[0]?.body).toEqual({ done: true }));
    expect(await screen.findByText("Marked as done")).toBeInTheDocument();
  });
  it("reopens a done goal", async () => {
    use({ "/goals": [goal({ done: true })] });
    const user = userEvent.setup();
    renderApp(<GoalsPage />);
    await user.click(await screen.findByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(api.sent("PATCH", `/goals/${uid(1)}`)[0]?.body).toEqual({ done: false }));
    expect(await screen.findByText("Goal reopened")).toBeInTheDocument();
  });
  it("shows an error when updating fails", async () => {
    use({ "/goals": [goal()], [`PATCH /goals/${uid(1)}`]: new Error("Nope") });
    const user = userEvent.setup();
    renderApp(<GoalsPage />);
    await user.click(await screen.findByRole("button", { name: "Mark as done" }));
    expect(await screen.findByText("Nope")).toBeInTheDocument();
  });
  it("removes a goal only after confirming", async () => {
    use({ "/goals": [goal()] });
    const user = userEvent.setup();
    renderApp(<GoalsPage />);
    (confirm as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    expect(api.sent("DELETE", `/goals/${uid(1)}`)).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(api.sent("DELETE", `/goals/${uid(1)}`)).toHaveLength(1));
    expect(await screen.findByText("Goal removed")).toBeInTheDocument();
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('"Laptop"'));
  });
  it("shows an error when removing fails", async () => {
    use({ "/goals": [goal()], [`DELETE /goals/${uid(1)}`]: new Error("Cannot remove") });
    const user = userEvent.setup();
    renderApp(<GoalsPage />);
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Cannot remove")).toBeInTheDocument();
  });
  it("opens the money sheet for Add money and Take out", async () => {
    use({ "/goals": [goal()] });
    const user = userEvent.setup();
    renderApp(<GoalsPage />);
    await user.click(await screen.findByRole("button", { name: "Add money" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
  it("shows the earlier answer straight away when cached", async () => {
    s.peek.mockImplementation(((p: string) => (p === "/goals" ? [goal()] : undefined)) as never);
    use({ "/goals": [goal()] });
    renderApp(<GoalsPage />);
    expect(screen.getByText("Laptop")).toBeInTheDocument();
  });
  it("is not available in a household space", async () => {
    use({ "/households/me": { household: { id: uid(9), name: "Home", role: "owner" } }, "/goals": [goal()] });
    localStorage.setItem("cl-space", uid(9));
    renderApp(<GoalsPage />);
    await waitFor(() => expect(screen.queryByRole("button", { name: /New goal/ })).not.toBeInTheDocument());
  });
});

const month = monthKey(new Date());
const dash = (over: Record<string, unknown> = {}) => ({
  income: 100000, spent: 30000, setAside: 10000, taxSetAside: 0, movedToSavings: 0, leftToSpend: 60000,
  monthly: [{ month: month, income: 100000, spent: 30000 }],
  byCategory: [{ name: "Food", color: "#fff", value: 30000 }],
  bySource: [{ name: "Salary", value: 100000 }],
  recent: [{ id: uid(1), type: "expense", amount: 500, note: "Lunch", occurred_on: `${month}-05` }, { id: uid(2), type: "income", amount: 9000, note: "", occurred_on: `${month}-04` }],
  ...over,
});
const useDash = (data: unknown, extra: Parameters<typeof fakeApi>[0] = {}) => use({ [`/dashboard?month=${month}`]: data, [`/transactions?month=${month}`]: [], "/profile": { full_name: "Taha Sheikh" }, "/goals": [], ...extra });

describe("Dashboard page", () => {
  it("shows a loading state first", () => {
    useDash(new Promise(() => {}) as never);
    s.impl = (() => new Promise(() => {})) as never;
    renderApp(<DashboardPage />);
    expect(screen.getByLabelText("Loading your dashboard")).toHaveAttribute("aria-busy", "true");
  });
  it("shows an error", async () => {
    useDash(new Error("Dashboard failed"));
    renderApp(<DashboardPage />);
    expect(await screen.findByText("Dashboard failed")).toBeInTheDocument();
  });
  it.each([[2, "Still up"], [9, "Good morning"], [14, "Good afternoon"], [20, "Good evening"]])("greets by name at hour %i", async (hour, text) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 17, hour, 0, 0));
    useDash(dash());
    renderApp(<DashboardPage />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(`${text}, Taha`);
    vi.useRealTimers();
  });
  it("greets without a name", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 17, 9));
    useDash(dash(), { "/profile": { full_name: null } });
    renderApp(<DashboardPage />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/^Good morning$/);
    vi.useRealTimers();
  });
  it("tells what is left to spend and per day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 17, 9));
    useDash(dash({ leftToSpend: 14000 }));
    renderApp(<DashboardPage />);
    expect(await screen.findByText("Left to spend this month")).toBeInTheDocument();
    expect(screen.getByText(/about .*1,000.* a day for the 14 days left/)).toBeInTheDocument();
    vi.useRealTimers();
  });
  it("uses the singular on the last day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 30, 9));
    useDash(dash({ leftToSpend: 500 }));
    renderApp(<DashboardPage />);
    expect(await screen.findByText(/for the 1 day left/)).toBeInTheDocument();
    vi.useRealTimers();
  });
  it("says it all when nothing is left", async () => {
    useDash(dash({ leftToSpend: 0 }));
    renderApp(<DashboardPage />);
    expect(await screen.findByText(/spoken for/)).toBeInTheDocument();
  });
  it("warns when spending is ahead of income", async () => {
    useDash(dash({ leftToSpend: -2500 }));
    renderApp(<DashboardPage />);
    expect(await screen.findByText("Over this month's income by")).toBeInTheDocument();
    expect(screen.getByText(/2,500/, { selector: ".hero-figure" })).toHaveClass("over");
    expect(screen.getByText(/Spending is ahead/)).toBeInTheDocument();
  });
  it("without income shows what was spent and links to add income", async () => {
    useDash(dash({ income: 0, setAside: 0, leftToSpend: 0 }));
    renderApp(<DashboardPage />);
    expect(await screen.findByText("Spent so far this month")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add what you earned" })).toHaveAttribute("href", "/transactions");
    expect(screen.queryByText(/Dashed line/)).not.toBeInTheDocument();
  });
  it("mentions the daily plan line", async () => {
    useDash(dash());
    renderApp(<DashboardPage />);
    expect(await screen.findByText(/Dashed line is/)).toBeInTheDocument();
  });
  it("lists the stats, with optional savings and tax", async () => {
    useDash(dash({ movedToSavings: 4000, taxSetAside: 3000 }));
    renderApp(<DashboardPage />);
    await screen.findByText("Earned");
    for (const l of ["Earned", "Spent", "Set aside", "To savings", "For tax"]) expect(screen.getByText(l, { selector: "dt" })).toBeInTheDocument();
  });
  it("labels money taken back from savings", async () => {
    useDash(dash({ movedToSavings: -1500 }));
    renderApp(<DashboardPage />);
    expect(await screen.findByText("Back from savings")).toBeInTheDocument();
  });
  it("hides the optional stats when zero", async () => {
    useDash(dash());
    renderApp(<DashboardPage />);
    await screen.findByText("Earned");
    expect(screen.queryByText("To savings")).not.toBeInTheDocument();
    expect(screen.queryByText("For tax")).not.toBeInTheDocument();
  });
  it("renders both charts and the lists", async () => {
    useDash(dash());
    renderApp(<DashboardPage />);
    expect(await screen.findByTestId("monthly-chart")).toHaveTextContent("1 months");
    await waitFor(() => expect(document.querySelector(".chart-box-pie")?.firstElementChild).not.toBeNull());
    expect(screen.getByText("Lunch")).toBeInTheDocument();
    expect(screen.getAllByText("Income").length).toBeGreaterThan(0);
    expect(screen.getByText("Salary")).toBeInTheDocument();
    expect(document.querySelector(".ledger-amt:not(.pos)")).toHaveTextContent(/^-.*500$/);
    expect(document.querySelector(".ledger-amt.pos")).toHaveTextContent(/^\+.*9,000$/);
  });
  it("shows empty states", async () => {
    useDash(dash({ byCategory: [], bySource: [], recent: [] }));
    renderApp(<DashboardPage />);
    expect(await screen.findByText(/Nothing spent yet this month/)).toBeInTheDocument();
    expect(screen.getByText("Your first transaction will show up here.")).toBeInTheDocument();
    expect(screen.getByText("No income recorded yet this month.")).toBeInTheDocument();
    expect(document.querySelector(".chart-box-pie")).toBeNull();
  });
  it("opens the move money sheet and refreshes after", async () => {
    useDash(dash());
    const user = userEvent.setup();
    renderApp(<DashboardPage />);
    await user.click(await screen.findByRole("button", { name: "Move money to savings" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
  it("hides moving money in a household", async () => {
    useDash(dash(), { "/households/me": { household: { id: uid(9), name: "Home", role: "owner" } } });
    localStorage.setItem("cl-space", uid(9));
    renderApp(<DashboardPage />);
    await screen.findByText("Earned");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Move money to savings" })).not.toBeInTheDocument());
  });
  it("uses cached answers straight away", () => {
    s.peek.mockImplementation(((p: string) => (p === `/dashboard?month=${month}` ? dash() : undefined)) as never);
    useDash(dash());
    renderApp(<DashboardPage />);
    expect(screen.getByText("Earned")).toBeInTheDocument();
  });
  it("counts spending per day for the day strip", async () => {
    useDash(dash(), { [`/transactions?month=${month}`]: [{ type: "expense", amount: 10, occurred_on: `${month}-02` }, { type: "income", amount: 99, occurred_on: `${month}-02` }] });
    renderApp(<DashboardPage />);
    await screen.findByText("Earned");
    await waitFor(() => expect(api.sent("GET", "/transactions").length).toBeGreaterThan(0));
  });
});
