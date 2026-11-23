import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ session: { access_token: "tok", user: { id: "u1" } } as unknown, signOut: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { getSession: async () => ({ data: { session: auth.session } }), signOut: auth.signOut } }) }));

type Api = typeof import("@/lib/api");
let m: Api;
const fetchMock = vi.fn();
const reply = (status: number, body: unknown = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => body, blob: async () => new Blob(["x"]) });

beforeEach(async () => {
  vi.resetModules();
  auth.session = { access_token: "tok", user: { id: "u1" } };
  auth.signOut.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(reply(200, { hello: "world" }));
  vi.stubGlobal("fetch", fetchMock);
  m = await import("@/lib/api");
});
afterEach(() => vi.unstubAllGlobals());

const lastCall = () => fetchMock.mock.calls.at(-1) as [string, RequestInit & { headers: Record<string, string> }];

describe("api requests", () => {
  it("goes to the backend under /api with the login token", async () => {
    expect(await m.api("/things")).toEqual({ hello: "world" });
    const [url, init] = lastCall();
    expect(url).toBe("http://localhost:4010/api/things");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.cache).toBe("no-store");
  });
  it("sends JSON bodies with a content type", async () => {
    await m.api("/things", { method: "POST", body: { a: 1 } });
    const [, init] = lastCall();
    expect(init.body).toBe('{"a":1}');
    expect(init.headers["Content-Type"]).toBe("application/json");
  });
  it("sends no content type when there is no body", async () => {
    await m.api("/things", { method: "DELETE" });
    expect(lastCall()[1].headers["Content-Type"]).toBeUndefined();
  });
  it("sends no token when signed out", async () => {
    auth.session = null;
    await m.api("/things");
    expect(lastCall()[1].headers.Authorization).toBeUndefined();
  });
  it("returns nothing for a 204", async () => {
    fetchMock.mockResolvedValue(reply(204));
    expect(await m.api("/x", { method: "DELETE" })).toBeUndefined();
  });
});

describe("errors", () => {
  it("raises the server's message with its status", async () => {
    fetchMock.mockResolvedValue(reply(400, { error: "Bad amount" }));
    await expect(m.api("/x", { method: "POST", body: {} })).rejects.toMatchObject({ message: "Bad amount", status: 400 });
  });
  it("has a fallback message when the server sends none", async () => {
    fetchMock.mockResolvedValue({ status: 500, ok: false, json: async () => { throw new Error("no json"); } });
    await expect(m.api("/x")).rejects.toMatchObject({ message: "Request failed", status: 500 });
  });
  it("explains too many requests", async () => {
    fetchMock.mockResolvedValue(reply(429));
    await expect(m.api("/x")).rejects.toMatchObject({ status: 429, message: expect.stringMatching(/Too many requests/) });
  });
  it("explains an unreachable server and makes the next load check it again", async () => {
    sessionStorage.setItem("cl-server-awake", "1");
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(m.api("/x")).rejects.toMatchObject({ status: 0, message: "Cannot reach the server. Please try again." });
    expect(sessionStorage.getItem("cl-server-awake")).toBeNull();
  });
  it("signs out and goes to the login page on 401", async () => {
    const original = window.location;
    Object.defineProperty(window, "location", { value: { href: "/dashboard" }, writable: true, configurable: true });
    fetchMock.mockResolvedValue(reply(401));
    await expect(m.api("/x")).rejects.toMatchObject({ status: 401 });
    expect(auth.signOut).toHaveBeenCalled();
    expect(window.location.href).toBe("/login");
    Object.defineProperty(window, "location", { value: original, writable: true, configurable: true });
  });
  it("asks for the authenticator code, without signing out, when the server says it is owed", async () => {
    const original = window.location;
    Object.defineProperty(window, "location", { value: { href: "/dashboard" }, writable: true, configurable: true });
    const body = { error: "Two-step verification required", code: "mfa_required" };
    const res = { status: 401, ok: false, json: async () => body, clone: () => ({ json: async () => body }) };
    fetchMock.mockResolvedValue(res);
    auth.signOut.mockClear();
    await expect(m.api("/x")).rejects.toMatchObject({ status: 401 });
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(window.location.href).toBe("/verify");
    Object.defineProperty(window, "location", { value: original, writable: true, configurable: true });
  });
});

describe("the read cache", () => {
  it("remembers a GET for peek", async () => {
    expect(m.peek("/things")).toBeUndefined();
    await m.api("/things");
    expect(m.peek("/things")).toEqual({ hello: "world" });
  });
  it("shares one request between simultaneous reads", async () => {
    await Promise.all([m.api("/same"), m.api("/same"), m.api("/same")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not share different paths", async () => {
    await Promise.all([m.api("/a"), m.api("/b")]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("clears everything after a change", async () => {
    await m.api("/things");
    await m.api("/things", { method: "POST", body: {} });
    expect(m.peek("/things")).toBeUndefined();
  });
  it("keeps the cache after a quiet background change", async () => {
    await m.api("/things");
    await m.api("/alerts/check", { method: "POST", quiet: true });
    expect(m.peek("/things")).toBeDefined();
  });
  it("clears when asked", async () => {
    await m.api("/things");
    m.clearApiCache();
    expect(m.peek("/things")).toBeUndefined();
  });
  it("does not cache failures", async () => {
    fetchMock.mockResolvedValueOnce(reply(500, { error: "x" }));
    await m.api("/x").catch(() => {});
    expect(m.peek("/x")).toBeUndefined();
  });
  it("clears the cache when a different person signs in", async () => {
    await m.api("/things");
    auth.session = { access_token: "t2", user: { id: "u2" } };
    await m.api("/other");
    expect(m.peek("/things")).toBeUndefined();
  });
});

describe("spaces", () => {
  const hid = "00000000-0000-4000-8000-0000000000aa";
  it("sends no space header in the personal space", async () => {
    await m.api("/transactions");
    expect(lastCall()[1].headers["X-Space"]).toBeUndefined();
  });
  it("sends the household in the X-Space header", async () => {
    m.setApiSpace(hid);
    await m.api("/transactions");
    expect(lastCall()[1].headers["X-Space"]).toBe(hid);
  });
  it.each(["/holdings", "/holdings/abc", "/assets", "/net-worth", "/savings-transfers", "/dividends", "/alerts/check", "/freelancer/summary", "/profile", "/account", "/households/me", "/features"])("%s always uses the personal space", async (path) => {
    m.setApiSpace(hid);
    await m.api(path);
    expect(lastCall()[1].headers["X-Space"]).toBeUndefined();
  });
  it("does not mistake a similar name for a personal path", async () => {
    m.setApiSpace(hid);
    await m.api("/assetsx");
    expect(lastCall()[1].headers["X-Space"]).toBe(hid);
  });
  it("ignores the query string when choosing the space", async () => {
    m.setApiSpace(hid);
    await m.api("/holdings?x=1");
    expect(lastCall()[1].headers["X-Space"]).toBeUndefined();
  });
  it("keeps caches apart per space", async () => {
    await m.api("/transactions");
    m.setApiSpace(hid);
    expect(m.peek("/transactions")).toBeUndefined();
  });
  it("switching to the same space keeps the cache", async () => {
    await m.api("/transactions");
    m.setApiSpace("personal");
    expect(m.peek("/transactions")).toBeDefined();
  });
});

describe("requestsWaiting", () => {
  it("counts requests in flight", async () => {
    let finish!: (v: unknown) => void;
    fetchMock.mockReturnValue(new Promise((r) => (finish = r)));
    const p = m.api("/slow");
    await vi.waitFor(() => expect(m.requestsWaiting()).toBe(1));
    finish(reply(200, {}));
    await p;
    expect(m.requestsWaiting()).toBe(0);
  });
  it("does not count quiet requests", async () => {
    let finish!: (v: unknown) => void;
    fetchMock.mockReturnValue(new Promise((r) => (finish = r)));
    const p = m.api("/slow", { quiet: true });
    await new Promise((r) => setTimeout(r, 5));
    expect(m.requestsWaiting()).toBe(0);
    finish(reply(200, {})); await p;
  });
  it("counts down after a failure too", async () => {
    fetchMock.mockResolvedValue(reply(500, {}));
    await m.api("/x").catch(() => {});
    expect(m.requestsWaiting()).toBe(0);
  });
});

describe("downloadFile", () => {
  beforeEach(() => {
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => "blob:x");
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  });
  it("downloads through a temporary link", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await m.downloadFile("/export/transactions.csv", "t.csv");
    expect(lastCall()[0]).toBe("http://localhost:4010/api/export/transactions.csv");
    expect(lastCall()[1].headers.Authorization).toBe("Bearer tok");
    expect(click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
    expect(document.querySelector("a[download]")).toBeNull();
  });
  it("explains export limits", async () => {
    fetchMock.mockResolvedValue(reply(429));
    await expect(m.downloadFile("/export/all.json", "x")).rejects.toMatchObject({ status: 429, message: expect.stringMatching(/Too many exports/) });
  });
  it("reports a failed export", async () => {
    fetchMock.mockResolvedValue(reply(500, { error: "Kaput" }));
    await expect(m.downloadFile("/export/all.json", "x")).rejects.toMatchObject({ message: "Kaput", status: 500 });
  });
  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    await expect(m.downloadFile("/export/all.json", "x")).rejects.toMatchObject({ status: 0 });
  });
});
