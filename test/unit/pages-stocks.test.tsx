import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, field, findField, renderApp, uid } from "../utils";

const s = vi.hoisted(() => ({ impl: (async () => ({})) as (p: string, o?: unknown) => Promise<unknown>, peek: vi.fn(() => undefined) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/stocks" }));
vi.mock("@/lib/api", () => ({ api: (p: string, o?: unknown) => s.impl(p, o), peek: s.peek, setApiSpace: vi.fn(), clearApiCache: vi.fn(), requestsWaiting: () => 0, API_URL: "http://api.test" }));

import StocksPage from "@/app/(app)/stocks/page";
import HoldingsPanel from "@/components/stocks/HoldingsPanel";
import DividendsPanel from "@/components/stocks/DividendsPanel";
import AlertsPanel from "@/components/stocks/AlertsPanel";

let api: ReturnType<typeof fakeApi>;
const use = (routes: Parameters<typeof fakeApi>[0] = {}) => { api = fakeApi({ "/households/me": { household: null }, ...routes }); s.impl = api.impl as typeof s.impl; };
beforeEach(() => { s.peek.mockReturnValue(undefined); });
const add = () => within(screen.getByRole("dialog"));

describe("Stocks page", () => {
  it("opens on Holdings and switches between the three tabs", async () => {
    use({ "/holdings": { holdings: [], totalValue: 0, totalPnl: 0, fetchedAt: "2026-11-17T10:00:00Z" }, "/dividends": { items: [], summary: null }, "/alerts": [] });
    const user = userEvent.setup();
    renderApp(<StocksPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Stocks" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Holdings" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Dividends" }));
    expect(await screen.findByRole("heading", { name: "Dividends" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Price alerts" }));
    expect(await screen.findByRole("heading", { name: "Price alerts" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Holdings" }));
    expect(screen.getByRole("heading", { name: "Holdings" })).toBeInTheDocument();
  });
  it("is private: not shown in a household space", async () => {
    localStorage.setItem("cl-space", uid(9));
    use({ "/households/me": { household: { id: uid(9), name: "Home", role: "owner", members: [], invites: [], limits: { members: 6 } } } });
    renderApp(<StocksPage />);
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Holdings" })).not.toBeInTheDocument());
  });
});

const holding = (over: Record<string, unknown> = {}) => ({ id: uid(1), symbol: "HUBC", shares: 100, avg_buy_price: 80, manual_price: null, price: 100, change: 1.234, priceSource: "live", value: 10000, pnl: 2000, ...over });
const portfolio = (rows: unknown[], over: Record<string, unknown> = {}) => ({ holdings: rows, totalValue: 10000, totalPnl: 2000, fetchedAt: "2026-11-17T10:00:00Z", ...over });

describe("Holdings panel", () => {
  it("shows an empty state with zero totals", async () => {
    use({ "/holdings": portfolio([], { totalValue: 0, totalPnl: 0 }) });
    renderApp(<HoldingsPanel />);
    expect(await screen.findByText(/No holdings yet/)).toBeInTheDocument();
    expect(screen.getByText(/Up .*0 against what you paid/)).toBeInTheDocument();
  });
  it("lists holdings with price, change, value and gain", async () => {
    use({ "/holdings": portfolio([holding()]) });
    renderApp(<HoldingsPanel />);
    expect(await screen.findByText("HUBC")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("100.00")).toBeInTheDocument();
    expect(screen.getByText("+1.23%")).toHaveClass("pos");
    expect(screen.getByText(/Up .*2,000.* against what you paid/)).toBeInTheDocument();
    expect(screen.getByText(/Updated /)).toBeInTheDocument();
  });
  it("shows losses, manual prices and missing prices", async () => {
    use({ "/holdings": portfolio([
      holding({ pnl: -500, change: -2, priceSource: "manual" }),
      holding({ id: uid(2), symbol: "XYZ", price: null, change: null, value: null, pnl: null, priceSource: "none" }),
    ], { totalPnl: -500 }) });
    renderApp(<HoldingsPanel />);
    expect(await screen.findByText("Manual price")).toBeInTheDocument();
    expect(screen.getByText("No price")).toBeInTheDocument();
    expect(screen.getByText("-2.00%")).toHaveClass("neg");
    expect(screen.getByText(/Down .*500/)).toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(3);
  });
  it("refreshes prices on demand", async () => {
    use({ "/holdings": portfolio([holding()]) });
    const user = userEvent.setup();
    renderApp(<HoldingsPanel />);
    await screen.findByText("HUBC");
    await user.click(screen.getByRole("button", { name: "Refresh prices" }));
    await waitFor(() => expect(api.sent("GET", "/holdings").length).toBeGreaterThanOrEqual(2));
  });
  it("adds a holding", async () => {
    use({ "/holdings": portfolio([]) });
    const user = userEvent.setup();
    renderApp(<HoldingsPanel />);
    await user.click(await screen.findByRole("button", { name: /Add$/ }));
    await user.type(await findField("PSX symbol"), "OGDC");
    await user.type(field("Shares"), "50");
    await user.type(field("Avg buy price"), "120.5");
    await user.click(add().getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.sent("POST", "/holdings")).toHaveLength(1));
    expect(api.sent("POST", "/holdings")[0].body).toEqual({ symbol: "OGDC", shares: 50, avg_buy_price: 120.5, manual_price: null });
    expect(await screen.findByText("Holding added")).toBeInTheDocument();
  });
  it("sends a manual fallback price when given", async () => {
    use({ "/holdings": portfolio([]) });
    const user = userEvent.setup();
    renderApp(<HoldingsPanel />);
    await user.click(await screen.findByRole("button", { name: /Add$/ }));
    await user.type(await findField("PSX symbol"), "ZZZ");
    await user.type(field("Shares"), "1");
    await user.type(field("Manual price (fallback)"), "9");
    await user.click(add().getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.sent("POST", "/holdings")).toHaveLength(1));
    expect(api.sent("POST", "/holdings")[0].body).toMatchObject({ avg_buy_price: null, manual_price: 9 });
  });
  it("shows the error when adding fails", async () => {
    use({ "/holdings": portfolio([]), "POST /holdings": new Error("Unknown symbol") });
    const user = userEvent.setup();
    renderApp(<HoldingsPanel />);
    await user.click(await screen.findByRole("button", { name: /Add$/ }));
    await user.type(await findField("PSX symbol"), "NOPE");
    await user.type(field("Shares"), "1");
    await user.click(add().getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Unknown symbol")).toBeInTheDocument();
  });
  it("edits a holding, filling the form first", async () => {
    use({ "/holdings": portfolio([holding({ manual_price: 95 })]) });
    const user = userEvent.setup();
    renderApp(<HoldingsPanel />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(await findField("PSX symbol")).toHaveValue("HUBC");
    expect(field("Shares")).toHaveValue(100);
    expect(field("Avg buy price")).toHaveValue(80);
    expect(field("Manual price (fallback)")).toHaveValue(95);
    await user.clear(field("Shares"));
    await user.type(field("Shares"), "120");
    await user.click(add().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.sent("PATCH", `/holdings/${uid(1)}`)).toHaveLength(1));
    expect(api.sent("PATCH", `/holdings/${uid(1)}`)[0].body).toEqual({ symbol: "HUBC", shares: 120, avg_buy_price: 80, manual_price: 95 });
    expect(await screen.findByText("Holding updated")).toBeInTheDocument();
  });
  it("leaves the optional prices empty when the holding has none", async () => {
    use({ "/holdings": portfolio([holding({ avg_buy_price: null })]) });
    const user = userEvent.setup();
    renderApp(<HoldingsPanel />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(await findField("Avg buy price")).toHaveValue(null);
    await user.click(add().getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("deletes a holding, and reports failures", async () => {
    use({ "/holdings": portfolio([holding()]) });
    const user = userEvent.setup();
    const first = renderApp(<HoldingsPanel />);
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.sent("DELETE", `/holdings/${uid(1)}`)).toHaveLength(1));
    expect(await screen.findByText("Holding deleted")).toBeInTheDocument();
    first.unmount();
    use({ "/holdings": portfolio([holding()]), [`DELETE /holdings/${uid(1)}`]: new Error("Cannot delete") });
    renderApp(<HoldingsPanel />);
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Cannot delete")).toBeInTheDocument();
  });
  it("starts from the cached portfolio", () => {
    s.peek.mockImplementation(((p: string) => (p === "/holdings" ? portfolio([holding()]) : undefined)) as never);
    use({ "/holdings": portfolio([holding()]) });
    renderApp(<HoldingsPanel />);
    expect(screen.getByText("HUBC")).toBeInTheDocument();
  });
});

const div = (over: Record<string, unknown> = {}) => ({ id: uid(1), symbol: "OGDC", shares: 100, per_share: 5, ex_date: "2026-11-01", pay_date: "2026-11-20", tax_pct: 15, status: "expected", received_on: null, gross: 500, net: 425, ...over });
const divData = (items: unknown[], summary: Record<string, unknown> | null = { receivedThisFinancialYear: 1000, receivedLast12Months: 2000, expectedCount: 1, expectedNet: 425, yieldOnCost: 6.5 }) => ({ items, summary });

describe("Dividends panel", () => {
  it("shows the summary cards", async () => {
    use({ "/dividends": divData([div()]) });
    renderApp(<DividendsPanel />);
    expect(await screen.findByText("Received this financial year")).toBeInTheDocument();
    expect(screen.getByText("Expected (1)")).toBeInTheDocument();
    expect(screen.getByText("6.5%")).toBeInTheDocument();
    expect(screen.getByText("Last 12 months").nextSibling).toHaveTextContent(/2,000/);
  });
  it("shows a dash when there is no yield, loading and empty states", async () => {
    use({ "/dividends": divData([], { receivedThisFinancialYear: 0, receivedLast12Months: 0, expectedCount: 0, expectedNet: 0, yieldOnCost: null }) });
    renderApp(<DividendsPanel />);
    expect(await screen.findByText(/No dividends yet/)).toBeInTheDocument();
    expect(screen.getByText("Yield on cost").nextSibling).toHaveTextContent("-");
  });
  it("shows Loading before data arrives", () => {
    use();
    s.impl = (() => new Promise(() => {})) as never;
    renderApp(<DividendsPanel />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
  it("lists expected and received dividends with the right actions", async () => {
    use({ "/dividends": divData([div(), div({ id: uid(2), symbol: "PPL", status: "received", received_on: "2026-10-05", pay_date: null })]) });
    renderApp(<DividendsPanel />);
    const exp = (await screen.findByText("OGDC")).closest("tr") as HTMLElement;
    expect(within(exp).getByText("Expected")).toBeInTheDocument();
    expect(within(exp).getByText(/Ex 2026-11-01, pays 2026-11-20/)).toBeInTheDocument();
    expect(within(exp).getByText(/100 shares at 5 each/)).toBeInTheDocument();
    expect(within(exp).getByRole("button", { name: "Mark received" })).toBeInTheDocument();
    const rec = screen.getByText("PPL").closest("tr") as HTMLElement;
    expect(within(rec).getByText("Received 2026-10-05")).toBeInTheDocument();
    expect(within(rec).queryByRole("button", { name: "Mark received" })).not.toBeInTheDocument();
    expect(within(rec).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(within(rec).getByText(/^Ex 2026-11-01$/)).toBeInTheDocument();
  });
  it("adds a dividend with the default 15 percent tax", async () => {
    use({ "/dividends": divData([]) });
    const user = userEvent.setup();
    renderApp(<DividendsPanel />);
    await user.click(await screen.findByRole("button", { name: /Add$/ }));
    await user.type(await findField("Symbol"), "ENGRO");
    await user.type(field("Shares held"), "10");
    await user.type(field("Dividend per share"), "2.5");
    fireEvent.change(field("Ex-dividend date"), { target: { value: "2026-11-10" } });
    expect(field("Tax withheld %")).toHaveValue(15);
    await user.click(add().getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.sent("POST", "/dividends")).toHaveLength(1));
    expect(api.sent("POST", "/dividends")[0].body).toEqual({ symbol: "ENGRO", ex_date: "2026-11-10", pay_date: null, per_share: 2.5, shares: 10, tax_pct: 15 });
    expect(await screen.findByText("Dividend added")).toBeInTheDocument();
  });
  it("sends a payment date and custom tax", async () => {
    use({ "/dividends": divData([]) });
    const user = userEvent.setup();
    renderApp(<DividendsPanel />);
    await user.click(await screen.findByRole("button", { name: /Add$/ }));
    await user.type(await findField("Symbol"), "A");
    await user.type(field("Shares held"), "1");
    await user.type(field("Dividend per share"), "1");
    fireEvent.change(field("Ex-dividend date"), { target: { value: "2026-11-10" } });
    fireEvent.change(field("Payment date"), { target: { value: "2026-11-30" } });
    fireEvent.change(field("Tax withheld %"), { target: { value: "25" } });
    await user.click(add().getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.sent("POST", "/dividends")).toHaveLength(1));
    expect(api.sent("POST", "/dividends")[0].body).toMatchObject({ pay_date: "2026-11-30", tax_pct: 25 });
  });
  it("shows an error toast when adding fails", async () => {
    use({ "/dividends": divData([]), "POST /dividends": new Error("Invalid dividend") });
    const user = userEvent.setup();
    renderApp(<DividendsPanel />);
    await user.click(await screen.findByRole("button", { name: /Add$/ }));
    await user.type(await findField("Symbol"), "A");
    await user.type(field("Shares held"), "1");
    await user.type(field("Dividend per share"), "1");
    await user.click(add().getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Invalid dividend")).toBeInTheDocument();
  });
  it("edits an expected dividend", async () => {
    use({ "/dividends": divData([div()]) });
    const user = userEvent.setup();
    renderApp(<DividendsPanel />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(await findField("Symbol")).toHaveValue("OGDC");
    expect(field("Dividend per share")).toHaveValue(5);
    expect(field("Payment date")).toHaveValue("2026-11-20");
    expect(field("Tax withheld %")).toHaveValue(15);
    await user.clear(field("Dividend per share"));
    await user.type(field("Dividend per share"), "6");
    await user.click(add().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.sent("PATCH", `/dividends/${uid(1)}`)).toHaveLength(1));
    expect(api.sent("PATCH", `/dividends/${uid(1)}`)[0].body).toMatchObject({ per_share: 6, shares: 100 });
    expect(await screen.findByText("Dividend updated")).toBeInTheDocument();
  });
  it("marks received and adds to income", async () => {
    use({ "/dividends": divData([div()]) });
    const user = userEvent.setup();
    renderApp(<DividendsPanel />);
    await user.click(await screen.findByRole("button", { name: "Mark received" }));
    await waitFor(() => expect(api.sent("POST", `/dividends/${uid(1)}/receive`)).toHaveLength(1));
    expect(api.sent("POST", `/dividends/${uid(1)}/receive`)[0].body).toEqual({ add_to_income: true });
    expect(await screen.findByText(/added to this month's income/)).toBeInTheDocument();
  });
  it("shows errors for receive and delete", async () => {
    use({ "/dividends": divData([div()]), [`POST /dividends/${uid(1)}/receive`]: new Error("Already received"), [`DELETE /dividends/${uid(1)}`]: new Error("Cannot delete") });
    const user = userEvent.setup();
    renderApp(<DividendsPanel />);
    await user.click(await screen.findByRole("button", { name: "Mark received" }));
    expect(await screen.findByText("Already received")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Cannot delete")).toBeInTheDocument();
  });
  it("deletes a dividend", async () => {
    use({ "/dividends": divData([div()]) });
    const user = userEvent.setup();
    renderApp(<DividendsPanel />);
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.sent("DELETE", `/dividends/${uid(1)}`)).toHaveLength(1));
    expect(await screen.findByText("Dividend deleted")).toBeInTheDocument();
  });
});

const alert = (over: Record<string, unknown> = {}) => ({ id: uid(1), symbol: "HUBC", direction: "above", target: 150, active: true, triggered_at: null, triggered_price: null, ...over });

describe("Alerts panel", () => {
  it("splits active and reached alerts", async () => {
    use({ "/alerts": [alert(), alert({ id: uid(2), symbol: "OGDC", direction: "below", target: 90, active: false, triggered_at: "2026-11-10T10:00:00Z", triggered_price: 89.5 })] });
    renderApp(<AlertsPanel />);
    expect(await screen.findByRole("heading", { name: "Watching" })).toBeInTheDocument();
    expect(screen.getByText("At or above 150")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reached" })).toBeInTheDocument();
    expect(screen.getByText(/At or below 90/)).toBeInTheDocument();
    expect(screen.getByText(/at 89.5/)).toBeInTheDocument();
  });
  it("shows empty states, hiding Reached when none", async () => {
    use({ "/alerts": [] });
    renderApp(<AlertsPanel />);
    expect(await screen.findByText("No active alerts.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Reached" })).not.toBeInTheDocument();
  });
  it("shows Loading before alerts arrive", () => {
    use();
    s.impl = (() => new Promise(() => {})) as never;
    renderApp(<AlertsPanel />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
  it("creates an alert with email on by default", async () => {
    use({ "/alerts": [] });
    const user = userEvent.setup();
    renderApp(<AlertsPanel />);
    await user.click(await screen.findByRole("button", { name: /Add$/ }));
    await user.type(await findField("PSX symbol"), "HUBC");
    await user.selectOptions(field("Tell me when the price is"), "below");
    await user.type(field("Target price"), "99.5");
    await user.click(add().getByRole("button", { name: "Set alert" }));
    await waitFor(() => expect(api.sent("POST", "/alerts")).toHaveLength(1));
    expect(api.sent("POST", "/alerts")[0].body).toEqual({ symbol: "HUBC", direction: "below", target: 99.5, notify_email: true });
    expect(await screen.findByText("Alert set")).toBeInTheDocument();
  });
  it("can switch email off for one alert", async () => {
    use({ "/alerts": [] });
    const user = userEvent.setup();
    renderApp(<AlertsPanel />);
    await user.click(await screen.findByRole("button", { name: /Add$/ }));
    await user.type(await findField("PSX symbol"), "A");
    await user.type(field("Target price"), "1");
    await user.click(add().getByRole("checkbox"));
    await user.click(add().getByRole("button", { name: "Set alert" }));
    await waitFor(() => expect(api.sent("POST", "/alerts")).toHaveLength(1));
    expect(api.sent("POST", "/alerts")[0].body).toMatchObject({ notify_email: false });
  });
  it("warns when the server cannot email", async () => {
    use({ "/alerts": [], "/features": { ai: false, email: false } });
    const user = userEvent.setup();
    renderApp(<AlertsPanel />);
    await user.click(await screen.findByRole("button", { name: /Add$/ }));
    expect(await screen.findByText(/email is not set up on this server yet/)).toBeInTheDocument();
  });
  it("shows an error toast when creating fails", async () => {
    use({ "/alerts": [], "POST /alerts": new Error("Too many alerts") });
    const user = userEvent.setup();
    renderApp(<AlertsPanel />);
    await user.click(await screen.findByRole("button", { name: /Add$/ }));
    await user.type(await findField("PSX symbol"), "A");
    await user.type(field("Target price"), "1");
    await user.click(add().getByRole("button", { name: "Set alert" }));
    expect(await screen.findByText("Too many alerts")).toBeInTheDocument();
  });
  it("deletes and re-arms", async () => {
    use({ "/alerts": [alert(), alert({ id: uid(2), symbol: "OGDC", active: false, triggered_at: "2026-11-10T10:00:00Z" })] });
    const user = userEvent.setup();
    renderApp(<AlertsPanel />);
    await user.click(await screen.findByRole("button", { name: "Re-arm" }));
    await waitFor(() => expect(api.sent("POST", `/alerts/${uid(2)}/rearm`)).toHaveLength(1));
    expect(await screen.findByText("Alert re-armed")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    await waitFor(() => expect(api.sent("DELETE", `/alerts/${uid(1)}`)).toHaveLength(1));
    expect(await screen.findByText("Alert deleted")).toBeInTheDocument();
  });
  it("shows an error when an action fails", async () => {
    use({ "/alerts": [alert()], [`DELETE /alerts/${uid(1)}`]: new Error("Gone already") });
    const user = userEvent.setup();
    renderApp(<AlertsPanel />);
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Gone already")).toBeInTheDocument();
  });
});
