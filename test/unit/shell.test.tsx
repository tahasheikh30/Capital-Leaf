import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderApp, uid } from "../utils";

const nav = vi.hoisted(() => ({ path: "/dashboard", push: vi.fn(), refresh: vi.fn(), waiting: 0, signOut: vi.fn(async () => ({})), clear: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useRouter: () => ({ push: nav.push, refresh: nav.refresh }), useSearchParams: () => new URLSearchParams() }));
const h = vi.hoisted(() => ({ impl: (async () => ({})) as (p: string, o?: unknown) => Promise<unknown> }));
vi.mock("@/lib/api", () => ({ api: (p: string, o?: unknown) => h.impl(p, o), peek: () => undefined, setApiSpace: vi.fn(), clearApiCache: nav.clear, requestsWaiting: () => nav.waiting, API_URL: "http://api.test" }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut: nav.signOut } }) }));

import AlertsWatcher from "@/components/AlertsWatcher";
import AppFooter, { AppFooterWhenReady } from "@/components/AppFooter";
import AppNavbar from "@/components/AppNavbar";
import LandingHeader from "@/components/LandingHeader";
import LegalPage from "@/components/LegalPage";
import RegisterSW from "@/components/RegisterSW";
import ResourcesMenu from "@/components/ResourcesMenu";
import ScrollReveal from "@/components/ScrollReveal";
import ServerGate from "@/components/ServerGate";
import Sidebar from "@/components/Sidebar";
import WarmUp from "@/components/WarmUp";
import { EXTERNAL_LINKS } from "@/lib/nav";

let api: ReturnType<typeof fakeApi>;
const use = (routes: Parameters<typeof fakeApi>[0]) => { api = fakeApi(routes); h.impl = api.impl as typeof h.impl; };
beforeEach(() => { nav.path = "/dashboard"; nav.waiting = 0; nav.push.mockClear(); nav.refresh.mockClear(); nav.signOut.mockClear(); nav.clear.mockClear(); use({ "/households/me": { household: null } }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("ServerGate", () => {
  const ok = { ok: true, status: 200 };
  it("opens straight away when the server answered recently", () => {
    sessionStorage.setItem("cl-server-awake", String(Date.now()));
    vi.stubGlobal("fetch", vi.fn());
    render(<ServerGate><p>app</p></ServerGate>);
    expect(screen.getByText("app")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("checks the server, then shows the app and remembers it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok));
    render(<ServerGate><p>app</p></ServerGate>);
    expect(await screen.findByText("app")).toBeInTheDocument();
    expect((fetch as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]).toBe("http://api.test/health");
    expect(Number(sessionStorage.getItem("cl-server-awake"))).toBeGreaterThan(0);
  });
  it("ignores an old record", async () => {
    sessionStorage.setItem("cl-server-awake", String(Date.now() - 11 * 60_000));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok));
    render(<ServerGate><p>app</p></ServerGate>);
    await screen.findByText("app");
    expect(fetch).toHaveBeenCalled();
  });
  it("shows nothing at first, then a friendly loader, while the server wakes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("asleep")));
    render(<ServerGate><p>app</p></ServerGate>);
    expect(screen.queryByText(/Connecting to server/)).toBeNull();
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(screen.getByText(/Connecting to server, please be patient/)).toBeInTheDocument();
    expect(screen.getByText("Getting everything ready for you.")).toBeInTheDocument();
    expect(screen.queryByText("app")).toBeNull();
  });
  it("explains a long wait and counts the seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("asleep")));
    render(<ServerGate><p>app</p></ServerGate>);
    await act(async () => { vi.advanceTimersByTime(9500); });
    expect(screen.getByText(/starting up/)).toBeInTheDocument();
    expect(screen.getByText(/Waiting \d+s/)).toBeInTheDocument();
  });
  it("keeps trying and gets in when the server wakes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const f = vi.fn().mockRejectedValueOnce(new Error("x")).mockRejectedValueOnce(new Error("x")).mockResolvedValue(ok);
    vi.stubGlobal("fetch", f);
    render(<ServerGate><p>app</p></ServerGate>);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(await screen.findByText("app")).toBeInTheDocument();
    expect(f.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
  it("treats a bad status as not ready yet", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    render(<ServerGate><p>app</p></ServerGate>);
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByText("app")).toBeNull();
  });
  it("gives up after two minutes and offers to try again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const f = vi.fn().mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", f);
    render(<ServerGate><p>app</p></ServerGate>);
    await act(async () => { await vi.advanceTimersByTimeAsync(125_000); });
    expect(await screen.findByText("We could not reach the server")).toBeInTheDocument();
    f.mockResolvedValue(ok);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("app")).toBeInTheDocument();
  });
  it("copes with blocked storage", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok));
    render(<ServerGate><p>app</p></ServerGate>);
    expect(await screen.findByText("app")).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

describe("WarmUp and RegisterSW", () => {
  it("quietly pings the server", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({}));
    const { container } = render(<WarmUp />);
    expect(container).toBeEmptyDOMElement();
    expect(fetch).toHaveBeenCalledWith("http://api.test/health", expect.objectContaining({ mode: "no-cors" }));
  });
  it("does not mind the ping failing", () => { vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("x"))); expect(() => render(<WarmUp />)).not.toThrow(); });
  it("does not register a service worker outside production", () => {
    const register = vi.fn().mockResolvedValue({});
    Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
    render(<RegisterSW />);
    expect(register).not.toHaveBeenCalled();
  });
  it("registers the service worker in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const register = vi.fn().mockResolvedValue({});
    Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
    render(<RegisterSW />);
    expect(register).toHaveBeenCalledWith("/sw.js");
    vi.unstubAllEnvs();
  });
  it("survives a failed registration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    Object.defineProperty(navigator, "serviceWorker", { value: { register: vi.fn().mockRejectedValue(new Error("x")) }, configurable: true });
    expect(() => render(<RegisterSW />)).not.toThrow();
    vi.unstubAllEnvs();
  });
});

describe("ResourcesMenu", () => {
  it("lists the outside links when opened", async () => {
    render(<ResourcesMenu />);
    const button = screen.getByRole("button", { name: /Resources/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    for (const l of EXTERNAL_LINKS) expect(screen.getByRole("link", { name: new RegExp(l.label) })).toHaveAttribute("href", l.href);
  });
  it("closes on Escape, on an outside click and when the page changes", async () => {
    const { rerender } = render(<ResourcesMenu />);
    const open = async () => userEvent.click(screen.getByRole("button", { name: /Resources/ }));
    await open(); fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("list")).toBeNull();
    await open(); fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("list")).toBeNull();
    await open(); nav.path = "/budget"; rerender(<ResourcesMenu />);
    expect(screen.queryByRole("list")).toBeNull();
  });
  it("stays open for a click inside it", async () => {
    render(<ResourcesMenu />);
    await userEvent.click(screen.getByRole("button", { name: /Resources/ }));
    fireEvent.pointerDown(screen.getByRole("list"));
    expect(screen.getByRole("list")).toBeInTheDocument();
  });
});

describe("AppFooter", () => {
  it("has the four columns, legal links and the year", () => {
    render(<AppFooter />);
    for (const name of ["Day to day", "Wealth", "Resources", "Legal and data"]) expect(screen.getByRole("navigation", { name })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms of use" })).toHaveAttribute("href", "/terms");
    expect(screen.getByText(new RegExp(`${new Date().getFullYear()} CoinLeaf`))).toBeInTheDocument();
    expect(screen.getByText(/Nothing here is financial advice/)).toBeInTheDocument();
  });
  it("links to the project on GitHub safely", () => {
    render(<AppFooter />);
    const a = screen.getByRole("link", { name: /CoinLeaf on GitHub/ });
    expect(a).toHaveAttribute("rel", "noopener noreferrer");
    expect(a).toHaveAttribute("target", "_blank");
  });
  it("scrolls to the top, smoothly unless motion is reduced", async () => {
    render(<AppFooter />);
    await userEvent.click(screen.getByRole("button", { name: /Back to top/ }));
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });
    window.matchMedia = ((q: string) => ({ matches: q.includes("reduced-motion"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    await userEvent.click(screen.getByRole("button", { name: /Back to top/ }));
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "auto" });
  });
});

describe("AppFooterWhenReady", () => {
  it("waits for the page to settle before showing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    nav.waiting = 1;
    renderApp(<AppFooterWhenReady />);
    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(screen.queryByRole("contentinfo")).toBeNull();
    nav.waiting = 0;
    await act(async () => { vi.advanceTimersByTime(600); });
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
  it("waits while a placeholder is on screen", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const main = document.createElement("div"); main.className = "main"; main.innerHTML = '<div aria-busy="true"></div>'; document.body.appendChild(main);
    renderApp(<AppFooterWhenReady />);
    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(screen.queryByRole("contentinfo")).toBeNull();
    main.remove();
    await act(async () => { vi.advanceTimersByTime(600); });
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
  it("still shows after six seconds if the page never settles", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    nav.waiting = 5;
    renderApp(<AppFooterWhenReady />);
    await act(async () => { vi.advanceTimersByTime(6500); });
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});

describe("AppNavbar", () => {
  it("shows where you are", () => {
    nav.path = "/budget";
    renderApp(<AppNavbar />);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("CoinLeaf/Budget");
    expect(screen.getByText("Budget")).toHaveAttribute("aria-current", "page");
  });
  it("falls back to the app name on an unknown page", () => {
    nav.path = "/mystery";
    renderApp(<AppNavbar />);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("CoinLeaf/CoinLeaf");
  });
  it("has the notification bell and no Resources menu", () => {
    renderApp(<AppNavbar />);
    expect(screen.getByRole("link", { name: /Notifications/ })).toBeInTheDocument();
    expect(screen.queryByText("Resources")).toBeNull();
  });
});

describe("Sidebar", () => {
  const HOUSE = { id: uid(5), name: "Family", role: "owner", members: [], invites: [], limits: { members: 6 } };
  it("groups every page and marks the current one", () => {
    nav.path = "/net-worth";
    renderApp(<Sidebar email="me@example.com" />);
    const side = screen.getByRole("complementary");
    for (const g of ["Day to day", "Wealth", "Set up"]) expect(within(side).getByText(g)).toBeInTheDocument();
    for (const l of ["Dashboard", "Transactions", "Recurring", "Budget", "Net worth", "Goals", "Stocks", "Tax and income", "Income sources", "Categories", "Household", "Ask your money", "Notifications", "Settings"]) expect(within(side).getByRole("link", { name: l })).toBeInTheDocument();
    expect(within(side).getByRole("link", { name: "Net worth" })).toHaveAttribute("aria-current", "page");
    expect(within(side).getByRole("link", { name: "Budget" })).not.toHaveAttribute("aria-current");
  });
  it("shows the email", () => { renderApp(<Sidebar email="me@example.com" />); expect(screen.getByText("me@example.com")).toBeInTheDocument(); });
  it("has the phone tab bar with a More tab covering the other pages", () => {
    nav.path = "/goals";
    renderApp(<Sidebar email="x" />);
    const tabs = screen.getAllByRole("navigation", { name: "Main" }).find((n) => n.classList.contains("tabbar"))!;
    expect(within(tabs).getAllByRole("link").map((a) => a.textContent)).toEqual(["Home", "Activity", "Budget", "Wealth", "More"]);
    expect(within(tabs).getByRole("link", { name: "More" })).toHaveClass("active");
    expect(within(tabs).getByRole("link", { name: "Home" })).not.toHaveClass("active");
  });
  it.each(["/more", "/settings", "/stocks", "/freelancer", "/household", "/ask", "/notifications", "/income", "/categories", "/recurring"])("%s counts as More on the tab bar", (path) => {
    nav.path = path;
    renderApp(<Sidebar email="x" />);
    expect(screen.getByRole("link", { name: "More" })).toHaveClass("active");
  });
  it("has no Resources menu (they live in the footer)", () => { renderApp(<Sidebar email="x" />); expect(screen.queryByText("Resources")).toBeNull(); });
  it("signs out, clears cached data and goes to login", async () => {
    renderApp(<Sidebar email="x" />);
    await userEvent.click(screen.getByRole("button", { name: /Log out/ }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/login"));
    expect(nav.signOut).toHaveBeenCalled();
    expect(nav.clear).toHaveBeenCalled();
    expect(nav.refresh).toHaveBeenCalled();
  });
  it("offers the household switch only to household members", async () => {
    use({ "/households/me": { household: HOUSE } });
    renderApp(<Sidebar email="x" />);
    expect((await screen.findAllByRole("button", { name: "Family" })).length).toBeGreaterThan(0);
  });
});

describe("LandingHeader", () => {
  it("has the section links, log in and sign up", () => {
    render(<LandingHeader />);
    for (const t of ["Features", "Plan ahead", "Your data"]) expect(screen.getAllByRole("link", { name: t })[0]).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Sign up free" })).toHaveAttribute("href", "/signup");
  });
  it("opens and closes the phone menu", async () => {
    render(<LandingHeader />);
    const burger = screen.getByRole("button", { name: "Open menu" });
    expect(burger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(burger);
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Create your free account" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("link", { name: "Create your free account" })).toBeNull();
  });
  it("closes the menu after choosing a link, on Escape and on an outside tap", async () => {
    render(<LandingHeader />);
    const open = () => userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await open(); await userEvent.click(within(document.getElementById("lp-sheet")!).getByRole("link", { name: "Features" }));
    expect(document.getElementById("lp-sheet")).toBeNull();
    await open(); fireEvent.keyDown(document, { key: "Escape" });
    expect(document.getElementById("lp-sheet")).toBeNull();
    await open(); fireEvent.pointerDown(document.body);
    expect(document.getElementById("lp-sheet")).toBeNull();
  });
  it("lifts once the page scrolls", () => {
    const { container } = render(<LandingHeader />);
    expect(container.querySelector("header")).not.toHaveClass("lifted");
    Object.defineProperty(window, "scrollY", { value: 50, configurable: true });
    fireEvent.scroll(window);
    expect(container.querySelector("header")).toHaveClass("lifted");
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });
});

describe("LegalPage", () => {
  it("shows the title, date and content with a way back and in", () => {
    renderApp(<LegalPage title="Privacy" updated="1 Jan 2026"><p>Body text</p></LegalPage>);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy" })).toBeInTheDocument();
    expect(screen.getByText("Last updated 1 Jan 2026")).toBeInTheDocument();
    expect(screen.getByText("Body text")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CoinLeaf, home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});

describe("AlertsWatcher", () => {
  const alert = (n: number, symbol: string, direction = "above", price: number | null = 120) => ({ id: uid(n), symbol, direction, target: 100, triggered_price: price });
  const run = async (unseen: unknown[]) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    use({ "POST /alerts/check": { fired: [], unseen }, "POST /alerts/seen-all": {} });
    renderApp(<AlertsWatcher />);
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
  };
  it("checks after a few seconds, then every 90 seconds", async () => {
    await run([]);
    expect(api.sent("POST", "/alerts/check")).toHaveLength(1);
    await act(async () => { vi.advanceTimersByTime(90_000); });
    expect(api.sent("POST", "/alerts/check")).toHaveLength(2);
  });
  it("tells you about a reached alert and marks it seen", async () => {
    await run([alert(1, "OGDC")]);
    expect(await screen.findByRole("status")).toHaveTextContent("OGDC is above your target of 100 (now 120)");
    await waitFor(() => expect(api.sent("POST", "/alerts/seen-all")).toHaveLength(1));
  });
  it("says below for a falling alert and skips the price when unknown", async () => {
    await run([alert(1, "PPL", "below", null)]);
    expect(await screen.findByRole("status")).toHaveTextContent("PPL is below your target of 100");
    expect(screen.getByRole("status")).not.toHaveTextContent("now");
  });
  it("shows three, then summarises the rest", async () => {
    await run([1, 2, 3, 4, 5].map((n) => alert(n, `S${n}`)));
    expect(await screen.findByText(/2 more price alerts reached/)).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(4);
  });
  it("stays quiet when nothing is new", async () => {
    await run([]);
    expect(screen.queryByRole("status")).toBeNull();
    expect(api.sent("POST", "/alerts/seen-all")).toHaveLength(0);
  });
  it("does not check while the tab is hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    use({ "POST /alerts/check": { fired: [], unseen: [] } });
    renderApp(<AlertsWatcher />);
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(api.sent("POST", "/alerts/check")).toHaveLength(0);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(api.sent("POST", "/alerts/check")).toHaveLength(1);
  });
  it("does not bother anyone when the check fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    use({ "POST /alerts/check": new Error("offline") });
    renderApp(<AlertsWatcher />);
    await act(async () => { vi.advanceTimersByTime(4100); });
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("stops checking after it is removed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    use({ "POST /alerts/check": { fired: [], unseen: [] } });
    const { unmount } = renderApp(<AlertsWatcher />);
    unmount();
    await act(async () => { vi.advanceTimersByTime(200_000); });
    expect(api.sent("POST", "/alerts/check")).toHaveLength(0);
  });
});

describe("ScrollReveal", () => {
  type IOCallback = (entries: { isIntersecting: boolean; target: Element }[]) => void;
  let callback: IOCallback;
  const observed: Element[] = [];
  let disconnected = false;
  beforeEach(() => {
    observed.length = 0; disconnected = false;
    vi.stubGlobal("IntersectionObserver", class { constructor(cb: IOCallback) { callback = cb; } observe(el: Element) { observed.push(el); } unobserve() {} disconnect() { disconnected = true; } });
  });
  const page = (tops: number[]) => {
    document.querySelectorAll(".lp").forEach((n) => n.remove());
    const root = document.createElement("div"); root.className = "lp";
    tops.forEach((top, i) => { const s = document.createElement("section"); s.className = "lp-reveal"; s.id = `s${i}`; s.getBoundingClientRect = () => ({ top }) as DOMRect; root.appendChild(s); });
    document.body.appendChild(root);
    return root;
  };
  it("shows sections already on screen at once and watches the rest", () => {
    const root = page([100, 5000, 9000]);
    render(<ScrollReveal />);
    expect(root).toHaveClass("lp-js-reveal");
    expect(document.getElementById("s0")).toHaveClass("is-in");
    expect(document.getElementById("s1")).not.toHaveClass("is-in");
    expect(observed.map((e) => e.id)).toEqual(["s1", "s2"]);
  });
  it("shows a section when it scrolls into view, once", () => {
    page([5000]);
    render(<ScrollReveal />);
    act(() => callback([{ isIntersecting: false, target: document.getElementById("s0")! }]));
    expect(document.getElementById("s0")).not.toHaveClass("is-in");
    act(() => callback([{ isIntersecting: true, target: document.getElementById("s0")! }]));
    expect(document.getElementById("s0")).toHaveClass("is-in");
  });
  it("does nothing for people who prefer reduced motion", () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes("reduced-motion"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    const root = page([5000]);
    render(<ScrollReveal />);
    expect(root).not.toHaveClass("lp-js-reveal");
    expect(observed).toHaveLength(0);
  });
  it("does nothing when the browser cannot observe", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const root = page([5000]);
    render(<ScrollReveal />);
    expect(root).not.toHaveClass("lp-js-reveal");
  });
  it("does nothing on a page without the landing wrapper", () => { expect(() => render(<ScrollReveal />)).not.toThrow(); });
  it("cleans up when removed", () => {
    const root = page([100, 5000]);
    const { unmount } = render(<ScrollReveal />);
    unmount();
    expect(disconnected).toBe(true);
    expect(root).not.toHaveClass("lp-js-reveal");
    expect(document.getElementById("s0")).not.toHaveClass("is-in");
  });
});
