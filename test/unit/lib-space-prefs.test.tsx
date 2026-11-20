import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, uid } from "../utils";

const h = vi.hoisted(() => ({ impl: (async () => ({})) as (p: string, o?: unknown) => Promise<unknown>, setApiSpace: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: (p: string, o?: unknown) => h.impl(p, o), peek: () => undefined, setApiSpace: h.setApiSpace, clearApiCache: vi.fn() }));

import PersonalOnly from "@/components/PersonalOnly";
import PrefsSync from "@/components/PrefsSync";
import SpaceSwitcher from "@/components/SpaceSwitcher";
import { PreferencesProvider, usePreferences } from "@/lib/preferences";
import { SpaceBoundary, SpaceProvider, useSpace } from "@/lib/space";

let api: ReturnType<typeof fakeApi>;
const use = (routes: Parameters<typeof fakeApi>[0]) => { api = fakeApi(routes); h.impl = api.impl as typeof h.impl; };
const HID = uid(77);
const HOUSE = { id: HID, name: "Home", role: "owner", members: [], invites: [], limits: { members: 6 } };

function Probe() {
  const s = useSpace();
  return (
    <div>
      <span data-testid="state">{`${s.space}|${s.isHousehold}|${s.loaded}|${s.household?.name ?? "none"}`}</span>
      <button onClick={() => s.setSpace(HID)}>go-house</button>
      <button onClick={() => s.setSpace("personal")}>go-personal</button>
      <button onClick={s.refresh}>refresh</button>
      <button onClick={() => void s.reload()}>reload</button>
    </div>
  );
}
const state = () => screen.getByTestId("state").textContent;

beforeEach(() => { h.setApiSpace.mockClear(); use({ "/households/me": { household: null } }); });

describe("SpaceProvider", () => {
  it("starts personal and loads the household", async () => {
    use({ "/households/me": { household: HOUSE } });
    render(<SpaceProvider><Probe /></SpaceProvider>);
    await waitFor(() => expect(state()).toBe("personal|false|true|Home"));
  });
  it("is loaded even when there is no household", async () => {
    render(<SpaceProvider><Probe /></SpaceProvider>);
    await waitFor(() => expect(state()).toBe("personal|false|true|none"));
  });
  it("stays personal and loaded if the household cannot be fetched", async () => {
    use({ "/households/me": new Error("down") });
    render(<SpaceProvider><Probe /></SpaceProvider>);
    await waitFor(() => expect(state()).toBe("personal|false|true|none"));
  });
  it("switches space, remembers it and tells the API layer", async () => {
    use({ "/households/me": { household: HOUSE } });
    render(<SpaceProvider><Probe /></SpaceProvider>);
    await waitFor(() => expect(state()).toContain("true|Home"));
    await userEvent.click(screen.getByText("go-house"));
    expect(state()).toBe(`${HID}|true|true|Home`);
    expect(localStorage.getItem("cl-space")).toBe(HID);
    expect(h.setApiSpace).toHaveBeenLastCalledWith(HID);
  });
  it("restores a remembered household", async () => {
    localStorage.setItem("cl-space", HID);
    use({ "/households/me": { household: HOUSE } });
    render(<SpaceProvider><Probe /></SpaceProvider>);
    await waitFor(() => expect(state()).toBe(`${HID}|true|true|Home`));
  });
  it("ignores a remembered value that is not an id", async () => {
    localStorage.setItem("cl-space", "<script>");
    render(<SpaceProvider><Probe /></SpaceProvider>);
    await waitFor(() => expect(state()).toBe("personal|false|true|none"));
  });
  it("falls back to personal if the remembered household is gone", async () => {
    localStorage.setItem("cl-space", HID);
    use({ "/households/me": { household: null } });
    render(<SpaceProvider><Probe /></SpaceProvider>);
    await waitFor(() => expect(state()).toBe("personal|false|true|none"));
    expect(h.setApiSpace).toHaveBeenLastCalledWith("personal");
  });
  it("falls back to personal if it is a different household", async () => {
    localStorage.setItem("cl-space", HID);
    use({ "/households/me": { household: { ...HOUSE, id: uid(78) } } });
    render(<SpaceProvider><Probe /></SpaceProvider>);
    await waitFor(() => expect(state()).toBe(`personal|false|true|Home`));
  });
});

describe("SpaceBoundary", () => {
  const Counter = () => { const r = vi.hoisted(() => ({ n: 0 })); return <i data-testid="mounted">{++r.n}</i>; };
  it("renders nothing until the space has loaded", async () => {
    let finish!: (v: unknown) => void;
    h.impl = () => new Promise((r) => (finish = r));
    render(<SpaceProvider><SpaceBoundary><b>page</b></SpaceBoundary></SpaceProvider>);
    expect(screen.queryByText("page")).toBeNull();
    await act(async () => finish({ household: null }));
    expect(await screen.findByText("page")).toBeInTheDocument();
  });
  it("starts the page fresh when the space or refresh changes", async () => {
    use({ "/households/me": { household: HOUSE } });
    let mounts = 0;
    function Page() { return <b ref={() => { mounts++; }}>page</b>; }
    render(<SpaceProvider><Probe /><SpaceBoundary><Page /></SpaceBoundary></SpaceProvider>);
    await screen.findByText("page");
    const before = mounts;
    await userEvent.click(screen.getByText("refresh"));
    expect(mounts).toBeGreaterThan(before);
    const afterRefresh = mounts;
    await userEvent.click(screen.getByText("go-house"));
    expect(mounts).toBeGreaterThan(afterRefresh);
  });
});

describe("SpaceSwitcher", () => {
  it("is hidden without a household", async () => {
    const { container } = render(<SpaceProvider><SpaceSwitcher /></SpaceProvider>);
    await waitFor(() => expect(api.sent("GET", "/households/me")).toHaveLength(1));
    expect(container.querySelector(".space-switch")).toBeNull();
  });
  it("switches between personal and household", async () => {
    use({ "/households/me": { household: HOUSE } });
    render(<SpaceProvider><SpaceSwitcher /><Probe /></SpaceProvider>);
    const home = await screen.findByRole("button", { name: "Home" });
    expect(screen.getByRole("button", { name: "Personal" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(home);
    expect(home).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Personal" }));
    expect(screen.getByRole("button", { name: "Personal" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("PersonalOnly", () => {
  it("shows its content in the personal space", async () => {
    render(<SpaceProvider><PersonalOnly><p>secret stocks</p></PersonalOnly></SpaceProvider>);
    expect(await screen.findByText("secret stocks")).toBeInTheDocument();
  });
  it("shows a way back inside a household", async () => {
    localStorage.setItem("cl-space", HID);
    use({ "/households/me": { household: HOUSE } });
    render(<SpaceProvider><PersonalOnly><p>secret stocks</p></PersonalOnly><Probe /></SpaceProvider>);
    expect(await screen.findByText("This section is personal")).toBeInTheDocument();
    expect(screen.queryByText("secret stocks")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Switch to my personal space" }));
    expect(await screen.findByText("secret stocks")).toBeInTheDocument();
  });
});

function Prefs() {
  const { prefs, update } = usePreferences();
  return (
    <div>
      <span data-testid="p">{`${prefs.theme}|${prefs.density}|${prefs.animations}|${prefs.emailNewAlerts}|${prefs.notifications.enabled}|${prefs.notifications.categories.alerts}`}</span>
      <button onClick={() => update((d) => { d.theme = "dark"; })}>dark</button>
      <button onClick={() => update((d) => { d.density = "compact"; d.animations = false; })}>compact</button>
      <button onClick={() => update((d) => { d.notifications.categories.alerts = false; })}>mute-alerts</button>
    </div>
  );
}
const p = () => screen.getByTestId("p").textContent;
const mount = (props: { theme?: "light" | "dark" | null; density?: "comfortable" | "compact" } = {}, sync = false) =>
  render(<PreferencesProvider initialTheme={props.theme === undefined ? "light" : props.theme} initialDensity={props.density ?? "comfortable"}><Prefs />{sync && <PrefsSync />}</PreferencesProvider>);

describe("preferences", () => {
  it("starts from the server's cookies", () => { mount({ theme: "dark", density: "compact" }); expect(p()).toBe("dark|compact|true|true|true|true"); });
  it("puts the choices on the page for the stylesheet", () => {
    mount({ theme: "dark", density: "compact" });
    expect(document.documentElement.dataset).toMatchObject({ theme: "dark", density: "compact", motion: "on" });
  });
  it("changes the page when a choice changes", async () => {
    mount();
    await userEvent.click(screen.getByText("compact"));
    expect(document.documentElement.dataset).toMatchObject({ density: "compact", motion: "off" });
  });
  it("saves theme and density in cookies, the rest in this browser", async () => {
    mount();
    await userEvent.click(screen.getByText("dark"));
    await userEvent.click(screen.getByText("compact"));
    expect(document.cookie).toContain("cl-theme=dark");
    expect(document.cookie).toContain("cl-density=compact");
    expect(JSON.parse(localStorage.getItem("cl-prefs")!)).toMatchObject({ animations: false });
    expect(JSON.parse(localStorage.getItem("cl-prefs")!).theme).toBeUndefined();
  });
  it("loads what this browser saved", async () => {
    localStorage.setItem("cl-prefs", JSON.stringify({ animations: false, emailNewAlerts: false, notifications: { enabled: false, popups: true, categories: { alerts: false, activity: true, household: true } } }));
    mount();
    await waitFor(() => expect(p()).toBe("light|comfortable|false|false|false|false"));
  });
  it("ignores saved values of the wrong type", async () => {
    localStorage.setItem("cl-prefs", JSON.stringify({ animations: "no", emailNewAlerts: 3, notifications: { enabled: "x", categories: { alerts: "x" } }, theme: "neon" }));
    mount();
    await act(async () => {});
    expect(p()).toBe("light|comfortable|true|true|true|true");
  });
  it("ignores unreadable saved data", async () => {
    localStorage.setItem("cl-prefs", "{{{");
    mount();
    await act(async () => {});
    expect(p()).toBe("light|comfortable|true|true|true|true");
  });
  it("follows a dark device on the first visit", async () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes("dark"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    mount({ theme: null });
    await waitFor(() => expect(p().startsWith("dark")).toBe(true));
  });
  it("keeps the saved theme over the device setting", async () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes("dark"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    mount({ theme: "light" });
    await act(async () => {});
    expect(p().startsWith("light")).toBe(true);
  });
  it("copes with blocked storage", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    mount();
    await userEvent.click(screen.getByText("dark"));
    expect(p().startsWith("dark")).toBe(true);
    spy.mockRestore();
  });
  it("only changes the one choice", async () => {
    mount();
    await userEvent.click(screen.getByText("mute-alerts"));
    expect(p()).toBe("light|comfortable|true|true|true|false");
  });
});

describe("preferences saved to the account", () => {
  it("the account's saved choices win after sign in", async () => {
    use({ "/profile": { preferences: { theme: "dark", density: "compact" } } });
    mount({}, true);
    await waitFor(() => expect(p().startsWith("dark|compact")).toBe(true));
  });
  it("a new account gets this device's choices", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    use({ "/profile": { preferences: {} } });
    mount({ theme: "dark" }, true);
    await vi.waitFor(() => expect(api.sent("GET", "/profile")).toHaveLength(1));
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(api.sent("PATCH", "/profile")).toHaveLength(1);
    expect((api.sent("PATCH", "/profile")[0].body as { preferences: { theme: string } }).preferences.theme).toBe("dark");
  });
  it("sends a burst of changes as one request", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    use({ "/profile": { preferences: { theme: "light" } } });
    mount({}, true);
    await vi.waitFor(() => expect(api.sent("GET", "/profile")).toHaveLength(1));
    await act(async () => { await Promise.resolve(); });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText("dark")); await user.click(screen.getByText("compact")); await user.click(screen.getByText("mute-alerts"));
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(api.sent("PATCH", "/profile")).toHaveLength(1);
    expect((api.sent("PATCH", "/profile")[0].body as { preferences: { density: string } }).preferences.density).toBe("compact");
  });
  it("does not save to the account before sign in", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mount();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText("dark"));
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(api.sent("PATCH", "/profile")).toHaveLength(0);
  });
  it("keeps working when the account cannot be reached", async () => {
    use({ "/profile": new Error("offline") });
    mount({ theme: "dark" }, true);
    await act(async () => {});
    expect(p().startsWith("dark")).toBe(true);
  });
  it("works without a provider", () => { function Lone() { const { prefs } = usePreferences(); return <i>{prefs.theme}</i>; } render(<Lone />); expect(screen.getByText("light")).toBeInTheDocument(); });
});
