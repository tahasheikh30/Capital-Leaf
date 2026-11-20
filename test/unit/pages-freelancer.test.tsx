import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState, type ComponentType } from "react";
import { fakeApi, renderApp, uid } from "../utils";

const s = vi.hoisted(() => ({ impl: (async () => ({})) as (p: string, o?: unknown) => Promise<unknown>, peek: vi.fn(() => undefined) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/freelancer" }));
vi.mock("@/lib/api", () => ({ api: (p: string, o?: unknown) => s.impl(p, o), peek: s.peek, setApiSpace: vi.fn(), clearApiCache: vi.fn(), requestsWaiting: () => 0, API_URL: "http://api.test" }));
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<ComponentType<Record<string, unknown>>>) =>
    function Lazy(props: Record<string, unknown>) {
      const [Comp, setComp] = useState<ComponentType<Record<string, unknown>> | null>(null);
      useEffect(() => { loader().then((c) => setComp(() => c)); }, []);
      return Comp ? <Comp {...props} /> : null;
    },
}));
vi.mock("@/components/DashboardCharts", () => ({ IncomeSwingChart: ({ data }: { data: unknown[] }) => <div data-testid="swing">{data.length} points</div> }));

import FreelancerPage from "@/app/(app)/freelancer/page";

let api: ReturnType<typeof fakeApi>;
const use = (routes: Parameters<typeof fakeApi>[0]) => { api = fakeApi({ "/households/me": { household: null }, ...routes }); s.impl = api.impl as typeof s.impl; };
beforeEach(() => { s.peek.mockReturnValue(undefined); });

const summary = (over: Record<string, unknown> = {}) => ({
  enabled: true, taxPct: 15,
  months: [{ month: "2026-08", income: 0, spent: 0 }, { month: "2026-09", income: 80000, spent: 30000 }, { month: "2026-10", income: 120000, spent: 40000 }],
  stats: { enoughHistory: true, averageIncome: 100000, safeMonthlyBudget: 85000, runwayMonths: 4.5, swing: 0.4,
    thisMonth: { income: 50000, taxSetAside: 7500, spent: 20000, vsAverage: -50000 },
    lowestMonth: { month: "2026-09", income: 80000 }, highestMonth: { month: "2026-10", income: 120000 } },
  tax: { financialYearStart: "2026-07-01", incomeThisYear: 250000, setAsideTarget: 37500, paid: 10000, stillToHold: 27500 },
  payments: [{ id: uid(1), paid_on: "2026-10-01", amount: 10000, note: "Advance tax" }, { id: uid(2), paid_on: "2026-09-01", amount: 5, note: null }],
  ...over,
});
const put = (d: unknown) => use({ "/freelancer/summary": d });

describe("Freelancer page", () => {
  it("shows an error when loading fails", async () => {
    put(new Error("Could not load"));
    renderApp(<FreelancerPage />);
    expect(await screen.findByText("Could not load")).toBeInTheDocument();
  });
  it("shows a loading skeleton first", () => {
    put(new Promise(() => {}));
    s.impl = (() => new Promise(() => {})) as never;
    renderApp(<FreelancerPage />);
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  });
  it("offers to turn the mode on", async () => {
    put(summary({ enabled: false }));
    const user = userEvent.setup();
    renderApp(<FreelancerPage />);
    await user.click(await screen.findByRole("button", { name: "Turn on freelancer mode" }));
    await waitFor(() => expect(api.sent("PATCH", "/profile")[0]?.body).toEqual({ freelancer_mode: true }));
    expect(await screen.findByText("Freelancer mode is on")).toBeInTheDocument();
  });
  it("shows an error when turning it on fails", async () => {
    put(summary({ enabled: false }));
    use({ "/freelancer/summary": summary({ enabled: false }), "PATCH /profile": new Error("Nope") });
    const user = userEvent.setup();
    renderApp(<FreelancerPage />);
    await user.click(await screen.findByRole("button", { name: "Turn on freelancer mode" }));
    expect(await screen.findByText("Nope")).toBeInTheDocument();
  });
  it("shows the safe monthly budget, stats and tax jar", async () => {
    put(summary());
    renderApp(<FreelancerPage />);
    expect(await screen.findByText("Safe to spend each month")).toBeInTheDocument();
    expect(screen.getByText(/85,000/, { selector: ".hero-figure" })).toBeInTheDocument();
    expect(screen.getByText(/Based on your average income of .*100,000.*, after 15% for tax/)).toBeInTheDocument();
    expect(screen.getByText("4.5 months")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("Tax jar, since 2026-07-01")).toBeInTheDocument();
    expect(screen.getByText("To set aside at 15%")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change 15% rate" })).toHaveAttribute("href", "/settings#features");
    expect(screen.getByText("Should still be sitting aside").nextSibling).toHaveClass("neg");
  });
  it("explains when there is not enough history", async () => {
    put(summary({ stats: { ...summary().stats, enoughHistory: false, safeMonthlyBudget: null, averageIncome: null, runwayMonths: null, swing: null, thisMonth: { income: 0, taxSetAside: 0, spent: 0, vsAverage: null }, lowestMonth: null, highestMonth: null } }));
    renderApp(<FreelancerPage />);
    expect(await screen.findByText("Not yet")).toBeInTheDocument();
    expect(screen.getByText(/at least three completed months/)).toBeInTheDocument();
    expect(screen.getAllByText("-")).toHaveLength(3);
    expect(screen.queryByText(/your average so far/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Best month/)).not.toBeInTheDocument();
  });
  it("compares this month with the average, below and above", async () => {
    put(summary());
    const first = renderApp(<FreelancerPage />);
    expect(await screen.findByText(/below your average so far/)).toHaveClass("neg");
    first.unmount();
    put(summary({ stats: { ...summary().stats, thisMonth: { income: 1, taxSetAside: 0, spent: 0, vsAverage: 2000 } } }));
    renderApp(<FreelancerPage />);
    expect(await screen.findByText(/above your average so far/)).toHaveClass("pos");
  });
  it("shows best and slowest month", async () => {
    put(summary());
    renderApp(<FreelancerPage />);
    expect(await screen.findByText(/Best month .*Oct.*120,000.*slowest .*Sep.*80,000/)).toBeInTheDocument();
  });
  it("marks the jar fine when nothing is left to hold", async () => {
    put(summary({ tax: { ...summary().tax, stillToHold: -100 } }));
    renderApp(<FreelancerPage />);
    const cell = (await screen.findByText("Should still be sitting aside")).nextSibling as HTMLElement;
    expect(cell).toHaveClass("pos");
    expect(cell).toHaveTextContent(/0$/);
  });
  it("handles a zero target without dividing by zero", async () => {
    put(summary({ tax: { ...summary().tax, setAsideTarget: 0, paid: 0, stillToHold: 0 } }));
    renderApp(<FreelancerPage />);
    expect(await screen.findByText("Tax jar, since 2026-07-01")).toBeInTheDocument();
  });
  it("charts from the first month that has data", async () => {
    put(summary());
    renderApp(<FreelancerPage />);
    expect(await screen.findByTestId("swing")).toHaveTextContent("2 points");
  });
  it("charts everything when no month has data", async () => {
    put(summary({ months: [{ month: "2026-09", income: 0, spent: 0 }, { month: "2026-10", income: 0, spent: 0 }] }));
    renderApp(<FreelancerPage />);
    expect(await screen.findByTestId("swing")).toHaveTextContent(/points/);
  });
  it("lists payments with a default label", async () => {
    put(summary());
    renderApp(<FreelancerPage />);
    expect(await screen.findByText("Advance tax")).toBeInTheDocument();
    expect(screen.getByText("Tax payment")).toBeInTheDocument();
  });
  it("shows an empty payments state", async () => {
    put(summary({ payments: [] }));
    renderApp(<FreelancerPage />);
    expect(await screen.findByText(/No tax payments recorded yet/)).toBeInTheDocument();
  });
  it("records a payment", async () => {
    put(summary());
    const user = userEvent.setup();
    renderApp(<FreelancerPage />);
    await user.click(await screen.findByRole("button", { name: /Record a payment/ }));
    fireEvent.change(await screen.findByLabelText("Date"), { target: { value: "2026-11-10" } });
    await user.type(screen.getByLabelText("Amount"), "2500");
    await user.type(screen.getByLabelText("Note"), "Q2");
    await user.click(screen.getByRole("button", { name: "Save payment" }));
    await waitFor(() => expect(api.sent("POST", "/freelancer/payments")).toHaveLength(1));
    expect(api.sent("POST", "/freelancer/payments")[0].body).toEqual({ paid_on: "2026-11-10", amount: 2500, note: "Q2" });
    expect(await screen.findByText("Tax payment recorded")).toBeInTheDocument();
  });
  it("sends a null note when it is blank", async () => {
    put(summary());
    const user = userEvent.setup();
    renderApp(<FreelancerPage />);
    await user.click(await screen.findByRole("button", { name: /Record a payment/ }));
    await user.type(await screen.findByLabelText("Amount"), "10");
    await user.click(screen.getByRole("button", { name: "Save payment" }));
    await waitFor(() => expect(api.sent("POST", "/freelancer/payments")).toHaveLength(1));
    expect(api.sent("POST", "/freelancer/payments")[0].body).toMatchObject({ amount: 10, note: null });
  });
  it("shows an error when recording fails", async () => {
    use({ "/freelancer/summary": summary(), "POST /freelancer/payments": new Error("Bad amount") });
    const user = userEvent.setup();
    renderApp(<FreelancerPage />);
    await user.click(await screen.findByRole("button", { name: /Record a payment/ }));
    await user.type(await screen.findByLabelText("Amount"), "10");
    await user.click(screen.getByRole("button", { name: "Save payment" }));
    expect(await screen.findByText("Bad amount")).toBeInTheDocument();
  });
  it("deletes a payment", async () => {
    put(summary());
    const user = userEvent.setup();
    renderApp(<FreelancerPage />);
    await user.click((await screen.findAllByRole("button", { name: "Delete" }))[0]);
    await waitFor(() => expect(api.sent("DELETE", `/freelancer/payments/${uid(1)}`)).toHaveLength(1));
    expect(await screen.findByText("Payment deleted")).toBeInTheDocument();
  });
  it("shows an error when deleting fails", async () => {
    use({ "/freelancer/summary": summary(), [`DELETE /freelancer/payments/${uid(1)}`]: new Error("Locked") });
    const user = userEvent.setup();
    renderApp(<FreelancerPage />);
    await user.click((await screen.findAllByRole("button", { name: "Delete" }))[0]);
    expect(await screen.findByText("Locked")).toBeInTheDocument();
  });
});
