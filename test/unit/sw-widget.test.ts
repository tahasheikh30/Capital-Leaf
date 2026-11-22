import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

// Runs public/sw.js against a fake service worker scope and fires its events.
function boot(opts: { config?: unknown; fetchImpl?: (url: string, init?: RequestInit) => Promise<unknown>; withWidgets?: boolean } = {}) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const updates: { id: string; payload: { template: string; data: string } }[] = [];
  const store = new Map<string, unknown>();
  if (opts.config) store.set("/__widget-config", opts.config);
  const cacheApi = {
    open: async (name: string) => ({
      match: async (k: string) => (name === "coinleaf-widget" && store.has(k) ? { json: async () => store.get(k) } : undefined),
      addAll: async () => {},
    }),
    keys: async () => ["old", "coinleaf-shell-v2", "coinleaf-widget"],
    delete: vi.fn(async () => true),
    match: async () => "offline-page",
  };
  const self = {
    location: { origin: "https://app.test" },
    addEventListener: (n: string, h: (e: unknown) => void) => (handlers[n] = h),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(), openWindow: vi.fn() },
    widgets: opts.withWidgets === false ? undefined : {
      getByTag: async () => [{ instanceId: "w1", definition: { msAcTemplate: "/widgets/left-to-spend.json" } }],
      updateByInstanceId: async (id: string, payload: { template: string; data: string }) => void updates.push({ id, payload }),
    },
  };
  const fetchImpl = opts.fetchImpl ?? (async (url: string) => (url.endsWith(".json") ? { text: async () => "{template}" } : { ok: true, status: 200, json: async () => ({}) }));
  vm.runInNewContext(fs.readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8"), { self, caches: cacheApi, fetch: fetchImpl, URL, Intl, String, Math, Promise, JSON, Error });
  const run = async (name: string, event: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = [];
    handlers[name]({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  return { handlers, updates, self, cacheApi, run };
}

const summary = { month: "2026-11", currency: "PKR", leftToSpend: 70000, spent: 30000, income: 100000 };
const widget = { instanceId: "w1", definition: { msAcTemplate: "/widgets/left-to-spend.json" } };
const configured = { token: "clw_abc", api: "https://api.test" };
const shown = (u: { payload: { data: string } }[]) => JSON.parse(u[0].payload.data);

describe("service worker, widget", () => {
  it("shows the number with the token and the right currency", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const { run, updates } = boot({ config: configured, fetchImpl: async (url, init) => { calls.push([url, init]); return url.endsWith(".json") ? { text: async () => "{template}" } : { ok: true, status: 200, json: async () => summary }; } });
    await run("widgetinstall", { widget });
    expect(calls.find(([u]) => u.includes("/widget/summary"))?.[1]?.headers).toEqual({ Authorization: "Bearer clw_abc" });
    expect(calls.find(([u]) => u.includes("/widget/summary"))?.[0]).toBe("https://api.test/widget/summary");
    expect(updates[0].id).toBe("w1");
    expect(updates[0].payload.template).toBe("{template}");
    expect(shown(updates)).toMatchObject({ tone: "Good" });
    expect(shown(updates).amount).toMatch(/70,000/);
    expect(shown(updates).note).toMatch(/30,000.*100,000.*2026-11/);
  });
  it("marks an overspent month", async () => {
    const { run, updates } = boot({ config: configured, fetchImpl: async (u) => (u.endsWith(".json") ? { text: async () => "t" } : { ok: true, json: async () => ({ ...summary, leftToSpend: -500 }) }) });
    await run("widgetresume", { widget });
    expect(shown(updates).tone).toBe("Attention");
  });
  it("says what to do when it is not set up", async () => {
    const { run, updates } = boot();
    await run("widgetinstall", { widget });
    expect(shown(updates).note).toContain("Settings");
  });
  it("says when it was turned off and when offline", async () => {
    let status = 401;
    const { run, updates } = boot({ config: configured, fetchImpl: async (u) => (u.endsWith(".json") ? { text: async () => "t" } : { ok: false, status, json: async () => ({}) }) });
    await run("widgetinstall", { widget });
    expect(shown(updates).amount).toBe("Turned off");
    status = 500;
    updates.length = 0;
    await run("widgetinstall", { widget });
    expect(shown(updates).amount).toBe("Offline");
  });
  it("opens the app when the card is tapped", async () => {
    const { run, self } = boot();
    await run("widgetclick", { action: "open" });
    expect(self.clients.openWindow).toHaveBeenCalledWith("/dashboard");
    self.clients.openWindow.mockClear();
    await run("widgetclick", { action: "other" });
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });
  it("refreshes every widget on a background sync or when the app asks", async () => {
    const { run, updates } = boot({ config: configured, fetchImpl: async (u) => (u.endsWith(".json") ? { text: async () => "t" } : { ok: true, json: async () => summary }) });
    await run("periodicsync", { tag: "coinleaf-widgets" });
    expect(updates).toHaveLength(1);
    await run("periodicsync", { tag: "something-else" });
    expect(updates).toHaveLength(1);
    await run("message", { data: { type: "widget-refresh" } });
    expect(updates).toHaveLength(2);
    await run("message", { data: { type: "other" } });
    expect(updates).toHaveLength(2);
  });
  it("does nothing where widgets do not exist", async () => {
    const { run, updates } = boot({ withWidgets: false, config: configured });
    await run("widgetinstall", { widget });
    await run("periodicsync", { tag: "coinleaf-widgets" });
    expect(updates).toEqual([]);
  });
});

describe("service worker, app shell", () => {
  it("caches the offline page and its script, and keeps the widget cache when cleaning up", async () => {
    const { run, cacheApi, self } = boot();
    await run("install", {});
    expect(self.skipWaiting).toHaveBeenCalled();
    await run("activate", {});
    expect(cacheApi.delete).toHaveBeenCalledTimes(1);
    expect(cacheApi.delete).toHaveBeenCalledWith("old");
  });
  it("falls back to the offline page for navigations only", async () => {
    const { handlers } = boot({ fetchImpl: async () => { throw new Error("offline"); } });
    const responses: Promise<unknown>[] = [];
    const fire = (req: Record<string, unknown>) => handlers.fetch({ request: req, respondWith: (p: Promise<unknown>) => responses.push(p) });
    fire({ method: "GET", mode: "navigate", url: "https://app.test/dashboard" });
    expect(await responses[0]).toBe("offline-page");
    fire({ method: "POST", mode: "cors", url: "https://app.test/api/x" });
    fire({ method: "GET", mode: "cors", url: "https://api.test/x" });
    fire({ method: "GET", mode: "cors", url: "https://app.test/some.json" });
    expect(responses).toHaveLength(1);
    fire({ method: "GET", mode: "no-cors", url: "https://app.test/offline.js" });
    expect(responses).toHaveLength(2);
  });
});
