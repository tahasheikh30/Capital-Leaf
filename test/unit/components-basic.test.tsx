import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Bell from "@/components/Bell";
import DayStrip from "@/components/DayStrip";
import ExternalLink from "@/components/ExternalLink";
import Logo from "@/components/Logo";
import Meter from "@/components/Meter";
import Sheet from "@/components/Sheet";
import Tabs from "@/components/Tabs";
import { ToastProvider, useNotifications, useToast } from "@/components/Toast";
import { PreferencesProvider } from "@/lib/preferences";
import { AllProviders } from "../utils";

describe("Meter", () => {
  it("describes itself to screen readers", () => { render(<Meter value={42.4} label="Groceries" />); expect(screen.getByRole("img")).toHaveAccessibleName("Groceries: 42 percent"); });
  it.each([[-10, 0], [0, 0], [50, 50], [100, 100], [250, 100], [NaN, 0], [Infinity, 0]])("clamps %s to %s", (v, want) => {
    const { container } = render(<Meter value={v} label="x" />);
    expect(container.querySelector(".meter-fill")).toHaveAttribute("width", String(want));
  });
  it("uses the tone class", () => { const { container } = render(<Meter value={1} tone="bad" label="x" />); expect(container.querySelector("svg")).toHaveClass("meter-bad"); });
  it("defaults to the good tone", () => { const { container } = render(<Meter value={1} label="x" />); expect(container.querySelector("svg")).toHaveClass("meter-good"); });
});

describe("Logo", () => {
  it("shows the wordmark", () => { render(<Logo />); expect(screen.getByText("coinleaf.")).toBeInTheDocument(); });
  it("takes a tone", () => { const { container } = render(<Logo tone="dark" />); expect(container.firstChild).toHaveClass("logo-dark"); });
});

describe("ExternalLink", () => {
  it("opens safely in a new tab and says so", () => {
    render(<ExternalLink href="https://example.com">Docs</ExternalLink>);
    const a = screen.getByRole("link", { name: /Docs/ });
    expect(a).toHaveAttribute("target", "_blank");
    expect(a).toHaveAttribute("rel", "noopener noreferrer");
    expect(a).toHaveTextContent("(opens in a new tab)");
  });
});

describe("Tabs", () => {
  const tabs = [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }];
  it("marks the selected tab", () => {
    render(<Tabs tabs={tabs} value="b" onChange={() => {}} label="Letters" />);
    expect(screen.getByRole("tablist", { name: "Letters" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-selected", "false");
  });
  it("reports a change", async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={tabs} value="a" onChange={onChange} label="Letters" />);
    await userEvent.click(screen.getByRole("tab", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

describe("DayStrip", () => {
  it("draws a bar per spent day, dots for quiet and future days", () => {
    const { container } = render(<DayStrip daysInMonth={10} today={5} spendByDay={[100, 0, 300, 0, 50, 0, 0, 0, 0, 0]} plan={200} />);
    expect(container.querySelectorAll("rect")).toHaveLength(3);
    expect(container.querySelectorAll(".ds-future")).toHaveLength(5);
    expect(container.querySelectorAll(".ds-none")).toHaveLength(2);
  });
  it("marks days above the plan", () => {
    const { container } = render(<DayStrip daysInMonth={4} today={4} spendByDay={[100, 300, 50, 0]} plan={200} />);
    expect(container.querySelectorAll(".ds-over")).toHaveLength(1);
    expect(container.querySelectorAll(".ds-ok")).toHaveLength(2);
  });
  it("draws the plan line and mentions it", () => {
    const { container } = render(<DayStrip daysInMonth={4} today={2} spendByDay={[10, 10]} plan={500} />);
    expect(container.querySelector(".ds-plan")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAccessibleName(/500 rupees a day/);
  });
  it("has no plan line without a plan", () => {
    const { container } = render(<DayStrip daysInMonth={4} today={2} spendByDay={[10, 10]} plan={null} />);
    expect(container.querySelector(".ds-plan")).toBeNull();
    expect(screen.getByRole("img").getAttribute("aria-label")).not.toMatch(/plan/);
  });
  it("labels the first day and the last", () => {
    render(<DayStrip daysInMonth={30} today={3} spendByDay={[]} plan={null} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });
  it("copes with a month that has no spending at all", () => { expect(() => render(<DayStrip daysInMonth={28} today={28} spendByDay={[]} plan={null} />)).not.toThrow(); });
});

describe("Sheet", () => {
  it("renders nothing when closed", () => { render(<Sheet open={false} onClose={() => {}} title="T">body</Sheet>); expect(screen.queryByRole("dialog")).toBeNull(); });
  it("is a labelled modal dialog when open", () => {
    render(<Sheet open onClose={() => {}} title="Add it" subtitle="Quick">hello</Sheet>);
    const d = screen.getByRole("dialog", { name: "Add it" });
    expect(d).toHaveAttribute("aria-modal", "true");
    expect(within(d).getByText("Quick")).toBeInTheDocument();
    expect(within(d).getByText("hello")).toBeInTheDocument();
  });
  it("closes with the button, the backdrop and Escape", async () => {
    const onClose = vi.fn();
    const { baseElement } = render(<Sheet open onClose={onClose} title="T"><input aria-label="x" /></Sheet>);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(baseElement.querySelector(".sheet-backdrop")!);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
  it("focuses the first field and locks the page behind it", () => {
    const { unmount } = render(<Sheet open onClose={() => {}} title="T"><input aria-label="first" /></Sheet>);
    expect(screen.getByLabelText("first")).toHaveFocus();
    expect(document.body).toHaveClass("sheet-open");
    unmount();
    expect(document.body).not.toHaveClass("sheet-open");
  });
  it("keeps Tab inside the dialog", () => {
    render(<Sheet open onClose={() => {}} title="T"><button>one</button><button>two</button></Sheet>);
    // jsdom has no layout, so every element reports no offsetParent. Give them one.
    for (const el of document.querySelectorAll("button, input")) Object.defineProperty(el, "offsetParent", { get: () => document.body });
    const last = screen.getByRole("button", { name: "two" });
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });
  it("gives focus back when it closes", () => {
    const opener = document.createElement("button"); document.body.appendChild(opener); opener.focus();
    const { rerender } = render(<Sheet open onClose={() => {}} title="T"><input aria-label="x" /></Sheet>);
    rerender(<Sheet open={false} onClose={() => {}} title="T"><input aria-label="x" /></Sheet>);
    expect(opener).toHaveFocus();
  });
});

function Pusher({ calls }: { calls: Array<(t: ReturnType<typeof useToast>) => void> }) {
  const toast = useToast();
  const { notes, unread, markAllRead, clearAll } = useNotifications();
  return (
    <div>
      {calls.map((c, i) => <button key={i} onClick={() => c(toast)}>push{i}</button>)}
      <button onClick={markAllRead}>read</button>
      <button onClick={clearAll}>clear</button>
      <span data-testid="count">{notes.length}:{unread}</span>
    </div>
  );
}
const withToasts = (ui: React.ReactNode, initial?: Parameters<typeof PreferencesProvider>[0]["initialTheme"]) => render(<PreferencesProvider initialTheme={initial ?? "light"} initialDensity="comfortable"><ToastProvider>{ui}</ToastProvider></PreferencesProvider>);

describe("Toast and notifications", () => {
  it("shows a toast and keeps a notification", async () => {
    withToasts(<Pusher calls={[(t) => t.success("Saved it")]} />);
    await userEvent.click(screen.getByText("push0"));
    expect(screen.getByRole("status")).toHaveTextContent("Saved it");
    expect(screen.getByTestId("count")).toHaveTextContent("1:1");
  });
  it("uses an alert role for errors", async () => {
    withToasts(<Pusher calls={[(t) => t.error("Broke")]} />);
    await userEvent.click(screen.getByText("push0"));
    expect(screen.getByRole("alert")).toHaveTextContent("Broke");
  });
  it("hides a toast after its time and keeps the note", () => {
    vi.useFakeTimers();
    withToasts(<Pusher calls={[(t) => t.success("Gone soon")]} />);
    fireEvent.click(screen.getByText("push0"));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3500 + 300); });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByTestId("count")).toHaveTextContent("1:1");
  });
  it("lets errors live longer than successes", () => {
    vi.useFakeTimers();
    withToasts(<Pusher calls={[(t) => t.error("Slow")]} />);
    fireEvent.click(screen.getByText("push0"));
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("can be dismissed by hand", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    withToasts(<Pusher calls={[(t) => t.info("Hi")]} />);
    fireEvent.click(screen.getByText("push0"));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("shows the same message once, not twice in a row", async () => {
    withToasts(<Pusher calls={[(t) => t.success("Same")]} />);
    await userEvent.click(screen.getByText("push0")); await userEvent.click(screen.getByText("push0"));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByTestId("count")).toHaveTextContent("2:2");
  });
  it("shows at most four toasts at once", async () => {
    withToasts(<Pusher calls={Array.from({ length: 6 }, (_, i) => (t: ReturnType<typeof useToast>) => t.info(`m${i}`))} />);
    for (let i = 0; i < 6; i++) await userEvent.click(screen.getByText(`push${i}`));
    expect(screen.getAllByRole("status")).toHaveLength(4);
  });
  it("marks everything read and clears the list", async () => {
    withToasts(<Pusher calls={[(t) => t.success("a"), (t) => t.success("b")]} />);
    await userEvent.click(screen.getByText("push0")); await userEvent.click(screen.getByText("push1"));
    await userEvent.click(screen.getByText("read"));
    expect(screen.getByTestId("count")).toHaveTextContent("2:0");
    await userEvent.click(screen.getByText("clear"));
    expect(screen.getByTestId("count")).toHaveTextContent("0:0");
  });
  it("keeps the list for the tab across a reload", async () => {
    const first = withToasts(<Pusher calls={[(t) => t.success("kept")]} />);
    await userEvent.click(screen.getByText("push0"));
    first.unmount();
    withToasts(<Pusher calls={[]} />);
    expect(await screen.findByTestId("count")).toHaveTextContent("1:1");
  });
  it("copes with a broken saved list", () => {
    sessionStorage.setItem("cl-notes", "{not json");
    withToasts(<Pusher calls={[]} />);
    expect(screen.getByTestId("count")).toHaveTextContent("0:0");
  });
  it("respects the choice to turn notifications off, but never hides errors", async () => {
    localStorage.setItem("cl-prefs", JSON.stringify({ notifications: { enabled: false, popups: true, categories: { alerts: true, activity: true, household: true } } }));
    withToasts(<Pusher calls={[(t) => t.success("quiet"), (t) => t.error("loud")]} />);
    await act(async () => {});
    await userEvent.click(screen.getByText("push0"));
    expect(screen.queryByRole("status")).toBeNull();
    await userEvent.click(screen.getByText("push1"));
    expect(screen.getByRole("alert")).toHaveTextContent("loud");
  });
  it("respects a muted category", async () => {
    localStorage.setItem("cl-prefs", JSON.stringify({ notifications: { enabled: true, popups: true, categories: { alerts: false, activity: true, household: true } } }));
    withToasts(<Pusher calls={[(t) => t.info("price", { category: "alerts" })]} />);
    await act(async () => {});
    await userEvent.click(screen.getByText("push0"));
    expect(screen.getByTestId("count")).toHaveTextContent("0:0");
  });
  it("can record a note without a popup", async () => {
    localStorage.setItem("cl-prefs", JSON.stringify({ notifications: { enabled: true, popups: false, categories: { alerts: true, activity: true, household: true } } }));
    withToasts(<Pusher calls={[(t) => t.success("silent")]} />);
    await act(async () => {});
    await userEvent.click(screen.getByText("push0"));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByTestId("count")).toHaveTextContent("1:1");
  });
  it("works without a provider", () => { function Lone() { const t = useToast(); t.success("x"); return <i>ok</i>; } render(<Lone />); expect(screen.getByText("ok")).toBeInTheDocument(); });
});

describe("Bell", () => {
  const withBell = (calls: Array<(t: ReturnType<typeof useToast>) => void> = []) => render(<AllProviders><Pusher calls={calls} /><Bell /></AllProviders>);
  it("links to notifications", () => { withBell(); expect(screen.getByRole("link", { name: "Notifications" })).toHaveAttribute("href", "/notifications"); });
  it("shows how many are unread", async () => {
    withBell([(t) => t.info("one"), (t) => t.info("two")]);
    await userEvent.click(screen.getByText("push0")); await userEvent.click(screen.getByText("push1"));
    expect(screen.getByRole("link", { name: "Notifications, 2 unread" })).toBeInTheDocument();
  });
  it("caps the badge at 9+", async () => {
    withBell(Array.from({ length: 11 }, (_, i) => (t: ReturnType<typeof useToast>) => t.info(`n${i}`)));
    for (let i = 0; i < 11; i++) await userEvent.click(screen.getByText(`push${i}`));
    expect(screen.getByText("9+")).toBeInTheDocument();
  });
});
