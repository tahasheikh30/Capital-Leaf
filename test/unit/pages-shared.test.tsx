import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderApp, uid } from "../utils";

const s = vi.hoisted(() => ({ impl: (async () => ({})) as (p: string, o?: unknown) => Promise<unknown>, peek: vi.fn(() => undefined) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/shared" }));
vi.mock("@/lib/api", () => ({ api: (p: string, o?: unknown) => s.impl(p, o), peek: s.peek, setApiSpace: vi.fn(), clearApiCache: vi.fn(), requestsWaiting: () => 0, API_URL: "http://api.test" }));

import SharedPage from "@/app/(app)/shared/page";

const ME = uid(1), SARA = uid(2), HID = uid(50);
const household = { id: HID, name: "Flat", role: "owner", members: [{ user_id: ME, role: "owner", name: "Taha", email: "t@x.com" }, { user_id: SARA, role: "member", name: "Sara", email: "s@x.com" }], invites: [], limits: { members: 6 } };
const view = (over: Record<string, unknown> = {}) => ({
  me: ME,
  members: [{ user_id: ME, role: "owner", name: "Taha" }, { user_id: SARA, role: "member", name: "Sara" }],
  expenses: [], settlements: [], balances: [{ user_id: ME, name: "Taha", balance: 0 }, { user_id: SARA, name: "Sara", balance: 0 }], suggestions: [], ...over,
});
const owing = view({
  expenses: [{ id: uid(10), note: "Groceries", amount: "90.00", paid_by: ME, participants: [ME, SARA], occurred_on: "2026-11-10", created_by: ME }],
  settlements: [{ id: uid(11), from_user: SARA, to_user: ME, amount: "5.00", occurred_on: "2026-11-12", created_by: SARA }],
  balances: [{ user_id: ME, name: "Taha", balance: 40 }, { user_id: SARA, name: "Sara", balance: -40 }],
  suggestions: [{ from: SARA, to: ME, amount: 40 }],
});
let api: ReturnType<typeof fakeApi>;
const use = (routes: Parameters<typeof fakeApi>[0], inHousehold = true) => {
  localStorage.clear();
  if (inHousehold) localStorage.setItem("cl-space", HID);
  api = fakeApi({ "/households/me": { household }, ...routes });
  s.impl = api.impl as typeof s.impl;
};
beforeEach(() => { s.peek.mockReturnValue(undefined); vi.stubGlobal("confirm", vi.fn(() => true)); });

describe("Shared expenses page", () => {
  it("points to the household page when there is no household", async () => {
    localStorage.clear();
    s.impl = fakeApi({ "/households/me": { household: null } }).impl as typeof s.impl;
    renderApp(<SharedPage />);
    expect(await screen.findByText(/Shared expenses live inside a household/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create or join one" })).toHaveAttribute("href", "/household");
  });
  it("offers to switch from the personal space", async () => {
    use({ "/shared": view() }, false);
    renderApp(<SharedPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Switch to Flat" }));
    expect(localStorage.getItem("cl-space")).toBe(HID);
    expect(await screen.findByText("Add an expense")).toBeInTheDocument();
  });
  it("shows an empty state and the form", async () => {
    use({ "/shared": view() });
    renderApp(<SharedPage />);
    expect(await screen.findByText(/No shared expenses yet/)).toBeInTheDocument();
    expect(screen.getByLabelText("Paid by")).toHaveValue(ME);
    expect(screen.getByRole("checkbox", { name: "You" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sara" })).toBeChecked();
  });
  it("shows the error when loading fails", async () => {
    use({ "/shared": new Error("Server down") });
    renderApp(<SharedPage />);
    expect(await screen.findByText("Server down")).toBeInTheDocument();
  });
  it("shows balances, the suggested payment, expenses and payments", async () => {
    use({ "/shared": owing });
    renderApp(<SharedPage />);
    expect(await screen.findByText("is owed Rs 40")).toBeInTheDocument();
    expect(screen.getByText("owes Rs 40")).toBeInTheDocument();
    expect(screen.getByText("Sara pays You")).toBeInTheDocument();
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText(/You paid, split with everyone/)).toBeInTheDocument();
    expect(screen.getByText("Sara paid You")).toBeInTheDocument();
  });
  it("says everyone is settled when there is nothing to pay", async () => {
    use({ "/shared": { ...owing, balances: view().balances, suggestions: [] } });
    renderApp(<SharedPage />);
    expect(await screen.findByText("Everyone is settled up.")).toBeInTheDocument();
    expect(screen.getAllByText("all settled")).toHaveLength(2);
  });
  it("adds an equal split expense", async () => {
    use({ "/shared": view() });
    renderApp(<SharedPage />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("What was it for"), "Internet");
    await user.type(screen.getByLabelText("Amount"), "60");
    expect(screen.getByText(/About Rs\s?30 each/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add expense" }));
    await waitFor(() => expect(api.sent("POST", "/shared/expenses")).toHaveLength(1));
    expect(api.sent("POST", "/shared/expenses")[0].body).toMatchObject({ note: "Internet", amount: 60, paid_by: ME, participants: [ME, SARA] });
    expect(await screen.findByText("Expense added")).toBeInTheDocument();
    expect(screen.getByLabelText("What was it for")).toHaveValue("");
  });
  it("lets you choose who paid and who shares", async () => {
    use({ "/shared": view() });
    renderApp(<SharedPage />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("What was it for"), "Sara's lunch");
    await user.type(screen.getByLabelText("Amount"), "20");
    await user.selectOptions(screen.getByLabelText("Paid by"), SARA);
    await user.click(screen.getByRole("checkbox", { name: "Sara" }));
    await user.click(screen.getByRole("button", { name: "Add expense" }));
    await waitFor(() => expect(api.sent("POST", "/shared/expenses")).toHaveLength(1));
    expect(api.sent("POST", "/shared/expenses")[0].body).toMatchObject({ paid_by: SARA, participants: [ME] });
  });
  it("will not add an expense split between nobody", async () => {
    use({ "/shared": view() });
    renderApp(<SharedPage />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("What was it for"), "x");
    await user.type(screen.getByLabelText("Amount"), "5");
    await user.click(screen.getByRole("checkbox", { name: "You" }));
    await user.click(screen.getByRole("checkbox", { name: "Sara" }));
    await user.click(screen.getByRole("button", { name: "Add expense" }));
    expect(await screen.findByText("Choose who this was split between")).toBeInTheDocument();
    expect(api.sent("POST", "/shared/expenses")).toHaveLength(0);
  });
  it("shows the server's message when adding fails", async () => {
    use({ "/shared": view(), "POST /shared/expenses": () => new Error("You have reached the limit for this item") });
    renderApp(<SharedPage />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("What was it for"), "x");
    await user.type(screen.getByLabelText("Amount"), "5");
    await user.click(screen.getByRole("button", { name: "Add expense" }));
    expect(await screen.findByText("You have reached the limit for this item")).toBeInTheDocument();
  });
  it("records a suggested payment", async () => {
    use({ "/shared": owing });
    renderApp(<SharedPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Mark as paid" }));
    await waitFor(() => expect(api.sent("POST", "/shared/settlements")).toHaveLength(1));
    expect(api.sent("POST", "/shared/settlements")[0].body).toEqual({ from_user: SARA, to_user: ME, amount: 40 });
    expect(await screen.findByText("Payment recorded")).toBeInTheDocument();
  });
  it("deletes an expense and a payment after confirming", async () => {
    use({ "/shared": owing });
    renderApp(<SharedPage />);
    const user = userEvent.setup();
    await screen.findByText("Groceries");
    await user.click(within(screen.getByText("Groceries").closest("li")!).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.sent("DELETE", `/shared/expenses/${uid(10)}`)).toHaveLength(1));
    await user.click(within(screen.getByText("Sara paid You").closest("li")!).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.sent("DELETE", `/shared/settlements/${uid(11)}`)).toHaveLength(1));
  });
  it("does nothing when the confirmation is declined", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    use({ "/shared": owing });
    renderApp(<SharedPage />);
    const user = userEvent.setup();
    await screen.findByText("Groceries");
    await user.click(within(screen.getByText("Groceries").closest("li")!).getByRole("button", { name: "Delete" }));
    expect(api.calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
  });
  it("names someone who left as a former member", async () => {
    use({ "/shared": { ...owing, balances: [{ user_id: ME, name: "Taha", balance: 40 }, { user_id: uid(99), name: "Former member", balance: -40 }], suggestions: [{ from: uid(99), to: ME, amount: 40 }] } });
    renderApp(<SharedPage />);
    expect(await screen.findByText("Former member pays You")).toBeInTheDocument();
  });
});
