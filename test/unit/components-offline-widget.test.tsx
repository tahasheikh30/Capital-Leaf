import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/Toast";

const s = vi.hoisted(() => ({ impl: vi.fn(), refresh: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: (...a: unknown[]) => s.impl(...a), API_URL: "http://api.test" }));
vi.mock("@/lib/space", () => ({ useSpace: () => ({ refresh: s.refresh, isHousehold: false, household: null }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { getSession: s.session } }) }));

import SyncBanner from "@/components/SyncBanner";
import WidgetSettings from "@/components/settings/WidgetSettings";
import GlancePage from "@/app/glance/page";
import { enqueue, readQueue } from "@/lib/offlineQueue";
import { TOKEN_KEY, disableWidget, enableWidget, fetchGlance, widgetLink } from "@/lib/widget";

const U = "user-1";
const body = { type: "expense", amount: 50, occurred_on: "2026-11-20", note: "tea", category_id: null, income_source_id: null };
const setOnline = (v: boolean) => Object.defineProperty(navigator, "onLine", { value: v, configurable: true });
const withToasts = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const err = (status: number, message = "x") => Object.assign(new Error(message), { status });

beforeEach(() => {
  localStorage.clear();
  s.impl.mockReset();
  s.refresh.mockReset();
  s.session.mockReset();
  s.session.mockResolvedValue({ data: { session: { user: { id: U } } } });
  setOnline(true);
  window.location.hash = "";
  vi.unstubAllGlobals();
});

describe("sync banner", () => {
  it("shows nothing when online with nothing waiting", async () => {
    withToasts(<SyncBanner />);
    await waitFor(() => expect(s.session).toHaveBeenCalled());
    expect(document.querySelector(".sync-banner")).toBeNull();
  });
  it("shows the offline state and what is waiting", async () => {
    setOnline(false);
    enqueue(U, body, "personal", "a");
    withToasts(<SyncBanner />);
    expect(await screen.findByText(/You are offline\. 1 entry waiting to sync/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText(/Expense.*50.*2026-11-20, tea/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(readQueue(U)).toEqual([]));
  });
  it("sends what is waiting when it starts online and refreshes the page data", async () => {
    enqueue(U, body, "personal", "a");
    enqueue(U, body, "personal", "b");
    s.impl.mockResolvedValue({});
    withToasts(<SyncBanner />);
    expect(await screen.findByText("2 offline entries synced")).toBeInTheDocument();
    expect(s.impl.mock.calls.filter(([p]) => p === "/transactions")).toHaveLength(2);
    expect(s.refresh).toHaveBeenCalled();
    expect(readQueue(U)).toEqual([]);
  });
  it("keeps the category list on this device for later, when online", async () => {
    s.impl.mockResolvedValue([{ id: "c1", name: "Food" }]);
    withToasts(<SyncBanner />);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(`coinleaf.lists.${U}`) ?? "null")?.categories[0].name).toBe("Food"));
  });
  it("does not ask for the lists while offline", async () => {
    setOnline(false);
    withToasts(<SyncBanner />);
    await screen.findByText(/You are offline/);
    expect(s.impl).not.toHaveBeenCalled();
  });
  it("syncs when the connection comes back", async () => {
    setOnline(false);
    enqueue(U, body, "personal", "a");
    s.impl.mockResolvedValue({});
    withToasts(<SyncBanner />);
    await screen.findByText(/You are offline/);
    expect(s.impl).not.toHaveBeenCalled();
    setOnline(true);
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(await screen.findByText("1 offline entry synced")).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector(".sync-banner")).toBeNull());
  });
  it("tells the person about entries the server refused, and lets them discard them", async () => {
    enqueue(U, body, "personal", "a");
    s.impl.mockRejectedValue(err(400, "That category no longer exists"));
    withToasts(<SyncBanner />);
    expect(await screen.findByText("Some entries could not be saved.")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Show" }));
    expect(screen.getByText(/Not saved: That category no longer exists/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync now" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(document.querySelector(".sync-banner")).toBeNull());
  });
  it("can be synced by hand", async () => {
    enqueue(U, body, "personal", "a");
    s.impl.mockRejectedValueOnce(err(503)).mockResolvedValue({});
    withToasts(<SyncBanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Sync now" }));
    expect(await screen.findByText("1 offline entry synced")).toBeInTheDocument();
  });
});

describe("widget library", () => {
  it("turns on: makes the token, keeps it for the widget and the link", async () => {
    s.impl.mockResolvedValue({ token: "clw_abc" });
    const put = vi.fn();
    vi.stubGlobal("caches", { open: async () => ({ put }), delete: vi.fn() });
    expect(await enableWidget()).toBe("clw_abc");
    expect(s.impl).toHaveBeenCalledWith("/widget/token", { method: "POST" });
    expect(localStorage.getItem(TOKEN_KEY)).toBe("clw_abc");
    expect(put.mock.calls[0][0]).toBe("/__widget-config");
    expect(await (put.mock.calls[0][1] as Response).json()).toEqual({ token: "clw_abc", api: "http://api.test" });
  });
  it("still works without cache storage", async () => {
    s.impl.mockResolvedValue({ token: "clw_abc" });
    vi.stubGlobal("caches", undefined);
    expect(await enableWidget()).toBe("clw_abc");
  });
  it("turns off and forgets the token", async () => {
    localStorage.setItem(TOKEN_KEY, "clw_abc");
    s.impl.mockResolvedValue({ ok: true });
    const del = vi.fn();
    vi.stubGlobal("caches", { delete: del });
    await disableWidget();
    expect(s.impl).toHaveBeenCalledWith("/widget/token", { method: "DELETE" });
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(del).toHaveBeenCalledWith("coinleaf-widget");
  });
  it("builds the link with the token after the # so it is never sent to a server", () => {
    expect(widgetLink("https://app.test", "clw_abc")).toBe("https://app.test/glance#t=clw_abc");
  });
  it("reads the summary and explains failures", async () => {
    const ok = { month: "2026-11", currency: "PKR", leftToSpend: 5, spent: 1, income: 6, updated_at: "x" };
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ok });
    vi.stubGlobal("fetch", f);
    expect(await fetchGlance("clw_abc")).toEqual(ok);
    expect(f).toHaveBeenCalledWith("http://api.test/widget/summary", { headers: { Authorization: "Bearer clw_abc" }, cache: "no-store" });
    f.mockResolvedValue({ ok: false, status: 401 });
    await expect(fetchGlance("x")).rejects.toThrow("turned off");
    f.mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchGlance("x")).rejects.toThrow("Could not load");
    f.mockRejectedValue(new Error("net"));
    await expect(fetchGlance("x")).rejects.toThrow("Cannot reach");
  });
});

describe("widget settings", () => {
  it("turns on, shows the private link, and turns off after confirming", async () => {
    s.impl.mockImplementation(async (path: string, o?: { method?: string }) => {
      if (path === "/widget") return { enabled: false };
      if (path === "/widget/token" && o?.method === "POST") return { token: "clw_abc" };
      return { ok: true };
    });
    vi.stubGlobal("caches", { open: async () => ({ put: vi.fn() }), delete: vi.fn() });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    withToasts(<WidgetSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "Turn on the widget" }));
    expect(await screen.findByLabelText("Your widget link")).toHaveValue(`${window.location.origin}/glance#t=clw_abc`);
    expect(screen.getByText(/Anyone with this link/)).toBeInTheDocument();
    const off = screen.getByRole("button", { name: "Turn off" });
    await userEvent.click(off);
    expect(s.impl).not.toHaveBeenCalledWith("/widget/token", { method: "DELETE" });
    await userEvent.click(off);
    expect(await screen.findByRole("button", { name: "Turn on the widget" })).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    confirm.mockRestore();
  });
  it("copies the link", async () => {
    localStorage.setItem(TOKEN_KEY, "clw_abc");
    s.impl.mockResolvedValue({ enabled: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    withToasts(<WidgetSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/glance#t=clw_abc`);
  });
  it("explains when the link only lives on another device", async () => {
    s.impl.mockResolvedValue({ enabled: true });
    withToasts(<WidgetSettings />);
    expect(await screen.findByText(/only kept on the device that made it/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make a new link" })).toBeInTheDocument();
  });
  it("shows load and setup errors", async () => {
    s.impl.mockRejectedValue(new Error("down"));
    withToasts(<WidgetSettings />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load");
  });
});

describe("glance page", () => {
  const data = { month: "2026-11", currency: "PKR", leftToSpend: 70000, spent: 30000, income: 100000, updated_at: "x" };
  it("shows the number for the token in the link and remembers it", async () => {
    window.location.hash = "#t=clw_abc";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => data }));
    render(<GlancePage />);
    expect(await screen.findByText(/70,000/)).toBeInTheDocument();
    expect(screen.getByText(/Left to spend, 2026-11/)).toBeInTheDocument();
    expect(screen.getByText(/Spent.*30,000.*100,000/)).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_KEY)).toBe("clw_abc");
  });
  it("uses the remembered token when opened from the home screen icon", async () => {
    localStorage.setItem(TOKEN_KEY, "clw_saved");
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => data });
    vi.stubGlobal("fetch", f);
    render(<GlancePage />);
    await screen.findByText(/70,000/);
    expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer clw_saved");
  });
  it("asks for the link when there is no token", async () => {
    render(<GlancePage />);
    expect(await screen.findByText(/Open the widget link/)).toBeInTheDocument();
  });
  it("shows a turned-off link and an overspent month, and can refresh", async () => {
    window.location.hash = "#t=clw_abc";
    const f = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal("fetch", f);
    render(<GlancePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("turned off");
    f.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...data, leftToSpend: -200 }) });
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(document.querySelector(".glance-amount.neg")).not.toBeNull());
  });
});
