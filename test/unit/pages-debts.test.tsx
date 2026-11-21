import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, field, renderApp, uid } from "../utils";

const s = vi.hoisted(() => ({ impl: (async () => ({})) as (p: string, o?: unknown) => Promise<unknown>, peek: vi.fn(() => undefined) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/debts" }));
vi.mock("@/lib/api", () => ({ api: (p: string, o?: unknown) => s.impl(p, o), peek: s.peek, setApiSpace: vi.fn(), clearApiCache: vi.fn(), requestsWaiting: () => 0, API_URL: "http://api.test" }));

import DebtsPage from "@/app/(app)/debts/page";

const use = (routes: Parameters<typeof fakeApi>[0]) => { s.impl = fakeApi({ "/households/me": { household: null }, ...routes }).impl as typeof s.impl; };
beforeEach(() => s.peek.mockReturnValue(undefined));
const debt = (over: Record<string, unknown> = {}) => ({ id: uid(1), kind: "liability", name: "Car loan", amount: 10000, annual_rate: 12, min_payment: 500, ...over });

describe("Debt payoff page", () => {
  it("explains how to add a debt when there are none", async () => {
    use({ "/assets": [{ id: uid(9), kind: "cash", name: "Bank", amount: 5 }] });
    renderApp(<DebtsPage />);
    expect(await screen.findByText(/No debts to plan/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Net worth" })).toHaveAttribute("href", "/net-worth");
  });
  it("shows the error when loading fails", async () => {
    use({ "/assets": new Error("Server down") });
    renderApp(<DebtsPage />);
    expect(await screen.findByText("Server down")).toBeInTheDocument();
  });
  it("shows the payoff time, interest and comparison with minimums", async () => {
    use({ "/assets": [debt()] });
    renderApp(<DebtsPage />);
    const summary = await screen.findByTestId("summary");
    expect(summary).toHaveTextContent(/Debt free in/);
    expect(summary).toHaveTextContent(/Total interest/);
    expect(summary).toHaveTextContent(/Minimums only/);
    expect(screen.getByText(/Cleared in/)).toBeInTheDocument();
    expect(screen.getByText(/at 12% a year, minimum/)).toBeInTheDocument();
  });
  it("extra money shortens the plan", async () => {
    use({ "/assets": [debt()] });
    renderApp(<DebtsPage />);
    const before = (await screen.findByTestId("summary")).textContent;
    const user = userEvent.setup();
    const extra = field("Extra you can pay each month");
    await user.clear(extra);
    await user.type(extra, "2000");
    await waitFor(() => expect(screen.getByTestId("summary").textContent).not.toBe(before));
    expect(screen.getByTestId("summary")).toHaveTextContent(/less than paying only the minimums/);
  });
  it("lets you switch strategy and compares with the other one", async () => {
    use({ "/assets": [debt({ id: uid(1), name: "Big", amount: 9000, annual_rate: 30, min_payment: 300 }), debt({ id: uid(2), name: "Small", amount: 800, annual_rate: 3, min_payment: 100 })] });
    renderApp(<DebtsPage />);
    await screen.findByTestId("summary");
    const user = userEvent.setup();
    await user.type(field("Extra you can pay each month"), "500");
    await user.selectOptions(field("Which debt to attack first"), "snowball");
    expect(screen.getByTestId("summary")).toHaveTextContent(/Highest interest first would cost|Smallest balance first would cost/);
  });
  it("warns when a minimum does not cover interest", async () => {
    use({ "/assets": [debt({ amount: 100000, annual_rate: 36, min_payment: 100 })] });
    renderApp(<DebtsPage />);
    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(screen.getByText(/does not cover its monthly interest/)).toBeInTheDocument();
    expect(screen.getByText(/will not clear your debts within 50 years/)).toBeInTheDocument();
    expect(screen.queryByTestId("summary")).not.toBeInTheDocument();
  });
  it("treats a missing rate as no interest", async () => {
    use({ "/assets": [debt({ annual_rate: null, min_payment: null, amount: 3000 })] });
    renderApp(<DebtsPage />);
    expect(await screen.findByText(/Total interest/)).toHaveTextContent(/0/);
  });
});
