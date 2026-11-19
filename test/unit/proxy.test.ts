import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) } }) }));

import { NextRequest } from "next/server";
import { config, proxy } from "@/proxy";

const get = (path: string) => proxy(new NextRequest(`http://localhost:3000${path}`));
beforeEach(() => { auth.user = null; });

describe("sign in redirects", () => {
  it.each(["/dashboard", "/income", "/transactions", "/budget", "/stocks", "/categories", "/recurring", "/settings", "/more", "/net-worth", "/freelancer", "/household", "/ask", "/join", "/notifications"])("sends a signed out visitor from %s to login", async (path) => {
    const res = await get(path);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    expect(new URL(res.headers.get("location")!).searchParams.get("next")).toBe(path);
  });
  it("remembers the invitation link to come back to", async () => {
    const res = await get("/join?token=abc123");
    expect(new URL(res.headers.get("location")!).searchParams.get("next")).toBe("/join?token=abc123");
  });
  it("sends nested pages to login too", async () => { expect((await get("/settings/data")).status).toBe(307); });
  it.each(["/", "/login", "/signup", "/forgot-password", "/privacy", "/terms", "/reset-password"])("leaves %s open to everyone", async (path) => { expect((await get(path)).status).toBe(200); });
  it("lets a signed in person through to the app", async () => { auth.user = { id: "u1" }; expect((await get("/dashboard")).status).toBe(200); });
  it.each(["/login", "/signup", "/forgot-password"])("sends a signed in person away from %s to the dashboard", async (path) => {
    auth.user = { id: "u1" };
    const res = await get(path);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/dashboard");
  });
  it("still lets a signed in person reset a password", async () => { auth.user = { id: "u1" }; expect((await get("/reset-password")).status).toBe(200); });
});

describe("content security policy", () => {
  const csp = async (path = "/") => (await get(path)).headers.get("content-security-policy")!;
  const dir = (policy: string, name: string) => policy.split("; ").find((d) => d.startsWith(name + " "))!;
  it("is on every page that is shown", async () => { auth.user = { id: "u1" }; expect(await csp()).toBeTruthy(); expect(await csp("/dashboard")).toBeTruthy(); });
  it("allows only this site by default", async () => { expect(dir(await csp(), "default-src")).toBe("default-src 'self'"); });
  it("only runs scripts carrying a fresh nonce", async () => {
    const a = dir(await csp(), "script-src"), b = dir(await csp(), "script-src");
    expect(a).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(a).toContain("'strict-dynamic'");
    expect(a).not.toContain("'unsafe-inline'");
    expect(a).not.toBe(b);
  });
  it("allows no inline styles in production", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.resetModules();
    const prod = await import("@/proxy");
    const policy = (await prod.proxy(new NextRequest("http://localhost:3000/"))).headers.get("content-security-policy")!;
    expect(dir(policy, "style-src")).toBe("style-src 'self'");
    expect(dir(policy, "script-src")).not.toContain("unsafe-eval");
    expect(policy).toContain("upgrade-insecure-requests");
    vi.unstubAllEnvs();
  });
  it("only relaxes the policy while developing", async () => { expect(dir(await csp(), "script-src")).toContain("'unsafe-eval'"); });
  it("lets the app talk to its API and login service only", async () => {
    const c = dir(await csp(), "connect-src");
    expect(c).toContain("'self'"); expect(c).toContain("http://localhost:4010");
    expect(c).not.toContain("*");
  });
  it("blocks plugins, framing and foreign form posts", async () => {
    const p = await csp();
    expect(dir(p, "object-src")).toBe("object-src 'none'");
    expect(dir(p, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(dir(p, "form-action")).toBe("form-action 'self'");
    expect(dir(p, "base-uri")).toBe("base-uri 'self'");
  });
});

describe("what the proxy runs on", () => {
  const source = (config.matcher[0] as { source: string }).source;
  const re = new RegExp(`^${source}$`);
  it.each(["/", "/dashboard", "/login", "/api/x"])("runs for %s", (p) => expect(re.test(p)).toBe(true));
  it.each(["/_next/static/x.js", "/_next/image", "/favicon.ico", "/sw.js", "/offline.html", "/offline.css", "/icons/a.png", "/manifest.webmanifest"])("skips %s", (p) => expect(re.test(p)).toBe(false));
  it("skips prefetch requests", () => { expect((config.matcher[0] as { missing: unknown[] }).missing).toHaveLength(2); });
});
