import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ store: { getAll: vi.fn(() => [{ name: "a", value: "1" }]), set: vi.fn() }, create: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => m.store }));
vi.mock("@supabase/ssr", () => ({ createServerClient: (...args: unknown[]) => { m.create(...args); return { marker: true }; } }));

import { createClient } from "@/lib/supabase/server";

beforeEach(() => { m.store.set.mockReset(); m.create.mockClear(); });

describe("server Supabase client", () => {
  it("is created with the public url and anon key from the environment", async () => {
    const client = await createClient();
    expect(client).toEqual({ marker: true });
    expect(m.create.mock.calls[0][0]).toBe(process.env.NEXT_PUBLIC_SUPABASE_URL);
    expect(m.create.mock.calls[0][1]).toBe(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  });
  it("reads cookies from the request", async () => {
    await createClient();
    const { cookies } = m.create.mock.calls[0][2];
    expect(cookies.getAll()).toEqual([{ name: "a", value: "1" }]);
  });
  it("writes cookies it is given", async () => {
    await createClient();
    const { cookies } = m.create.mock.calls[0][2];
    cookies.setAll([{ name: "b", value: "2", options: { path: "/" } }]);
    expect(m.store.set).toHaveBeenCalledWith("b", "2", { path: "/" });
  });
  it("ignores the error when cookies cannot be set from a Server Component", async () => {
    m.store.set.mockImplementation(() => { throw new Error("read only"); });
    await createClient();
    const { cookies } = m.create.mock.calls[0][2];
    expect(() => cookies.setAll([{ name: "b", value: "2", options: {} }])).not.toThrow();
  });
});
