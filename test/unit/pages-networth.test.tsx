import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState, type ComponentType } from "react";
import { fakeApi, field, findField, renderApp, uid } from "../utils";

const s = vi.hoisted(() => ({ impl: (async () => ({})) as (p: string, o?: unknown) => Promise<unknown>, peek: vi.fn(() => undefined) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/net-worth" }));
vi.mock("@/lib/api", () => ({ api: (p: string, o?: unknown) => s.impl(p, o), peek: s.peek, setApiSpace: vi.fn(), clearApiCache: vi.fn(), requestsWaiting: () => 0, API_URL: "http://api.test" }));
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<ComponentType<Record<string, unknown>>>) =>
    function Lazy(props: Record<string, unknown>) {
      const [Comp, setComp] = useState<ComponentType<Record<string, unknown>> | null>(null);
      useEffect(() => { loader().then((c) => setComp(() => c)); }, []);
      return Comp ? <Comp {...props} /> : null;
    },
}));
vi.mock("@/components/DashboardCharts", () => ({ TrendChart: ({ data }: { data: unknown[] }) => <div data-testid="trend">{data.length} days</div> }));

import NetWorthPage from "@/app/(app)/net-worth/page";

let api: ReturnType<typeof fakeApi>;
const use = (routes: Parameters<typeof fakeApi>[0]) => { api = fakeApi({ "/households/me": { household: null }, ...routes }); s.impl = api.impl as typeof s.impl; };
beforeEach(() => { s.peek.mockReturnValue(undefined); });

const nw = (over: Record<string, unknown> = {}) => ({
  total: 500000, change30: 20000, warnings: [], goldRate: { perTola24k: 300000, stale: false },
  classes: { cash: 200000, stocks: 100000, gold: 150000, certificates: 50000, mutualFunds: 25000, other: 0, liabilities: 25000 },
  history: [{ day: "2026-11-01", total: 400000 }, { day: "2026-11-02", total: 410000 }],
  lines: [{ id: uid(1), value: 200000 }, { id: uid(2), value: 150000 }, { id: uid(3), value: 25000 }],
  ...over,
});
const asset = (over: Record<string, unknown> = {}) => ({ id: uid(1), kind: "cash", name: "Meezan", amount: 200000, grams: null, karat: null, rate_per_tola: null, annual_rate: null, start_date: null, maturity_date: null, payout: null, ...over });
const base = (extra: Parameters<typeof fakeApi>[0] = {}) => use({ "/net-worth": nw(), "/assets": [asset(), asset({ id: uid(2), kind: "gold", name: "Set", amount: null, grams: 10, karat: 22 }), asset({ id: uid(3), kind: "liability", name: "Loan", amount: 25000 })], "/savings-transfers": [], ...extra });

describe("Net worth page", () => {
  it("shows the total, 30 day change and where it sits", async () => {
    base();
    renderApp(<NetWorthPage />);
    expect(await screen.findByText("Everything you own, minus what you owe")).toBeInTheDocument();
    expect(screen.getByText(/500,000/, { selector: ".hero-figure" })).toBeInTheDocument();
    expect(screen.getByText(/Up .*20,000.* in the last 30 days/)).toBeInTheDocument();
    for (const l of ["Cash and bank", "PSX stocks", "Gold", "Savings certificates", "Mutual funds", "Other assets"]) expect(screen.getAllByText(l).length).toBeGreaterThan(0);
    expect(screen.getByText("Owed").nextSibling).toHaveTextContent(/^-.*25,000/);
    expect(screen.getByText(/Gold today: .*300,000.* per tola \(24k\)$/)).toBeInTheDocument();
  });
  it("shows a falling month, a negative total, stale gold rate and warnings", async () => {
    base({ "/net-worth": nw({ total: -5, change30: -300, warnings: ["No price for ABC"], goldRate: { perTola24k: 1, stale: true }, classes: { ...nw().classes, liabilities: 0 } }) });
    renderApp(<NetWorthPage />);
    expect(await screen.findByText(/Down .*300/)).toBeInTheDocument();
    expect(screen.getByText(/-5|5/, { selector: ".hero-figure" })).toHaveClass("over");
    expect(screen.getByText("No price for ABC")).toBeInTheDocument();
    expect(screen.getByText(/last known rate/)).toBeInTheDocument();
    expect(screen.queryByText("Owed")).not.toBeInTheDocument();
  });
  it("omits the change line and gold rate when unknown", async () => {
    base({ "/net-worth": nw({ change30: null, goldRate: null }) });
    renderApp(<NetWorthPage />);
    await screen.findByText("Everything you own, minus what you owe");
    expect(screen.queryByText(/in the last 30 days/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Gold today/)).not.toBeInTheDocument();
  });
  it("draws the trend with two or more points, otherwise explains", async () => {
    base();
    const first = renderApp(<NetWorthPage />);
    expect(await screen.findByTestId("trend")).toHaveTextContent("2 days");
    first.unmount();
    base({ "/net-worth": nw({ history: [{ day: "2026-11-01", total: 1 }] }) });
    renderApp(<NetWorthPage />);
    expect(await screen.findByText(/The trend appears after a couple of days/)).toBeInTheDocument();
  });
  it("lists items with their details and values", async () => {
    base();
    renderApp(<NetWorthPage />);
    expect(await screen.findByText("Meezan")).toBeInTheDocument();
    expect(screen.getByText(/Gold, 10 g, 22k$/)).toBeInTheDocument();
    expect(screen.getByText("Debt or loan")).toBeInTheDocument();
    const loan = screen.getByText("Loan").closest("li") as HTMLElement;
    expect(within(loan).getByText(/^-/, { selector: ".ledger-amt" })).toHaveClass("neg");
    expect(within(loan).queryByRole("button", { name: "Move money" })).not.toBeInTheDocument();
    expect(within(screen.getByText("Meezan").closest("li") as HTMLElement).getByRole("button", { name: "Move money" })).toBeInTheDocument();
  });
  it("describes own gold rate and certificate rate", async () => {
    base({ "/assets": [asset({ kind: "gold", name: "G", grams: 5, karat: 24, rate_per_tola: 99 }), asset({ id: uid(2), kind: "certificate", name: "Cert", annual_rate: 12.5 })] });
    renderApp(<NetWorthPage />);
    expect(await screen.findByText(/5 g, 24k, your rate/)).toBeInTheDocument();
    expect(screen.getByText(/12.5% a year/)).toBeInTheDocument();
  });
  it("says No price yet when an item has no value", async () => {
    base({ "/assets": [asset({ id: uid(9), name: "Odd" })] });
    renderApp(<NetWorthPage />);
    expect(await screen.findByText("No price yet")).toBeInTheDocument();
  });
  it("shows an empty state and an error", async () => {
    base({ "/assets": [] });
    const first = renderApp(<NetWorthPage />);
    expect(await screen.findByText(/Nothing added yet/)).toBeInTheDocument();
    first.unmount();
    base({ "/net-worth": new Error("Oops") });
    renderApp(<NetWorthPage />);
    expect(await screen.findByText("Oops")).toBeInTheDocument();
  });
  it("adds a cash item", async () => {
    base();
    const user = userEvent.setup();
    renderApp(<NetWorthPage />);
    await user.click(await screen.findByRole("button", { name: /Add$/ }));
    await user.type(await findField("Name"), "Wallet");
    await user.type(field("Value"), "1500");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.sent("POST", "/assets")).toHaveLength(1));
    expect(api.sent("POST", "/assets")[0].body).toEqual({ kind: "cash", name: "Wallet", amount: 1500 });
    expect(await screen.findByText("Added")).toBeInTheDocument();
  });
  it.each([["liability", "Amount owed"], ["mutual_fund", "Current value of your units"]])("labels the amount for %s", async (kind, label) => {
    base();
    const user = userEvent.setup();
    renderApp(<NetWorthPage />);
    await user.click(await screen.findByRole("button", { name: /Add$/ }));
    await user.selectOptions(await findField("Type"), kind);
    expect(field(label)).toBeInTheDocument();
  });
  it("adds gold with karat and optional own rate", async () => {
    base();
    const user = userEvent.setup();
    renderApp(<NetWorthPage />);
    await user.click(await screen.findByRole("button", { name: /Add$/ }));
    await user.selectOptions(await findField("Type"), "gold");
    await user.type(field("Name"), "Ring");
    await user.type(field("Weight in grams"), "11.66");
    await user.selectOptions(field("Karat"), "21");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.sent("POST", "/assets")).toHaveLength(1));
    expect(api.sent("POST", "/assets")[0].body).toEqual({ kind: "gold", name: "Ring", grams: 11.66, karat: 21, rate_per_tola: null });
  });
  it("sends own rate when given", async () => {
    base();
    const user = userEvent.setup();
    renderApp(<NetWorthPage />);
    await user.click(await screen.findByRole("button", { name: /Add$/ }));
    await user.selectOptions(await findField("Type"), "gold");
    await user.type(field("Name"), "Ring");
    await user.type(field("Weight in grams"), "5");
    await user.type(field("Your own 24k rate per tola (optional)"), "250000");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.sent("POST", "/assets")).toHaveLength(1));
    expect(api.sent("POST", "/assets")[0].body).toMatchObject({ rate_per_tola: 250000 });
  });
  it("adds a certificate with dates and payout", async () => {
    base();
    const user = userEvent.setup();
    renderApp(<NetWorthPage />);
    await user.click(await screen.findByRole("button", { name: /Add$/ }));
    await user.selectOptions(await findField("Type"), "certificate");
    await user.type(field("Name"), "Behbood");
    await user.type(field("Amount invested"), "100000");
    await user.type(field("Profit rate % per year"), "12");
    fireEvent.change(field("Started"), { target: { value: "2026-01-01" } });
    fireEvent.change(field("Matures (optional)"), { target: { value: "2027-01-01" } });
    await user.selectOptions(field("Profit is paid"), "periodic");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.sent("POST", "/assets")).toHaveLength(1));
    expect(api.sent("POST", "/assets")[0].body).toEqual({ kind: "certificate", name: "Behbood", amount: 100000, annual_rate: 12, start_date: "2026-01-01", maturity_date: "2027-01-01", payout: "periodic" });
  });
  it("shows an error toast when adding fails", async () => {
    base({ "POST /assets": new Error("Limit reached") });
    const user = userEvent.setup();
    renderApp(<NetWorthPage />);
    await user.click(await screen.findByRole("button", { name: /Add$/ }));
    await user.type(await findField("Name"), "X");
    await user.type(field("Value"), "1");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Limit reached")).toBeInTheDocument();
  });
  it("edits an item without sending its kind", async () => {
    base();
    const user = userEvent.setup();
    renderApp(<NetWorthPage />);
    await user.click((await screen.findAllByRole("button", { name: "Edit" }))[0]);
    expect(await findField("Name")).toHaveValue("Meezan");
    expect(field("Type")).toBeDisabled();
    await user.clear(field("Value"));
    await user.type(field("Value"), "210000");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.sent("PATCH", `/assets/${uid(1)}`)).toHaveLength(1));
    expect(api.sent("PATCH", `/assets/${uid(1)}`)[0].body).toEqual({ name: "Meezan", amount: 210000 });
    expect(await screen.findByText("Updated")).toBeInTheDocument();
  });
  it("fills the gold fields when editing gold, and can cancel", async () => {
    base();
    const user = userEvent.setup();
    renderApp(<NetWorthPage />);
    await user.click((await screen.findAllByRole("button", { name: "Edit" }))[1]);
    expect(await findField("Weight in grams")).toHaveValue(10);
    expect(field("Karat")).toHaveValue("22");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Weight in grams")).not.toBeInTheDocument());
  });
  it("deletes an item, and reports a failure", async () => {
    base();
    const user = userEvent.setup();
    renderApp(<NetWorthPage />);
    await user.click((await screen.findAllByRole("button", { name: "Delete" }))[0]);
    await waitFor(() => expect(api.sent("DELETE", `/assets/${uid(1)}`)).toHaveLength(1));
    expect(await screen.findByText("Deleted")).toBeInTheDocument();
  });
  it("reports a delete failure", async () => {
    base({ [`DELETE /assets/${uid(1)}`]: new Error("In use") });
    const user = userEvent.setup();
    renderApp(<NetWorthPage />);
    await user.click((await screen.findAllByRole("button", { name: "Delete" }))[0]);
    expect(await screen.findByText("In use")).toBeInTheDocument();
  });
  it("opens the move money sheet for a savings item", async () => {
    base();
    const user = userEvent.setup();
    renderApp(<NetWorthPage />);
    await user.click(await screen.findByRole("button", { name: "Move money" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
  describe("savings moves", () => {
    const moves = [{ id: uid(7), asset_name: "Meezan", direction: "in", amount: 500, occurred_on: "2026-11-08" }, { id: uid(8), asset_name: "Meezan", direction: "out", amount: 200, occurred_on: "2026-11-09" }];
    beforeEach(() => { vi.stubGlobal("confirm", vi.fn(() => true)); });
    it("lists them with sign and direction", async () => {
      base({ "/savings-transfers": moves });
      renderApp(<NetWorthPage />);
      expect(await screen.findByText("Savings moves")).toBeInTheDocument();
      expect(screen.getByText(/Moved back to spending, Nov 9/)).toBeInTheDocument();
      expect(screen.getByText(/^\+.*500/)).toHaveClass("pos");
      expect(screen.getByText(/^-.*200/, { selector: ".ledger-amt" })).toHaveClass("neg");
    });
    it("hides the section when there are none", async () => {
      base();
      renderApp(<NetWorthPage />);
      await screen.findByText("Your items");
      expect(screen.queryByText("Savings moves")).not.toBeInTheDocument();
    });
    it("undoes a move after confirming, with the wording for each direction", async () => {
      base({ "/savings-transfers": moves });
      const user = userEvent.setup();
      renderApp(<NetWorthPage />);
      const undo = await screen.findAllByRole("button", { name: "Undo" });
      await user.click(undo[0]);
      expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining("The item will lose this amount"));
      await user.click(undo[1]);
      expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining("goes back into the item"));
      await waitFor(() => expect(api.sent("DELETE", `/savings-transfers/${uid(7)}`)).toHaveLength(1));
      expect(await screen.findByText("Move undone")).toBeInTheDocument();
    });
    it("does nothing when the undo is declined", async () => {
      base({ "/savings-transfers": moves });
      (confirm as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const user = userEvent.setup();
      renderApp(<NetWorthPage />);
      await user.click((await screen.findAllByRole("button", { name: "Undo" }))[0]);
      expect(api.sent("DELETE", `/savings-transfers/${uid(7)}`)).toHaveLength(0);
    });
    it("shows an error when undo fails", async () => {
      base({ "/savings-transfers": moves, [`DELETE /savings-transfers/${uid(7)}`]: new Error("Too late") });
      const user = userEvent.setup();
      renderApp(<NetWorthPage />);
      await user.click((await screen.findAllByRole("button", { name: "Undo" }))[0]);
      expect(await screen.findByText("Too late")).toBeInTheDocument();
    });
  });
});
