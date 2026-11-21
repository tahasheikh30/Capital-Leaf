import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderApp } from "../utils";

const s = vi.hoisted(() => ({ impl: (async () => ({})) as (p: string, o?: unknown) => Promise<unknown>, peek: vi.fn(() => undefined) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/zakat" }));
vi.mock("@/lib/api", () => ({ api: (p: string, o?: unknown) => s.impl(p, o), peek: s.peek, setApiSpace: vi.fn(), clearApiCache: vi.fn(), requestsWaiting: () => 0, API_URL: "http://api.test" }));

import ZakatPage from "@/app/(app)/zakat/page";

const nw = (over: Record<string, unknown> = {}) => ({
  total: 0, classes: { cash: 1_000_000, stocks: 500_000, gold: 1_500_000, certificates: 0, mutualFunds: 0, other: 0, liabilities: 100_000 },
  goldRate: { perTola24k: 349_920, perGram24k: 30000, stale: false }, ...over,
});
const use = (routes: Parameters<typeof fakeApi>[0]) => { s.impl = fakeApi({ "/households/me": { household: null }, ...routes }).impl as typeof s.impl; };
beforeEach(() => s.peek.mockReturnValue(undefined));
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe("Zakat page", () => {
  it("fills amounts and the gold price from net worth", async () => {
    use({ "/net-worth": nw() });
    renderApp(<ZakatPage />);
    await waitFor(() => expect(input("Cash and bank").value).toBe("1000000"));
    expect(input("Gold").value).toBe("1500000");
    expect(input("PSX stocks").value).toBe("500000");
    expect(input("Debts to subtract").value).toBe("100000");
    expect(input("24k gold price per gram").value).toBe("30000");
  });
  it("shows no zakat below the nisab", async () => {
    use({ "/net-worth": nw({ classes: { cash: 500_000, stocks: 100_000, gold: 1_000_000, certificates: 0, mutualFunds: 0, other: 0, liabilities: 0 } }) });
    renderApp(<ZakatPage />);
    await waitFor(() => expect(input("Cash and bank").value).toBe("500000"));
    expect(screen.getByTestId("zakat-result")).toHaveTextContent(/below the nisab, so no zakat is due/);
    expect(screen.getByTestId("zakat-result")).toHaveTextContent(/Nisab.*2,624,400/);
  });
  it("works out 2.5% once wealth passes the nisab", async () => {
    use({ "/net-worth": nw() });
    renderApp(<ZakatPage />);
    await waitFor(() => expect(input("Cash and bank").value).toBe("1000000"));
    const user = userEvent.setup();
    await user.clear(input("Cash and bank"));
    await user.type(input("Cash and bank"), "3000000");
    // 3,000,000 + 1,500,000 + 500,000 - 100,000 = 4,900,000 -> 122,500
    expect(screen.getByTestId("zakat-result")).toHaveTextContent(/122,500/);
    expect(screen.getByTestId("zakat-result")).toHaveTextContent(/2\.5% of/);
    expect(screen.getByTestId("zakat-result")).toHaveTextContent(/less debts/);
  });
  it("asks for the silver price when measuring by silver", async () => {
    use({ "/net-worth": nw() });
    renderApp(<ZakatPage />);
    await waitFor(() => expect(input("Cash and bank").value).toBe("1000000"));
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Measure the nisab by"), "silver");
    expect(screen.getByText("Enter the silver price to see the nisab.")).toBeInTheDocument();
    await user.type(input("Silver price per gram"), "300");
    expect(screen.getByTestId("zakat-result")).toHaveTextContent(/183,708/);
    expect(screen.getByTestId("zakat-result")).toHaveTextContent(/Rs\s?\d/);
  });
  it("asks for the gold price when no market rate is available", async () => {
    use({ "/net-worth": nw({ goldRate: null }) });
    renderApp(<ZakatPage />);
    await waitFor(() => expect(input("Cash and bank").value).toBe("1000000"));
    expect(input("24k gold price per gram").value).toBe("");
    expect(screen.getByText("Enter the gold price to see the nisab.")).toBeInTheDocument();
  });
  it("shows the error when loading fails", async () => {
    use({ "/net-worth": new Error("Server down") });
    renderApp(<ZakatPage />);
    expect(await screen.findByText("Server down")).toBeInTheDocument();
  });
  it("says it is a guide, not a ruling", async () => {
    use({ "/net-worth": nw() });
    renderApp(<ZakatPage />);
    expect(await screen.findByText(/guide, not a ruling/)).toBeInTheDocument();
  });
});
