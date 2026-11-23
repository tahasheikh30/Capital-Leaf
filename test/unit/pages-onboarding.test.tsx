import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderApp } from "../utils";

const s = vi.hoisted(() => ({
  impl: (async () => ({})) as (p: string, o?: unknown) => Promise<unknown>,
  replace: vi.fn(),
  path: "/dashboard",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: s.replace, refresh: vi.fn() }), usePathname: () => s.path }));
vi.mock("@/lib/api", () => ({ api: (p: string, o?: unknown) => s.impl(p, o), peek: vi.fn(), setApiSpace: vi.fn(), clearApiCache: vi.fn(), requestsWaiting: () => 0, API_URL: "http://api.test" }));

import WelcomePage from "@/app/welcome/page";
import ProfileGate from "@/components/ProfileGate";
import { announceCurrency, currencySymbol, getDefaultCurrency, setDefaultCurrency } from "@/lib/currency";
import { money } from "@/lib/format";

const profile = (over: Record<string, unknown> = {}) => ({ id: "u", full_name: null, currency: "PKR", onboarded_at: null, ...over });
const use = (routes: Parameters<typeof fakeApi>[0]) => {
  const f = fakeApi(routes);
  s.impl = f.impl as typeof s.impl;
  return f;
};
beforeEach(() => {
  s.replace.mockClear();
  s.path = "/dashboard";
  setDefaultCurrency("PKR");
});

describe("currency helpers", () => {
  it("formats money in the account currency and falls back to rupees", () => {
    setDefaultCurrency("USD");
    expect(money(1500)).toContain("1,500");
    expect(money(1500)).toMatch(/US\$|\$/);
    setDefaultCurrency("nonsense");
    expect(getDefaultCurrency()).toBe("PKR");
    expect(money(1500, "EUR")).toMatch(/€/);
  });
  it("gives a short symbol", () => {
    expect(currencySymbol("PKR")).toBe("Rs");
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("ZZZ")).toBeTruthy();
  });
  it("broadcasts a change", () => {
    const seen: string[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent<string>).detail);
    window.addEventListener("coinleaf:currency", on);
    announceCurrency("GBP");
    window.removeEventListener("coinleaf:currency", on);
    expect(seen).toEqual(["GBP"]);
    expect(getDefaultCurrency()).toBe("GBP");
  });
});

describe("ProfileGate", () => {
  it("sends a brand new account to the setup", async () => {
    use({ "/profile": profile() });
    render(<ProfileGate><p>app</p></ProfileGate>);
    await waitFor(() => expect(s.replace).toHaveBeenCalledWith("/welcome"));
  });
  it("leaves finished accounts alone and applies their currency", async () => {
    use({ "/profile": profile({ onboarded_at: "2026-01-01T00:00:00Z", currency: "AED" }) });
    render(<ProfileGate><p>app</p></ProfileGate>);
    await waitFor(() => expect(getDefaultCurrency()).toBe("AED"));
    expect(s.replace).not.toHaveBeenCalled();
  });
  it("treats a profile without the flag as set up", async () => {
    use({ "/profile": { id: "u", currency: "PKR" } });
    render(<ProfileGate><p>app</p></ProfileGate>);
    await screen.findByText("app");
    expect(s.replace).not.toHaveBeenCalled();
  });
  it("does not loop when already on the setup page", async () => {
    s.path = "/welcome";
    const f = use({ "/profile": profile() });
    render(<ProfileGate><p>app</p></ProfileGate>);
    await waitFor(() => expect(f.calls.length).toBeGreaterThan(0));
    expect(s.replace).not.toHaveBeenCalled();
  });
  it("redraws when the currency changes", async () => {
    use({ "/profile": profile({ onboarded_at: "x" }) });
    render(<ProfileGate><p>app</p></ProfileGate>);
    await screen.findByText("app");
    act(() => announceCurrency("EUR"));
    expect(getDefaultCurrency()).toBe("EUR");
  });
  it("survives a failed profile load", async () => {
    use({ "/profile": new Error("down") });
    render(<ProfileGate><p>app</p></ProfileGate>);
    await screen.findByText("app");
    expect(s.replace).not.toHaveBeenCalled();
  });
});

describe("Welcome setup", () => {
  const go = () => userEvent.setup();

  it("walks through currency, income and a first goal, then finishes", async () => {
    const f = use({ "/profile": profile(), "POST /income-sources": { id: "src1" } });
    const user = go();
    renderApp(<WelcomePage />);
    await user.type(await screen.findByLabelText("What should we call you?"), "Taha");
    await user.selectOptions(screen.getByLabelText("Currency"), "USD");
    expect(screen.getByText(/still shown in rupees/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(f.sent("PATCH", "/profile")[0].body).toEqual({ currency: "USD", full_name: "Taha" });

    await user.type(await screen.findByLabelText("Income name"), "Salary");
    await user.type(screen.getByLabelText(/About how much/), "5000");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(f.sent("POST", "/income-sources")[0].body).toEqual({ name: "Salary", kind: "job", expected_monthly: 5000 });

    await user.type(await screen.findByLabelText("Goal"), "Emergency fund");
    await user.type(screen.getByLabelText(/Target amount/), "20000");
    await user.click(screen.getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(s.replace).toHaveBeenCalledWith("/dashboard"));
    expect(f.sent("POST", "/goals")[0].body).toEqual({ target_amount: 20000, target_date: null, new_item: { kind: "savings", name: "Emergency fund" } });
    expect(f.sent("PATCH", "/profile").at(-1)?.body).toEqual({ onboarding_done: true });
  });

  it("checks the income and goal fields", async () => {
    use({ "/profile": profile() });
    const user = go();
    renderApp(<WelcomePage />);
    await user.click(await screen.findByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Give your income a name");
    await user.type(screen.getByLabelText("Income name"), "Pay");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter roughly what you earn");
    await user.click(screen.getByRole("button", { name: "Skip this step" }));
    await user.click(await screen.findByRole("button", { name: "Finish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Name your goal");
    await user.type(screen.getByLabelText("Goal"), "Trip");
    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("how much you want to save");
  });

  it("edits the same income when going back and forward", async () => {
    const f = use({ "/profile": profile(), "POST /income-sources": { id: "src1" } });
    const user = go();
    renderApp(<WelcomePage />);
    await user.click(await screen.findByRole("button", { name: "Next" }));
    await user.type(await screen.findByLabelText("Income name"), "Pay");
    await user.type(screen.getByLabelText(/About how much/), "10");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(f.sent("POST", "/income-sources")).toHaveLength(1);
    expect(f.sent("PATCH", "/income-sources/src1")).toHaveLength(1);
  });

  it("can be skipped at any point", async () => {
    const f = use({ "/profile": profile() });
    const user = go();
    renderApp(<WelcomePage />);
    await user.click(await screen.findByRole("button", { name: "Skip setup for now" }));
    await waitFor(() => expect(s.replace).toHaveBeenCalledWith("/dashboard"));
    expect(f.sent("PATCH", "/profile")[0].body).toEqual({ onboarding_done: true });
  });

  it("shows server errors and stays put", async () => {
    use({ "/profile": profile(), "PATCH /profile": new Error("Server down") });
    const user = go();
    renderApp(<WelcomePage />);
    await user.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Server down");
    expect(screen.getByText("Welcome to CoinLeaf")).toBeInTheDocument();
  });

  it("sends finished accounts to the dashboard", async () => {
    use({ "/profile": profile({ onboarded_at: "2026-01-01T00:00:00Z" }) });
    renderApp(<WelcomePage />);
    await waitFor(() => expect(s.replace).toHaveBeenCalledWith("/dashboard"));
  });
});
