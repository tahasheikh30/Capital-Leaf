import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useToast } from "@/components/Toast";
import { fakeApi, field, renderApp, uid } from "../utils";

const s = vi.hoisted(() => ({ impl: (async () => ({})) as (p: string, o?: unknown) => Promise<unknown>, peek: vi.fn(() => undefined) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/household" }));
vi.mock("@/lib/api", () => ({ api: (p: string, o?: unknown) => s.impl(p, o), peek: s.peek, setApiSpace: vi.fn(), clearApiCache: vi.fn(), requestsWaiting: () => 0, API_URL: "http://api.test" }));

import NotificationsPage from "@/app/(app)/notifications/page";
import AskPage from "@/app/(app)/ask/page";
import HouseholdPage from "@/app/(app)/household/page";

let api: ReturnType<typeof fakeApi>;
const use = (routes: Parameters<typeof fakeApi>[0]) => { api = fakeApi({ "/households/me": { household: null }, ...routes }); s.impl = api.impl as typeof s.impl; };
beforeEach(() => { s.peek.mockReturnValue(undefined); });

// Pushes a few messages into the notification list when mounted.
function Seed({ items }: { items: [("success" | "error" | "info"), string, Record<string, string>?][] }) {
  const t = useToast();
  return <button onClick={() => { for (const [k, m, o] of items) t[k](m, o as never); }}>seed</button>;
}
const seeded = (items: Parameters<typeof Seed>[0]["items"]) => renderApp(<><Seed items={items} /><NotificationsPage /></>);

describe("Notifications page", () => {
  it("shows the all caught up state and no clear button", async () => {
    use({ "/alerts": [] });
    renderApp(<NotificationsPage />);
    expect(screen.getByText("You are all caught up")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear list" })).not.toBeInTheDocument();
    expect(await screen.findByText(/None yet/)).toBeInTheDocument();
  });
  it("lists messages, links to where they belong, and clears them", async () => {
    use({ "/alerts": [] });
    const user = userEvent.setup();
    seeded([["success", "Saved a thing"], ["error", "Broke a thing"], ["info", "FYI", { href: "/stocks" }], ["success", "Joined", { href: "/household", category: "household" }], ["info", "Elsewhere", { href: "/nowhere" }]]);
    await user.click(screen.getByRole("button", { name: "seed" }));
    expect(await screen.findByText("Saved a thing", { selector: ".note-text" })).toBeInTheDocument();
    expect(screen.getByText("Broke a thing", { selector: ".note-text" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Open Stocks" })).toHaveAttribute("href", "/stocks");
    expect(screen.getByRole("link", { name: "Open Household" })).toHaveAttribute("href", "/household");
    expect(screen.getAllByRole("link", { name: /Open/ })).toHaveLength(2);
    expect(screen.getAllByText("Just now").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Clear list" }));
    expect(screen.getByText("You are all caught up")).toBeInTheDocument();
  });
  it("links to the notification settings", () => {
    use({ "/alerts": [] });
    renderApp(<NotificationsPage />);
    expect(screen.getByRole("link", { name: /Settings/ })).toHaveAttribute("href", "/settings#notifications");
  });
  it("shows reached price alerts, newest first, at most ten", async () => {
    const alerts = Array.from({ length: 12 }, (_, i) => ({ id: uid(i + 1), symbol: `S${i}`, direction: i === 0 ? "below" : "above", target: 10 + i, active: i === 1, triggered_at: `2026-11-${String(i + 1).padStart(2, "0")}T10:00:00Z`, triggered_price: i === 2 ? null : 20 + i }));
    use({ "/alerts": [...alerts, { id: uid(99), symbol: "NEVER", direction: "above", target: 1, active: true, triggered_at: null }] });
    renderApp(<NotificationsPage />);
    expect(await screen.findByText(/S11 went above 21/)).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem").filter((li) => /went above|fell below/.test(li.textContent ?? ""));
    expect(rows).toHaveLength(10);
    expect(rows[0]).toHaveTextContent("S11");
    expect(screen.queryByText(/NEVER/)).not.toBeInTheDocument();
    expect(screen.queryByText(/S1 went above/)).not.toBeInTheDocument();
    expect(screen.getByText(/S2 went above 12/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage alerts" })).toHaveAttribute("href", "/stocks");
  });
  it("shows armed again and the fell below wording", async () => {
    use({ "/alerts": [{ id: uid(1), symbol: "ABC", direction: "below", target: 5, active: true, triggered_at: "2026-11-01T10:00:00Z", triggered_price: 4.5 }] });
    renderApp(<NotificationsPage />);
    expect(await screen.findByText(/ABC fell below 5/)).toBeInTheDocument();
    expect(screen.getByText(/armed again/)).toBeInTheDocument();
  });
  it("copes with alerts failing to load", async () => {
    use({ "/alerts": new Error("x") });
    renderApp(<NotificationsPage />);
    expect(await screen.findByText(/None yet/)).toBeInTheDocument();
  });
});

describe("Ask page", () => {
  it("shows a loading state, then explains when AI is not set up", async () => {
    use({ "/ai/status": { available: false, enabled: false } });
    renderApp(<AskPage />);
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
    expect(await screen.findByText(/not set up on this server/)).toBeInTheDocument();
  });
  it("points to Settings when the feature is off", async () => {
    use({ "/ai/status": { available: true, enabled: false } });
    renderApp(<AskPage />);
    expect(await screen.findByRole("link", { name: "Go to Settings" })).toHaveAttribute("href", "/settings");
  });
  it("shows an error toast when status fails", async () => {
    use({ "/ai/status": new Error("Status down") });
    renderApp(<AskPage />);
    expect(await screen.findByText("Status down")).toBeInTheDocument();
  });
  it("asks a typed question and lists answers newest first", async () => {
    let n = 0;
    use({ "/ai/status": { available: true, enabled: true }, "POST /ai/ask": () => ({ answer: `Answer ${++n}` }) });
    const user = userEvent.setup();
    renderApp(<AskPage />);
    const box = await screen.findByLabelText("Your question");
    const ask = screen.getByRole("button", { name: "Ask" });
    expect(ask).toBeDisabled();
    await user.type(box, "ab");
    expect(ask).toBeDisabled();
    await user.type(box, "c food");
    await user.click(ask);
    expect(await screen.findByText("Answer 1")).toBeInTheDocument();
    expect(api.sent("POST", "/ai/ask")[0].body).toEqual({ question: "abc food" });
    expect(box).toHaveValue("");
    await user.type(box, "second one");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText("Answer 2");
    const answers = [...document.querySelectorAll(".answer")].map((e) => e.textContent);
    expect(answers).toEqual(["Answer 2", "Answer 1"]);
  });
  it("asks the suggested questions in one click", async () => {
    use({ "/ai/status": { available: true, enabled: true }, "POST /ai/ask": { answer: "Fine." } });
    const user = userEvent.setup();
    renderApp(<AskPage />);
    await user.click(await screen.findByRole("button", { name: /Am I on track with my budget/ }));
    expect(await screen.findByText("Fine.")).toBeInTheDocument();
    expect(api.sent("POST", "/ai/ask")[0].body).toEqual({ question: "Am I on track with my budget this month?" });
  });
  it("shows the error and keeps the question when asking fails", async () => {
    use({ "/ai/status": { available: true, enabled: true }, "POST /ai/ask": new Error("Daily limit reached") });
    const user = userEvent.setup();
    renderApp(<AskPage />);
    const box = await screen.findByLabelText("Your question");
    await user.type(box, "how much?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText("Daily limit reached")).toBeInTheDocument();
    expect(box).toHaveValue("how much?");
    expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled();
  });
  it("shows Thinking while waiting and ignores a second ask", async () => {
    let release: (v: unknown) => void = () => {};
    use({ "/ai/status": { available: true, enabled: true }, "POST /ai/ask": () => new Promise((r) => { release = r; }) as never });
    const user = userEvent.setup();
    renderApp(<AskPage />);
    await user.type(await screen.findByLabelText("Your question"), "hello there");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByRole("button", { name: "Thinking..." })).toBeDisabled();
    expect(screen.getAllByRole("button").filter((b) => b.classList.contains("chip")).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    await act(async () => release({ answer: "Done" }));
    expect(await screen.findByText("Done")).toBeInTheDocument();
    expect(api.sent("POST", "/ai/ask")).toHaveLength(1);
  });
  it("says which space it looks at", async () => {
    use({ "/ai/status": { available: true, enabled: true } });
    const first = renderApp(<AskPage />);
    expect(await screen.findByText("Looking at your personal records")).toBeInTheDocument();
    first.unmount();
    localStorage.setItem("cl-space", uid(9));
    use({ "/ai/status": { available: true, enabled: true }, "/households/me": { household: { id: uid(9), name: "Our home", role: "owner", members: [], invites: [], limits: { members: 6 } } } });
    renderApp(<AskPage />);
    expect(await screen.findByText("Looking at Our home")).toBeInTheDocument();
  });
});

const hh = (over: Record<string, unknown> = {}) => ({ id: uid(9), name: "Our home", role: "owner", limits: { members: 6 },
  members: [{ user_id: uid(1), name: "Taha", email: "t@x.com", role: "owner" }, { user_id: uid(2), name: "", email: "m@x.com", role: "member" }],
  invites: [{ id: uid(5), email: "new@x.com", expires_at: "2026-11-25T00:00:00Z" }], ...over });

describe("Household page", () => {
  it("offers to create a household and then switches to it", async () => {
    let created = false;
    use({ "/households/me": () => ({ household: created ? hh() : null }), "POST /households": () => { created = true; return { id: uid(9) }; } });
    const user = userEvent.setup();
    renderApp(<HouseholdPage />);
    await user.type(field("Household name"), "Our home");
    await user.click(screen.getByRole("button", { name: "Create household" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Our home" })).toBeInTheDocument();
    expect(api.sent("POST", "/households")[0].body).toEqual({ name: "Our home" });
    expect(localStorage.getItem("cl-space")).toBe(uid(9));
  });
  it("shows an error when creating fails", async () => {
    use({ "POST /households": new Error("Name taken") });
    const user = userEvent.setup();
    renderApp(<HouseholdPage />);
    await user.type(field("Household name"), "X");
    await user.click(screen.getByRole("button", { name: "Create household" }));
    expect(await screen.findByText("Name taken")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create household" })).toBeEnabled();
  });
  it("shows members and invites to the owner", async () => {
    use({ "/households/me": { household: hh() } });
    renderApp(<HouseholdPage />);
    expect(await screen.findByText("You are the owner")).toBeInTheDocument();
    expect(screen.getByText("Members (2 of 6)")).toBeInTheDocument();
    expect(screen.getByText("Taha")).toBeInTheDocument();
    expect(screen.getByText("m@x.com", { selector: ".ledger-main" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1);
    expect(screen.getByText("Waiting to join")).toBeInTheDocument();
    expect(screen.getByText(/Ownership passes|ownership passes/)).toBeInTheDocument();
  });
  it("removes a member", async () => {
    use({ "/households/me": { household: hh() } });
    const user = userEvent.setup();
    renderApp(<HouseholdPage />);
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => expect(api.sent("DELETE", `/households/members/${uid(2)}`)).toHaveLength(1));
    expect(await screen.findByText("Member removed")).toBeInTheDocument();
  });
  it("invites by email and shows a copyable link", async () => {
    use({ "/households/me": { household: hh() }, "POST /households/invites": { link: "https://app.test/join?token=abc", emailed: false } });
    const writeText = vi.fn(async () => {});
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderApp(<HouseholdPage />);
    await user.type(await screen.findByLabelText(/Their email/).catch(() => field(/Their email/)), "friend@x.com");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText("https://app.test/join?token=abc")).toBeInTheDocument();
    expect(api.sent("POST", "/households/invites")[0].body).toEqual({ email: "friend@x.com" });
    expect(screen.getByText(/Invitation created. Share the link/)).toBeInTheDocument();
    expect(field(/Their email/)).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("https://app.test/join?token=abc");
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });
  it("says when the invitation was emailed", async () => {
    use({ "/households/me": { household: hh() }, "POST /households/invites": { link: "https://app.test/j", emailed: true } });
    const user = userEvent.setup();
    renderApp(<HouseholdPage />);
    await user.type(await screen.findByText(/Their email/).then(() => field(/Their email/)), "a@b.com");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText("Invitation emailed")).toBeInTheDocument();
  });
  it("tells when copying fails", async () => {
    use({ "/households/me": { household: hh() }, "POST /households/invites": { link: "https://app.test/j", emailed: false } });
    const user = userEvent.setup();
    renderApp(<HouseholdPage />);
    await user.type(await screen.findByText(/Their email/).then(() => field(/Their email/)), "a@b.com");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    await screen.findByText("https://app.test/j");
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(async () => { throw new Error("denied"); }) }, configurable: true });
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText(/Could not copy/)).toBeInTheDocument();
  });
  it("shows an error when inviting fails and shows no link", async () => {
    use({ "/households/me": { household: hh() }, "POST /households/invites": new Error("Household is full") });
    const user = userEvent.setup();
    renderApp(<HouseholdPage />);
    await user.type(await screen.findByText(/Their email/).then(() => field(/Their email/)), "a@b.com");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText("Household is full")).toBeInTheDocument();
    expect(document.querySelector(".link-box")).toBeNull();
  });
  it("cancels a pending invitation", async () => {
    use({ "/households/me": { household: hh() } });
    const user = userEvent.setup();
    renderApp(<HouseholdPage />);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(api.sent("DELETE", `/households/invites/${uid(5)}`)).toHaveLength(1));
    expect(await screen.findByText("Invitation cancelled")).toBeInTheDocument();
  });
  it("hides the waiting list when there are no invites", async () => {
    use({ "/households/me": { household: hh({ invites: [] }) } });
    renderApp(<HouseholdPage />);
    await screen.findByText("You are the owner");
    expect(screen.queryByText("Waiting to join")).not.toBeInTheDocument();
  });
  it("gives members a read-only view", async () => {
    use({ "/households/me": { household: hh({ role: "member" }) } });
    renderApp(<HouseholdPage />);
    expect(await screen.findByText("Member", { selector: ".page-head .badge" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.queryByText("Invite someone")).not.toBeInTheDocument();
    expect(screen.getByText(/Your personal records are not affected/)).toBeInTheDocument();
  });
  it("asks to confirm leaving, and can be cancelled", async () => {
    use({ "/households/me": { household: hh() } });
    const user = userEvent.setup();
    renderApp(<HouseholdPage />);
    await user.click(await screen.findByRole("button", { name: "Leave household" }));
    await user.click(screen.getByRole("button", { name: "Stay" }));
    expect(screen.getByRole("button", { name: "Leave household" })).toBeInTheDocument();
    expect(api.sent("DELETE", "/households/me")).toHaveLength(0);
  });
  it("leaves and returns to the personal space", async () => {
    localStorage.setItem("cl-space", uid(9));
    let left = false;
    use({ "/households/me": () => ({ household: left ? null : hh() }), "DELETE /households/me": () => { left = true; return {}; } });
    const user = userEvent.setup();
    renderApp(<HouseholdPage />);
    await user.click(await screen.findByRole("button", { name: "Leave household" }));
    await user.click(screen.getByRole("button", { name: "Yes, leave" }));
    expect(await screen.findByRole("button", { name: "Create household" })).toBeInTheDocument();
    expect(api.calls.some((c) => c.method === "DELETE" && c.path === "/households/me")).toBe(true);
    expect(localStorage.getItem("cl-space")).toBe("personal");
  });
  it("deletes the household data when the only member leaves", async () => {
    use({ "/households/me": { household: hh({ members: [{ user_id: uid(1), name: "Taha", email: "t@x.com", role: "owner" }], invites: [] }) } });
    const user = userEvent.setup();
    renderApp(<HouseholdPage />);
    expect(await screen.findByText(/Leaving deletes the household/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Leave household" }));
    await user.click(screen.getByRole("button", { name: "Yes, leave" }));
    await waitFor(() => expect(api.calls.some((c) => c.method === "DELETE" && c.path === "/households/me?delete_data=true")).toBe(true));
  });
  it("explains ownership passes on when the owner leaves a shared household", async () => {
    use({ "/households/me": { household: hh() } });
    renderApp(<HouseholdPage />);
    expect(await screen.findByText(/ownership passes to the next member/i)).toBeInTheDocument();
  });
});
