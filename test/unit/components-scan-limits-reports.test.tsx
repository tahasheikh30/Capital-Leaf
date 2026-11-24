import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderApp, uid } from "../utils";

const h = vi.hoisted(() => ({
  impl: (async () => []) as (p: string, o?: unknown) => Promise<unknown>,
  postPhoto: vi.fn(),
  uploadFile: vi.fn(),
  downloadFile: vi.fn(),
  prepare: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api", () => ({
  api: (p: string, o?: unknown) => h.impl(p, o),
  postPhoto: (...a: unknown[]) => h.postPhoto(...a),
  uploadFile: (...a: unknown[]) => h.uploadFile(...a),
  downloadFile: (...a: unknown[]) => h.downloadFile(...a),
  ApiError: class ApiError extends Error {
    constructor(m: string, public status: number) {
      super(m);
    }
  },
  peek: vi.fn(() => undefined),
  setApiSpace: vi.fn(),
  clearApiCache: vi.fn(),
}));
vi.mock("@/lib/image", () => ({ preparePhoto: (...a: unknown[]) => h.prepare(...a) }));
vi.mock("@/lib/useUserId", () => ({ useUserId: () => "u1" }));

import BudgetWatcher from "@/components/BudgetWatcher";
import CategoryLimits from "@/components/CategoryLimits";
import QuickAdd from "@/components/QuickAdd";
import ReceiptScan from "@/components/ReceiptScan";
import NotificationsPage from "@/app/(app)/notifications/page";
import ReportsPage from "@/app/(app)/reports/page";
import { SPENDING_EVENT } from "@/lib/spending";
import { monthKey } from "@/lib/format";

let api: ReturnType<typeof fakeApi>;
const use = (routes: Parameters<typeof fakeApi>[0]) => {
  api = fakeApi(routes);
  h.impl = api.impl as typeof h.impl;
};
beforeEach(() => {
  localStorage.clear();
  h.postPhoto.mockReset();
  h.uploadFile.mockReset();
  h.downloadFile.mockReset();
  h.prepare.mockReset().mockImplementation(async (f: File) => ({ blob: f }));
});

const photo = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], "receipt.jpg", { type: "image/jpeg" });
const SCAN = { amount: 1250.5, date: "2026-11-20", note: "Imtiaz Super Market", category_id: uid(10), category_name: "Food", category_source: "ai" as const };

describe("ReceiptScan", () => {
  it("is not shown when the server has no AI", async () => {
    use({ "/ai/status": { available: false, enabled: false } });
    renderApp(<ReceiptScan onScanned={vi.fn()} onError={vi.fn()} />);
    await waitFor(() => expect(api.calls.some((c) => c.path === "/ai/status")).toBe(true));
    expect(screen.queryByRole("button", { name: /Scan a receipt/ })).toBeNull();
    expect(screen.queryByText(/Turn on AI/)).toBeNull();
  });
  it("points to Settings while AI is off", async () => {
    use({ "/ai/status": { available: true, enabled: false } });
    renderApp(<ReceiptScan onScanned={vi.fn()} onError={vi.fn()} />);
    expect(await screen.findByRole("link", { name: /Turn on AI in Settings/ })).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("button", { name: /Scan a receipt/ })).toBeNull();
  });
  it("sends the shrunk photo and hands back what was read", async () => {
    use({ "/ai/status": { available: true, enabled: true } });
    h.postPhoto.mockResolvedValue(SCAN);
    const onScanned = vi.fn();
    renderApp(<ReceiptScan onScanned={onScanned} onError={vi.fn()} />);
    await screen.findByRole("button", { name: /Scan a receipt/ });
    const file = photo();
    await userEvent.upload(screen.getByLabelText("Receipt photo to read"), file);
    await waitFor(() => expect(onScanned).toHaveBeenCalledWith(SCAN, file));
    expect(h.postPhoto).toHaveBeenCalledWith("/ai/receipt", file);
    expect(screen.getByRole("button", { name: /Scan a receipt/ })).toBeEnabled();
  });
  it("shows a busy label while reading", async () => {
    use({ "/ai/status": { available: true, enabled: true } });
    let done: (v: unknown) => void = () => {};
    h.postPhoto.mockReturnValue(new Promise((r) => (done = r)));
    renderApp(<ReceiptScan onScanned={vi.fn()} onError={vi.fn()} />);
    await screen.findByRole("button", { name: /Scan a receipt/ });
    await userEvent.upload(screen.getByLabelText("Receipt photo to read"), photo());
    expect(await screen.findByRole("button", { name: /Reading your receipt/ })).toBeDisabled();
    await act(async () => done(SCAN));
    expect(await screen.findByRole("button", { name: /Scan a receipt/ })).toBeEnabled();
  });
  it("reports a photo that cannot be used, a server refusal and a missing connection", async () => {
    use({ "/ai/status": { available: true, enabled: true } });
    const onError = vi.fn();
    renderApp(<ReceiptScan onScanned={vi.fn()} onError={onError} />);
    await screen.findByRole("button", { name: /Scan a receipt/ });
    const input = screen.getByLabelText("Receipt photo to read");
    h.prepare.mockResolvedValueOnce({ error: "Choose an image file" });
    await userEvent.upload(input, photo());
    await waitFor(() => expect(onError).toHaveBeenLastCalledWith("Choose an image file"));
    expect(h.postPhoto).not.toHaveBeenCalled();
    h.postPhoto.mockRejectedValueOnce(new Error("We could not read a total on that photo."));
    await userEvent.upload(input, photo());
    await waitFor(() => expect(onError).toHaveBeenLastCalledWith("We could not read a total on that photo."));
    const { ApiError } = await import("@/lib/api");
    h.postPhoto.mockRejectedValueOnce(new ApiError("Cannot reach the server. Please try again.", 0));
    await userEvent.upload(input, photo());
    await waitFor(() => expect(onError).toHaveBeenLastCalledWith(expect.stringMatching(/needs a connection/)));
  });
});

describe("Quick add with a scanned receipt", () => {
  const CATS = [{ id: uid(10), name: "Food", color: "#112233" }, { id: uid(11), name: "Fuel", color: "#445566" }];
  beforeEach(() =>
    use({
      "/ai/status": { available: true, enabled: true },
      "/categories": CATS,
      "/income-sources": [],
      "/assets": [],
      "/transactions": [],
      "POST /transactions": ({ body }: { body: unknown }) => body,
    })
  );
  const open = async () => {
    renderApp(<QuickAdd />);
    await userEvent.click(screen.getByRole("button", { name: "Add a transaction" }));
    await screen.findByRole("button", { name: /Scan a receipt/ });
  };

  it("fills the form, then keeps the photo on the saved expense", async () => {
    h.postPhoto.mockResolvedValue(SCAN);
    await open();
    const file = photo();
    await userEvent.upload(screen.getByLabelText("Receipt photo to read"), file);
    expect(await screen.findByText(/photo will be kept/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("1250.5")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Imtiaz Super Market")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-11-20")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Food" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^(Add|Save)/ }));
    await waitFor(() => expect(api.sent("POST", "/transactions")).toHaveLength(1));
    expect(api.sent("POST", "/transactions")[0].body).toMatchObject({ type: "expense", amount: 1250.5, occurred_on: "2026-11-20", note: "Imtiaz Super Market", category_id: uid(10) });
    const id = (api.sent("POST", "/transactions")[0].body as { id: string }).id;
    await waitFor(() => expect(h.uploadFile).toHaveBeenCalledWith(`/transactions/${id}/receipt`, file));
  });
  it("lets the person drop the photo, and ignores a future date", async () => {
    h.postPhoto.mockResolvedValue({ ...SCAN, date: "2999-01-01", category_id: null });
    await open();
    await userEvent.upload(screen.getByLabelText("Receipt photo to read"), photo());
    await screen.findByText(/photo will be kept/);
    expect(screen.queryByDisplayValue("2999-01-01")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByText(/photo will be kept/)).toBeNull();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^(Add|Save)/ }));
    await waitFor(() => expect(api.sent("POST", "/transactions")).toHaveLength(1));
    expect(h.uploadFile).not.toHaveBeenCalled();
  });
  it("offers the categories kept on this device when there is no connection", async () => {
    use({ "/ai/status": { available: true, enabled: true }, "/categories": new Error("offline"), "/income-sources": new Error("offline"), "/transactions": new Error("offline") });
    localStorage.setItem("coinleaf.lists.u1", JSON.stringify({ categories: CATS, sources: [{ id: uid(50), name: "Salary" }], at: Date.now() }));
    await open();
    expect(await screen.findByRole("button", { name: "Fuel" })).toBeInTheDocument();
    expect(screen.queryByText(/No categories yet/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Earned" }));
    expect(await screen.findByRole("button", { name: "Salary" })).toBeInTheDocument();
  });
  it("remembers the lists it loads for next time", async () => {
    await open();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("coinleaf.lists.u1") ?? "null")?.categories).toHaveLength(2));
  });
  it("is not offered for income", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Earned" }));
    expect(screen.queryByRole("button", { name: /Scan a receipt/ })).toBeNull();
  });
});

const line = (n: number, name: string, limit: number, spent: number) => {
  const pct = Math.round((spent / limit) * 1000) / 10;
  return { id: uid(n), category_id: uid(n + 100), category_name: name, color: "#2f6a4c", limit, spent, remaining: limit - spent, pct, level: pct >= 100 ? "over" : pct >= 80 ? "warn" : "ok" };
};
const CATS2 = [{ id: uid(101), name: "Food", color: "#1" }, { id: uid(102), name: "Transport", color: "#2" }, { id: uid(103), name: "Fun", color: "#3" }];

describe("CategoryLimits", () => {
  it("explains an empty list", async () => {
    use({ "/category-budgets/status": { month: "2026-11", items: [] }, "/categories": CATS2 });
    renderApp(<CategoryLimits />);
    expect(await screen.findByText(/No limits yet/)).toBeInTheDocument();
  });
  it("shows each limit with what is left, nearly there, and over", async () => {
    use({ "/category-budgets/status": { month: "2026-11", items: [line(1, "Food", 1000, 1300), line(2, "Transport", 1000, 850), line(3, "Fun", 1000, 100), line(4, "Rent", 1000, 1000)] }, "/categories": CATS2 });
    renderApp(<CategoryLimits />);
    expect(await screen.findByText(/300.* over/)).toBeInTheDocument();
    expect(screen.getByText(/Nearly there/)).toHaveTextContent(/150.* left/);
    expect(screen.getByText(/900.* left/)).toBeInTheDocument();
    expect(screen.getByText("Limit reached")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Food limit used: 100 percent" })).toBeInTheDocument();
    expect(screen.getByText(/1,300.* of .*1,000/)).toBeInTheDocument();
  });
  it("adds a limit for a category that has none, then checks again", async () => {
    use({ "/category-budgets/status": { month: "2026-11", items: [line(1, "Food", 1000, 0)] }, "/categories": CATS2 });
    const seen = vi.fn();
    window.addEventListener(SPENDING_EVENT, seen);
    renderApp(<CategoryLimits />);
    await screen.findByText("Food");
    await userEvent.click(screen.getByRole("button", { name: /Add a limit/ }));
    const dialog = await screen.findByRole("dialog");
    const select = within(dialog).getByLabelText("Category") as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toEqual(["Transport", "Fun"]);
    await userEvent.selectOptions(select, uid(103));
    await userEvent.type(within(dialog).getByLabelText("Monthly limit"), "4500");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add limit" }));
    await waitFor(() => expect(api.sent("POST", "/category-budgets")).toHaveLength(1));
    expect(api.sent("POST", "/category-budgets")[0].body).toEqual({ category_id: uid(103), monthly_limit: 4500 });
    await waitFor(() => expect(seen).toHaveBeenCalled());
    window.removeEventListener(SPENDING_EVENT, seen);
  });
  it("changes only the amount of an existing limit", async () => {
    use({ "/category-budgets/status": { month: "2026-11", items: [line(1, "Food", 1000, 0)] }, "/categories": CATS2 });
    renderApp(<CategoryLimits />);
    await userEvent.click(await screen.findByRole("button", { name: "Edit the Food limit" }));
    const dialog = await screen.findByRole("dialog", { name: "Food limit" });
    expect(within(dialog).queryByLabelText("Category")).toBeNull();
    const amount = within(dialog).getByLabelText("Monthly limit");
    expect(amount).toHaveValue(1000);
    await userEvent.clear(amount);
    await userEvent.type(amount, "2000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.sent("PATCH", `/category-budgets/${uid(1)}`)).toHaveLength(1));
    expect(api.sent("PATCH", `/category-budgets/${uid(1)}`)[0].body).toEqual({ monthly_limit: 2000 });
  });
  it("removes a limit", async () => {
    use({ "/category-budgets/status": { month: "2026-11", items: [line(1, "Food", 1000, 0)] }, "/categories": CATS2 });
    renderApp(<CategoryLimits />);
    await userEvent.click(await screen.findByRole("button", { name: "Remove the Food limit" }));
    await waitFor(() => expect(api.sent("DELETE", `/category-budgets/${uid(1)}`)).toHaveLength(1));
  });
  it("cannot add more when every category has one", async () => {
    use({ "/category-budgets/status": { month: "2026-11", items: [line(1, "Food", 1, 0), line(2, "Transport", 1, 0), line(3, "Fun", 1, 0)] }, "/categories": CATS2 });
    renderApp(<CategoryLimits />);
    await screen.findByText("Fun");
    expect(screen.getByRole("button", { name: /Add a limit/ })).toBeDisabled();
  });
  it("shows the server's message when the list will not load, and when saving fails", async () => {
    use({ "/category-budgets/status": new Error("Server is asleep"), "/categories": CATS2 });
    renderApp(<CategoryLimits />);
    expect(await screen.findByText("Server is asleep", { selector: ".toast-text" })).toBeInTheDocument();
    expect(await screen.findByText(/No limits yet/)).toBeInTheDocument();
  });
  it("shows the server's message when a limit cannot be added", async () => {
    use({ "/category-budgets/status": { month: "2026-11", items: [] }, "/categories": CATS2, "POST /category-budgets": new Error("That already exists") });
    renderApp(<CategoryLimits />);
    await screen.findByText(/No limits yet/);
    await userEvent.click(screen.getByRole("button", { name: /Add a limit/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Monthly limit"), "10");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add limit" }));
    expect(await screen.findByText("That already exists", { selector: ".toast-text" })).toBeInTheDocument();
  });
});

describe("BudgetWatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
  afterEach(() => vi.useRealTimers());

  const fresh = (level: 80 | 100) => ({ fresh: [{ budget_id: uid(1), category_name: "Food", level, spent: level === 80 ? 800 : 1000, limit: 1000 }] });

  it("announces a limit at 80 percent and at 100 percent", async () => {
    let n = 0;
    use({ "POST /category-budgets/check": () => (n++ === 0 ? fresh(80) : fresh(100)) });
    renderApp(<BudgetWatcher />);
    await act(async () => void vi.advanceTimersByTime(5100));
    expect(await screen.findByText(/Food is at 80 percent of its limit/)).toBeInTheDocument();
    await act(async () => window.dispatchEvent(new Event(SPENDING_EVENT)));
    await act(async () => void vi.advanceTimersByTime(900));
    expect(await screen.findByText(/Food has reached its limit/)).toBeInTheDocument();
  });
  it("combines a burst of changes into one check", async () => {
    use({ "POST /category-budgets/check": { fresh: [] } });
    renderApp(<BudgetWatcher />);
    await act(async () => void vi.advanceTimersByTime(5100));
    const before = api.sent("POST", "/category-budgets/check").length;
    await act(async () => {
      for (let i = 0; i < 5; i++) window.dispatchEvent(new Event(SPENDING_EVENT));
    });
    await act(async () => void vi.advanceTimersByTime(900));
    expect(api.sent("POST", "/category-budgets/check").length).toBe(before + 1);
  });
  it("checks every few minutes and when the app comes back to the front", async () => {
    use({ "POST /category-budgets/check": { fresh: [] } });
    renderApp(<BudgetWatcher />);
    await act(async () => void vi.advanceTimersByTime(5100));
    const a = api.sent("POST", "/category-budgets/check").length;
    await act(async () => void vi.advanceTimersByTime(5 * 60_000));
    const b = api.sent("POST", "/category-budgets/check").length;
    expect(b).toBeGreaterThan(a);
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
    expect(api.sent("POST", "/category-budgets/check").length).toBeGreaterThan(b);
  });
  it("does nothing while the app is hidden, and stays quiet when the check fails", async () => {
    use({ "POST /category-budgets/check": new Error("down") });
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    renderApp(<BudgetWatcher />);
    await act(async () => void vi.advanceTimersByTime(6000));
    expect(api.sent("POST", "/category-budgets/check")).toHaveLength(0);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => void vi.advanceTimersByTime(5 * 60_000));
    expect(api.sent("POST", "/category-budgets/check").length).toBeGreaterThan(0);
    expect(screen.queryByText("down")).toBeNull();
  });
  it("stops when it is removed", async () => {
    use({ "POST /category-budgets/check": { fresh: [] } });
    const view = renderApp(<BudgetWatcher />);
    view.unmount();
    await act(async () => void vi.advanceTimersByTime(10 * 60_000));
    expect(api.sent("POST", "/category-budgets/check")).toHaveLength(0);
  });
});

describe("Notifications page, category limits", () => {
  it("lists the warnings that were given", async () => {
    use({
      "/alerts": [],
      "/category-budgets/notices": [
        { budget_id: uid(1), month: "2026-11", level: 100, spent: 1000, limit: 1000, category_name: "Food", created_at: "2026-11-20T10:00:00Z" },
        { budget_id: uid(1), month: "2026-11", level: 80, spent: 800, limit: 1000, category_name: "Food", created_at: "2026-11-18T10:00:00Z" },
      ],
    });
    renderApp(<NotificationsPage />);
    expect(await screen.findByText("Food reached its limit")).toBeInTheDocument();
    expect(screen.getByText("Food passed 80 percent of its limit")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage limits" })).toHaveAttribute("href", "/budget");
  });
  it("copes with the list failing to load", async () => {
    use({ "/alerts": [], "/category-budgets/notices": new Error("x") });
    renderApp(<NotificationsPage />);
    expect(await screen.findByText(/No warnings yet/)).toBeInTheDocument();
  });
});

describe("Reports page", () => {
  const month = monthKey(new Date());
  const prev = (() => {
    const d = new Date();
    return monthKey(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  })();
  const report = (over: Record<string, unknown> = {}) => ({
    month,
    previous: prev,
    currency: "PKR",
    partial: true,
    totals: { income: 120000, spent: 32500, net: 87500, savingsRate: 72.9, previousIncome: 100000, previousSpent: 25000, previousNet: 75000, spentChange: 7500, spentChangePct: 30 },
    categories: [
      { name: "Food", current: 30000, previous: 20000, change: 10000, changePct: 50 },
      { name: "Uncategorized", current: 2500, previous: 0, change: 2500, changePct: null },
      { name: "Fuel", current: 0, previous: 5000, change: -5000, changePct: -100 },
    ],
    biggest: [{ date: `${month}-01`, note: "Rent-ish", category: "Food", amount: 30000 }],
    ...over,
  });

  it("compares this month with last month", async () => {
    use({ [`/reports/monthly?month=${month}`]: report(), "/features": { email: false, ai: false }, "/profile": { monthly_report_email: false } });
    renderApp(<ReportsPage />);
    expect(await screen.findByText("Spending by category")).toBeInTheDocument();
    expect(screen.getByText("Earned").nextSibling).toHaveTextContent(/120,000/);
    expect(screen.getByText("Spent").nextSibling).toHaveTextContent(/32,500/);
    expect(screen.getByText("Left over").nextSibling).toHaveTextContent(/87,500/);
    expect(screen.getByText(/72.9% of what you earned/)).toBeInTheDocument();
    expect(screen.getByText(/not over yet/)).toBeInTheDocument();
    const food = screen.getByText("Food", { selector: ".report-cat" }).closest("tr")!;
    expect(within(food).getByText("+50%")).toHaveClass("neg");
    const fuel = screen.getByText("Fuel", { selector: ".report-cat" }).closest("tr")!;
    expect(within(fuel).getByText("-100%")).toHaveClass("pos");
    expect(within(screen.getByText("Uncategorized", { selector: ".report-cat" }).closest("tr")!).getByText("new")).toBeInTheDocument();
    expect(screen.getByText("Rent-ish")).toBeInTheDocument();
    expect(screen.queryByText("Email")).toBeNull();
  });
  it("steps back a month, and cannot go past this one", async () => {
    use({ [`/reports/monthly?month=${month}`]: report(), [`/reports/monthly?month=${prev}`]: report({ month: prev, partial: false }), "/features": { email: false, ai: false }, "/profile": {} });
    renderApp(<ReportsPage />);
    await screen.findByText("Spending by category");
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
    await waitFor(() => expect(api.calls.some((c) => c.path === `/reports/monthly?month=${prev}`)).toBe(true));
    await waitFor(() => expect(screen.queryByText(/not over yet/)).toBeNull());
    expect(screen.getByRole("button", { name: "Next month" })).toBeEnabled();
  });
  it("downloads the PDF for the month on screen", async () => {
    use({ [`/reports/monthly?month=${month}`]: report(), "/features": { email: false, ai: false }, "/profile": {} });
    renderApp(<ReportsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Download PDF/ }));
    await waitFor(() => expect(h.downloadFile).toHaveBeenCalledWith(`/reports/monthly.pdf?month=${month}`, `coinleaf-report-${month}.pdf`));
  });
  it("tells the person when the PDF fails", async () => {
    h.downloadFile.mockRejectedValue(new Error("Too many exports"));
    use({ [`/reports/monthly?month=${month}`]: report(), "/features": { email: false, ai: false }, "/profile": {} });
    renderApp(<ReportsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Download PDF/ }));
    expect(await screen.findByText("Too many exports", { selector: ".toast-text" })).toBeInTheDocument();
  });
  it("turns the monthly email on and off when the server can send email", async () => {
    let on = false;
    use({
      [`/reports/monthly?month=${month}`]: report(),
      "/features": { email: true, ai: false },
      "/profile": () => ({ monthly_report_email: on }),
      "PATCH /profile": ({ body }: { body: { monthly_report_email: boolean } }) => ({ monthly_report_email: (on = body.monthly_report_email) }),
    });
    renderApp(<ReportsPage />);
    const sw = await screen.findByRole("switch", { name: "Email me the monthly report" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.click(sw);
    await waitFor(() => expect(api.sent("PATCH", "/profile")[0].body).toEqual({ monthly_report_email: true }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Email me the monthly report" })).toHaveAttribute("aria-checked", "true"));
    await userEvent.click(screen.getByRole("switch", { name: "Email me the monthly report" }));
    await waitFor(() => expect(api.sent("PATCH", "/profile")[1].body).toEqual({ monthly_report_email: false }));
  });
  it("shows an empty month and a load error", async () => {
    use({ [`/reports/monthly?month=${month}`]: report({ categories: [], biggest: [], partial: false }), "/features": { email: false, ai: false }, "/profile": {} });
    const view = renderApp(<ReportsPage />);
    expect(await screen.findByText(/No spending in/)).toBeInTheDocument();
    expect(screen.queryByText("Biggest expenses")).toBeNull();
    view.unmount();
    use({ [`/reports/monthly?month=${month}`]: new Error("Could not build the report"), "/features": { email: false, ai: false }, "/profile": {} });
    renderApp(<ReportsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not build the report");
    expect(screen.getByRole("button", { name: /Download PDF/ })).toBeDisabled();
  });
});

void fireEvent;
void render;
