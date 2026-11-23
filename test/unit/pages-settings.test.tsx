import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, field, renderApp } from "../utils";

const s = vi.hoisted(() => ({
  impl: (async () => ({})) as (p: string, o?: unknown) => Promise<unknown>, peek: vi.fn(() => undefined),
  push: vi.fn(), refresh: vi.fn(), download: vi.fn(async () => {}), clear: vi.fn(),
  signIn: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: s.push, refresh: s.refresh }), usePathname: () => "/settings" }));
vi.mock("@/lib/api", () => ({ api: (p: string, o?: unknown) => s.impl(p, o), peek: s.peek, setApiSpace: vi.fn(), clearApiCache: s.clear, downloadFile: s.download, requestsWaiting: () => 0, API_URL: "http://api.test" }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { getSession: async () => ({ data: { session: { user: { email: "me@x.com" } } } }), signInWithPassword: s.signIn, updateUser: s.updateUser, signOut: s.signOut } }) }));

import SettingsPage from "@/app/(app)/settings/page";
import { SettingGroup, SettingRow, Switch } from "@/components/settings/controls";

let api: ReturnType<typeof fakeApi>;
const profile = (over: Record<string, unknown> = {}) => ({ id: "u", full_name: "Taha Sheikh", timezone: "Asia/Karachi", currency: "PKR", freelancer_mode: false, tax_set_aside_pct: 10, smooth_budget: false, ai_enabled: false, ...over });
const use = (routes: Parameters<typeof fakeApi>[0] = {}) => { api = fakeApi({ "/households/me": { household: null }, "/profile": profile(), "/features": { ai: true, email: true }, ...routes }); s.impl = api.impl as typeof s.impl; };
beforeEach(() => {
  s.peek.mockReturnValue(undefined);
  for (const f of [s.push, s.refresh, s.download, s.clear, s.signIn, s.updateUser, s.signOut]) f.mockReset();
  s.download.mockResolvedValue(undefined); s.signIn.mockResolvedValue({ error: null }); s.updateUser.mockResolvedValue({ error: null }); s.signOut.mockResolvedValue({});
  history.replaceState(null, "", "/settings");
});
const go = async (name: string) => { await userEvent.setup().click(screen.getByRole("tab", { name })); };

describe("Setting controls", () => {
  it("Switch is an accessible switch that reports the new value", async () => {
    const on = vi.fn();
    renderApp(<Switch label="Thing" checked={false} onChange={on} />);
    const sw = screen.getByRole("switch", { name: "Thing" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.setup().click(sw);
    expect(on).toHaveBeenCalledWith(true);
  });
  it("Switch can be disabled and shows on state", () => {
    renderApp(<Switch label="Thing" checked disabled onChange={() => {}} />);
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByRole("switch")).toHaveClass("switch-on");
  });
  it("SettingRow and SettingGroup render their text, hint and danger style", () => {
    renderApp(<SettingGroup title="Group" hint="A hint" danger><SettingRow title="Row" description="Desc"><span>ctl</span></SettingRow><SettingRow title="Plain"><span /></SettingRow></SettingGroup>);
    const group = screen.getByRole("region", { name: "Group" });
    expect(group).toHaveClass("danger-zone");
    expect(within(group).getByText("A hint")).toBeInTheDocument();
    expect(within(group).getByText("Desc")).toBeInTheDocument();
    expect(within(group).getByText("ctl")).toBeInTheDocument();
  });
});

describe("Settings page, account tab", () => {
  it("opens on Account with the loaded profile", async () => {
    use();
    renderApp(<SettingsPage />);
    expect(screen.getByRole("tab", { name: "Account", selected: true })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Your name")).toHaveValue("Taha Sheikh"));
    expect(screen.getByLabelText("Email")).toHaveValue("me@x.com");
    expect(screen.getByLabelText("Email")).toBeDisabled();
    expect(screen.getByLabelText("Time zone")).toHaveValue("Asia/Karachi");
  });
  it("opens the tab named in the URL hash", async () => {
    history.replaceState(null, "", "/settings#display");
    use();
    renderApp(<SettingsPage />);
    expect(await screen.findByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
  });
  it("ignores an unknown hash", () => {
    history.replaceState(null, "", "/settings#bogus");
    use();
    renderApp(<SettingsPage />);
    expect(screen.getByRole("tab", { name: "Account", selected: true })).toBeInTheDocument();
  });
  it("switching tabs updates the hash", async () => {
    use();
    renderApp(<SettingsPage />);
    await go("Features");
    expect(location.hash).toBe("#features");
  });
  it("keeps a time zone that is not in the browser list", async () => {
    use({ "/profile": profile({ timezone: "Mars/Olympus" }) });
    renderApp(<SettingsPage />);
    await waitFor(() => expect(screen.getByLabelText("Time zone")).toHaveValue("Mars/Olympus"));
  });
  it("shows an error when the profile fails to load, and keeps Save disabled", async () => {
    use({ "/profile": new Error("Profile down") });
    renderApp(<SettingsPage />);
    expect(await screen.findByText("Profile down")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
  });
  it("saves name and time zone", async () => {
    use({ "PATCH /profile": profile({ full_name: "New Name" }) });
    const user = userEvent.setup();
    renderApp(<SettingsPage />);
    await waitFor(() => expect(screen.getByLabelText("Your name")).toHaveValue("Taha Sheikh"));
    await user.clear(screen.getByLabelText("Your name"));
    await user.type(screen.getByLabelText("Your name"), "New Name");
    await user.selectOptions(screen.getByLabelText("Time zone"), "Europe/London");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(api.sent("PATCH", "/profile")).toHaveLength(1));
    expect(api.sent("PATCH", "/profile")[0].body).toEqual({ full_name: "New Name", timezone: "Europe/London" });
    expect(await screen.findByText("Settings saved")).toBeInTheDocument();
  });
  it("changes the currency and sends it only when it changed", async () => {
    use({ "PATCH /profile": profile({ currency: "EUR" }) });
    const user = userEvent.setup();
    renderApp(<SettingsPage />);
    await waitFor(() => expect(screen.getByLabelText("Currency")).toHaveValue("PKR"));
    await user.selectOptions(screen.getByLabelText("Currency"), "EUR");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(api.sent("PATCH", "/profile")).toHaveLength(1));
    expect(api.sent("PATCH", "/profile")[0].body).toEqual({ full_name: "Taha Sheikh", timezone: "Asia/Karachi", currency: "EUR" });
  });
  it("shows an error toast when saving fails", async () => {
    use({ "PATCH /profile": new Error("Bad zone") });
    const user = userEvent.setup();
    renderApp(<SettingsPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Bad zone")).toBeInTheDocument();
  });

  describe("password", () => {
    const fill = async (cur: string, nw: string, again: string) => {
      const user = userEvent.setup();
      await user.type(screen.getByLabelText("Current password"), cur);
      await user.type(screen.getByLabelText("New password"), nw);
      await user.type(screen.getByLabelText("New password again"), again);
      await user.click(screen.getByRole("button", { name: "Change password" }));
    };
    it("rejects a short password without calling auth", async () => {
      use();
      renderApp(<SettingsPage />);
      await fill("oldpass", "short", "short");
      expect(await screen.findByText("Use at least 8 characters for the new password")).toBeInTheDocument();
      expect(s.signIn).not.toHaveBeenCalled();
    });
    it("rejects mismatching passwords", async () => {
      use();
      renderApp(<SettingsPage />);
      await fill("oldpass", "longenough1", "longenough2");
      expect(await screen.findByText("The two new passwords do not match")).toBeInTheDocument();
      expect(s.updateUser).not.toHaveBeenCalled();
    });
    it("proves the current password, then changes it and clears the form", async () => {
      use();
      renderApp(<SettingsPage />);
      await waitFor(() => expect(screen.getByLabelText("Email")).toHaveValue("me@x.com"));
      await fill("oldpass", "longenough1", "longenough1");
      expect(await screen.findByText("Password changed")).toBeInTheDocument();
      expect(s.signIn).toHaveBeenCalledWith({ email: "me@x.com", password: "oldpass" });
      expect(s.updateUser).toHaveBeenCalledWith({ password: "longenough1" });
      expect(screen.getByLabelText("Current password")).toHaveValue("");
    });
    it("stops when the current password is wrong", async () => {
      use();
      s.signIn.mockResolvedValue({ error: { message: "bad" } });
      renderApp(<SettingsPage />);
      await fill("wrong", "longenough1", "longenough1");
      expect(await screen.findByText("Your current password is not correct")).toBeInTheDocument();
      expect(s.updateUser).not.toHaveBeenCalled();
    });
    it("shows the provider error when the update fails", async () => {
      use();
      s.updateUser.mockResolvedValue({ error: { message: "Password is too common" } });
      renderApp(<SettingsPage />);
      await fill("oldpass", "longenough1", "longenough1");
      expect(await screen.findByText("Password is too common")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Change password" })).toBeEnabled();
    });
  });
});

describe("Settings page, notifications tab", () => {
  const open = async () => { use(); renderApp(<SettingsPage />); await go("Notifications"); };
  it("shows all switches on by default", async () => {
    await open();
    for (const l of ["All notifications", "Show pop-ups", "Price alerts", "Household", "Your own changes", "Email me by default"]) expect(screen.getByRole("switch", { name: l })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "All notifications" })).toHaveAttribute("aria-checked", "true");
  });
  it("turning everything off disables the rest and explains", async () => {
    await open();
    await userEvent.setup().click(screen.getByRole("switch", { name: "All notifications" }));
    expect(screen.getByRole("switch", { name: "All notifications" })).toHaveAttribute("aria-checked", "false");
    for (const l of ["Show pop-ups", "Price alerts", "Household", "Your own changes"]) expect(screen.getByRole("switch", { name: l })).toBeDisabled();
    expect(screen.getByText(/Off: no messages appear/)).toBeInTheDocument();
  });
  it("toggles pop-ups, a category, and email by default", async () => {
    await open();
    const user = userEvent.setup();
    for (const l of ["Show pop-ups", "Household", "Email me by default"]) {
      const before = screen.getByRole("switch", { name: l }).getAttribute("aria-checked");
      await user.click(screen.getByRole("switch", { name: l }));
      expect(screen.getByRole("switch", { name: l }).getAttribute("aria-checked")).not.toBe(before);
    }
  });
  it("says email is not set up when the server cannot send", async () => {
    use({ "/features": { ai: false, email: false } });
    renderApp(<SettingsPage />);
    await go("Notifications");
    expect(await screen.findByText(/Email is not set up on this server/)).toBeInTheDocument();
  });
  it("disables clearing when the list is empty", async () => {
    await open();
    expect(screen.getByRole("button", { name: "Clear the notification list" })).toBeDisabled();
  });
});

describe("Settings page, display tab", () => {
  const open = async () => { use(); renderApp(<SettingsPage />); await go("Display"); };
  it("switches theme", async () => {
    await open();
    const user = userEvent.setup();
    expect(screen.getByRole("radio", { name: /Light theme/ })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: /Dark theme/ }));
    expect(screen.getByRole("radio", { name: /Dark theme/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Light theme/ })).toHaveAttribute("aria-checked", "false");
  });
  it("changes density and animations", async () => {
    await open();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Density"), "compact");
    expect(screen.getByLabelText("Density")).toHaveValue("compact");
    await user.click(screen.getByRole("switch", { name: "Animations" }));
    expect(screen.getByRole("switch", { name: "Animations" })).toHaveAttribute("aria-checked", "false");
  });
});

describe("Settings page, features tab", () => {
  it("turns freelancer mode on and shows the extra settings", async () => {
    use({ "PATCH /profile": profile({ freelancer_mode: true }) });
    const user = userEvent.setup();
    renderApp(<SettingsPage />);
    await go("Features");
    await waitFor(() => expect(screen.getByRole("switch", { name: "Freelancer mode" })).toBeEnabled());
    expect(screen.queryByLabelText("Tax percentage")).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Freelancer mode" }));
    expect(await screen.findByText("Freelancer mode on")).toBeInTheDocument();
    expect(api.sent("PATCH", "/profile")[0].body).toEqual({ freelancer_mode: true });
    expect(screen.getByLabelText("Tax percentage")).toHaveValue(10);
  });
  it("turns freelancer mode off", async () => {
    use({ "/profile": profile({ freelancer_mode: true }), "PATCH /profile": profile() });
    const user = userEvent.setup();
    renderApp(<SettingsPage />);
    await go("Features");
    await user.click(await screen.findByRole("switch", { name: "Freelancer mode" }).then(async (e) => { await waitFor(() => expect(e).toHaveAttribute("aria-checked", "true")); return e; }));
    expect(await screen.findByText("Freelancer mode off")).toBeInTheDocument();
  });
  it("saves a changed tax rate on blur, but ignores invalid or unchanged values", async () => {
    use({ "/profile": profile({ freelancer_mode: true }), "PATCH /profile": profile({ freelancer_mode: true, tax_set_aside_pct: 15 }) });
    renderApp(<SettingsPage />);
    await go("Features");
    const input = await screen.findByLabelText("Tax percentage");
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: "150" } }); fireEvent.blur(input);
    fireEvent.change(input, { target: { value: "-1" } }); fireEvent.blur(input);
    expect(api.sent("PATCH", "/profile")).toHaveLength(0);
    fireEvent.change(input, { target: { value: "15" } }); fireEvent.blur(input);
    await waitFor(() => expect(api.sent("PATCH", "/profile")).toHaveLength(1));
    expect(api.sent("PATCH", "/profile")[0].body).toEqual({ tax_set_aside_pct: 15 });
    expect(await screen.findByText("Tax rate saved")).toBeInTheDocument();
  });
  it("toggles smooth budget", async () => {
    use({ "/profile": profile({ freelancer_mode: true }), "PATCH /profile": profile({ freelancer_mode: true, smooth_budget: true }) });
    const user = userEvent.setup();
    renderApp(<SettingsPage />);
    await go("Features");
    await user.click(await screen.findByRole("switch", { name: "Smooth my budget" }));
    await waitFor(() => expect(api.sent("PATCH", "/profile")[0]?.body).toEqual({ smooth_budget: true }));
  });
  it("shows an error toast if a change fails", async () => {
    use({ "PATCH /profile": new Error("Cannot change") });
    const user = userEvent.setup();
    renderApp(<SettingsPage />);
    await go("Features");
    await waitFor(() => expect(screen.getByRole("switch", { name: "Freelancer mode" })).toBeEnabled());
    await user.click(screen.getByRole("switch", { name: "Freelancer mode" }));
    expect(await screen.findByText("Cannot change")).toBeInTheDocument();
  });
  it("toggles AI features when the server supports them, with a privacy explanation", async () => {
    use({ "PATCH /profile": profile({ ai_enabled: true }) });
    const user = userEvent.setup();
    renderApp(<SettingsPage />);
    await go("Features");
    expect(await screen.findByText(/sent to an AI provider through OpenRouter/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("switch", { name: "AI features" })).toBeEnabled());
    await user.click(screen.getByRole("switch", { name: "AI features" }));
    expect(await screen.findByText("AI features on")).toBeInTheDocument();
    expect(api.sent("PATCH", "/profile")[0].body).toEqual({ ai_enabled: true });
  });
  it("says AI is not set up when the server lacks it", async () => {
    use({ "/features": { ai: false, email: false } });
    renderApp(<SettingsPage />);
    await go("Features");
    expect(await screen.findByText(/AI features are not set up on this server yet/)).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "AI features" })).not.toBeInTheDocument();
  });
  it("copes with the features call failing", async () => {
    use({ "/features": new Error("x") });
    renderApp(<SettingsPage />);
    await go("Features");
    expect(await screen.findByText(/AI features are not set up/)).toBeInTheDocument();
  });
});

describe("Settings page, data tab", () => {
  it("downloads the CSV and the JSON export", async () => {
    use();
    const user = userEvent.setup();
    renderApp(<SettingsPage />);
    await go("Data and security");
    await user.click(screen.getByRole("button", { name: "Transactions (CSV)" }));
    await user.click(screen.getByRole("button", { name: "Everything (JSON)" }));
    expect(s.download).toHaveBeenNthCalledWith(1, "/export/transactions.csv", "transactions.csv");
    expect(s.download).toHaveBeenNthCalledWith(2, "/export/all.json", "my-data.json");
    expect(await screen.findAllByText("Download started")).not.toHaveLength(0);
  });
  it("shows an error when a download fails", async () => {
    use();
    s.download.mockRejectedValue(new Error("Export failed"));
    renderApp(<SettingsPage />);
    await go("Data and security");
    await userEvent.setup().click(screen.getByRole("button", { name: "Transactions (CSV)" }));
    expect(await screen.findByText("Export failed")).toBeInTheDocument();
  });
  describe("delete account", () => {
    const open = async () => { use(); renderApp(<SettingsPage />); await waitFor(() => expect(screen.getByLabelText("Email")).toHaveValue("me@x.com")); await go("Data and security"); };
    it("keeps the button disabled until a password and DELETE are given", async () => {
      await open();
      const user = userEvent.setup();
      const btn = screen.getByRole("button", { name: "Delete my account" });
      expect(btn).toBeDisabled();
      await user.type(screen.getByLabelText("Your password"), "pw");
      expect(btn).toBeDisabled();
      await user.type(screen.getByLabelText("Type DELETE to confirm"), "delete");
      expect(btn).toBeDisabled();
      await user.clear(screen.getByLabelText("Type DELETE to confirm"));
      await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
      expect(btn).toBeEnabled();
    });
    it("deletes after verifying the password, signs out and goes to signup", async () => {
      await open();
      const user = userEvent.setup();
      await user.type(screen.getByLabelText("Your password"), "pw");
      await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
      await user.click(screen.getByRole("button", { name: "Delete my account" }));
      await waitFor(() => expect(s.push).toHaveBeenCalledWith("/signup"));
      expect(s.signIn).toHaveBeenCalledWith({ email: "me@x.com", password: "pw" });
      expect(api.sent("DELETE", "/account")[0].body).toEqual({ confirm: "DELETE MY ACCOUNT" });
      expect(s.clear).toHaveBeenCalled();
      expect(s.signOut).toHaveBeenCalled();
      expect(s.refresh).toHaveBeenCalled();
    });
    it("stops on a wrong password without deleting", async () => {
      await open();
      s.signIn.mockResolvedValue({ error: { message: "bad" } });
      const user = userEvent.setup();
      await user.type(screen.getByLabelText("Your password"), "nope");
      await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
      await user.click(screen.getByRole("button", { name: "Delete my account" }));
      expect(await screen.findByText("That password is not correct")).toBeInTheDocument();
      expect(api.sent("DELETE", "/account")).toHaveLength(0);
      expect(screen.getByRole("button", { name: "Delete my account" })).toBeEnabled();
    });
    it("shows the server error and keeps the user signed in", async () => {
      use({ "DELETE /account": new Error("Too many attempts") });
      renderApp(<SettingsPage />);
      await waitFor(() => expect(screen.getByLabelText("Email")).toHaveValue("me@x.com"));
      await go("Data and security");
      const user = userEvent.setup();
      await user.type(screen.getByLabelText("Your password"), "pw");
      await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
      await user.click(screen.getByRole("button", { name: "Delete my account" }));
      expect(await screen.findByText("Too many attempts")).toBeInTheDocument();
      expect(s.signOut).not.toHaveBeenCalled();
      expect(s.push).not.toHaveBeenCalled();
    });
  });
});
