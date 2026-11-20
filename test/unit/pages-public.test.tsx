import { render, screen, within } from "@testing-library/react";
import { cloneElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "../utils";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/lib/api", () => ({ api: vi.fn(async () => ({})), peek: () => undefined, setApiSpace: vi.fn(), clearApiCache: vi.fn(), requestsWaiting: () => 0, API_URL: "http://api.test" }));
// Charts only draw when their container has a size, and jsdom has no layout, so give them one.
vi.mock("recharts", async (orig) => {
  const real = await orig<typeof import("recharts")>();
  return { ...real, ResponsiveContainer: ({ children }: { children: ReactElement<Record<string, unknown>> }) => cloneElement(children, { width: 600, height: 300 }) };
});

import Landing from "@/app/page";
import Privacy, { metadata as privacyMeta } from "@/app/privacy/page";
import Terms, { metadata as termsMeta } from "@/app/terms/page";
import Loading from "@/app/(app)/loading";
import Template from "@/app/(app)/template";
import TreeLoader from "@/components/TreeLoader";
import { CategoryChart, IncomeSwingChart, MonthlyChart, TrendChart } from "@/components/DashboardCharts";

describe("Landing page", () => {
  it("has one main heading and sign up and log in calls to action", () => {
    renderApp(<Landing />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Make room for what matters.");
    const signup = screen.getAllByRole("link", { name: /Create your free account/ });
    expect(signup.length).toBeGreaterThanOrEqual(2);
    for (const a of signup) expect(a).toHaveAttribute("href", "/signup");
    expect(screen.getAllByRole("link", { name: "Log in" })[0]).toHaveAttribute("href", "/login");
  });
  it("includes the header, main landmark and footer", () => {
    renderApp(<Landing />);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Privacy/i }).length).toBeGreaterThan(0);
  });
  it("hides decorative graphics from assistive tech", () => {
    const { container } = renderApp(<Landing />);
    for (const svg of container.querySelectorAll("svg.lp-bars")) expect(svg).toHaveAttribute("aria-hidden", "true");
  });
  it("only links to real internal routes or anchors", () => {
    const { container } = renderApp(<Landing />);
    const routes = ["", "signup", "login", "privacy", "terms", "dashboard", "transactions", "income", "categories", "budget", "recurring", "goals", "net-worth", "stocks", "freelancer", "household", "ask", "notifications", "settings", "more"];
    const ok = new RegExp(`^(/(${routes.join("|")})(#[\\w-]+)?|#[\\w-]+|https://.+|mailto:.+)$`);
    for (const a of container.querySelectorAll("a[href]")) expect(a.getAttribute("href")).toMatch(ok);
    for (const a of container.querySelectorAll('a[href^="#"]')) {
      const id = a.getAttribute("href")!.slice(1);
      if (id) expect(container.querySelector(`[id="${id}"]`), `anchor target #${id}`).not.toBeNull();
    }
  });
});

describe("Legal pages", () => {
  it("privacy page covers storage, third parties and choices", () => {
    renderApp(<Privacy />);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeInTheDocument();
    for (const h of ["What we store", "Where it lives", "Who else receives data", "What we do not do", "Your choices", "Contact"]) expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "GitHub page" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(privacyMeta.title).toMatch(/Privacy policy/);
  });
  it("terms page says it is not advice", () => {
    renderApp(<Terms />);
    expect(screen.getByRole("heading", { level: 1, name: "Terms of use" })).toBeInTheDocument();
    expect(screen.getByText(/does not give financial, tax, investment or legal advice/)).toBeInTheDocument();
    expect(termsMeta.title).toMatch(/Terms of use/);
  });
  it("both show when they were last updated", () => {
    renderApp(<><Privacy /><Terms /></>);
    expect(screen.getAllByText(/17 November 2026/)).toHaveLength(2);
  });
});

describe("Loading, template and tree loader", () => {
  it("Loading announces itself as a busy status", () => {
    render(<Loading />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(within(status).getByText("Growing your numbers")).toBeInTheDocument();
    expect(within(status).getByRole("img", { name: "Loading" })).toHaveAttribute("width", "104");
  });
  it("Template wraps its children for the page fade", () => {
    const { container } = render(<Template><p>Inside</p></Template>);
    expect(container.firstElementChild).toHaveClass("page-enter");
    expect(screen.getByText("Inside")).toBeInTheDocument();
  });
  it("TreeLoader has a default size and label, and accepts both", () => {
    const { rerender } = render(<TreeLoader />);
    expect(screen.getByRole("img", { name: "Loading" })).toHaveAttribute("width", "120");
    rerender(<TreeLoader size={40} label="Working" />);
    expect(screen.getByRole("img", { name: "Working" })).toHaveAttribute("width", "40");
  });
});

describe("Dashboard charts", () => {
  const months = [{ month: "Sep", Income: 100000, Spent: 40000 }, { month: "Oct", Income: 120000, Spent: 50000 }];
  it("MonthlyChart draws income and spent bars with a legend", () => {
    const { container } = render(<MonthlyChart data={months} />);
    expect(container.querySelectorAll(".recharts-bar").length).toBe(2);
    expect(container.querySelector(".recharts-legend-wrapper")).toHaveTextContent(/Income/);
    expect(container.querySelector(".recharts-legend-wrapper")).toHaveTextContent(/Spent/);
  });
  it("MonthlyChart has both axes", () => {
    const { container } = render(<MonthlyChart data={months} />);
    expect(container.querySelector(".recharts-xAxis")).not.toBeNull();
    expect(container.querySelector(".recharts-yAxis")).not.toBeNull();
  });
  it("CategoryChart draws a pie", () => {
    const { container } = render(<CategoryChart data={[{ name: "Food", color: "#111", value: 30 }, { name: "Rent", color: "#222", value: 70 }]} />);
    expect(container.querySelector(".recharts-pie")).not.toBeNull();
  });
  it("TrendChart draws an area", () => {
    const { container } = render(<TrendChart data={[{ label: "11-01", value: 1 }, { label: "11-02", value: 2 }]} />);
    expect(container.querySelector(".recharts-area")).not.toBeNull();
  });
  it("IncomeSwingChart draws two lines", () => {
    const { container } = render(<IncomeSwingChart data={months} />);
    expect(container.querySelectorAll(".recharts-line").length).toBe(2);
  });
});
