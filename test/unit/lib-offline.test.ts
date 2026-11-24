import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ impl: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: (...a: unknown[]) => s.impl(...a), API_URL: "http://api.test" }));

import { QUEUE_EVENT, addOrQueue, discard, enqueue, flushQueue, readLists, readQueue, refreshLists, rememberUser, saveLists } from "@/lib/offlineQueue";

const U = "user-1";
const err = (status: number, message = "x") => Object.assign(new Error(message), { status });
const body = { type: "expense", amount: 50, occurred_on: "2026-11-20", note: "tea", category_id: null, income_source_id: null };
const setOnline = (v: boolean) => Object.defineProperty(navigator, "onLine", { value: v, configurable: true });

beforeEach(() => {
  localStorage.clear();
  s.impl.mockReset();
  setOnline(true);
});

describe("addOrQueue", () => {
  it("saves straight away when online and sends a client id", async () => {
    s.impl.mockResolvedValue({ id: "t1" });
    const r = await addOrQueue(U, body, "personal");
    expect(r).toEqual({ queued: false, saved: { id: "t1" } });
    const [path, opts] = s.impl.mock.calls[0];
    expect(path).toBe("/transactions");
    expect(opts.body).toMatchObject({ ...body, id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(opts.space).toBe("personal");
    expect(readQueue(U)).toEqual([]);
  });
  it("keeps it on the device when the browser says offline, without calling the server", async () => {
    setOnline(false);
    expect(await addOrQueue(U, body, "personal")).toEqual({ queued: true });
    expect(s.impl).not.toHaveBeenCalled();
    expect(readQueue(U)).toHaveLength(1);
  });
  it("keeps it when the server cannot be reached, with the same id it tried", async () => {
    s.impl.mockRejectedValue(err(0, "Cannot reach the server"));
    expect(await addOrQueue(U, body, "house-1")).toEqual({ queued: true });
    const tried = s.impl.mock.calls[0][1].body.id;
    expect(readQueue(U)[0]).toMatchObject({ id: tried, space: "house-1", body });
  });
  it("does not queue real refusals", async () => {
    s.impl.mockRejectedValue(err(400, "Amount must be positive"));
    await expect(addOrQueue(U, body, "personal")).rejects.toThrow("Amount must be positive");
    s.impl.mockRejectedValue(new Error("plain"));
    await expect(addOrQueue(U, body, "personal")).rejects.toThrow("plain");
    expect(readQueue(U)).toEqual([]);
  });
});

describe("queue storage", () => {
  it("keeps each person's entries apart and announces changes", () => {
    const seen = vi.fn();
    window.addEventListener(QUEUE_EVENT, seen);
    enqueue(U, body, "personal", "a");
    enqueue("other", body, "personal", "b");
    expect(readQueue(U).map((q) => q.id)).toEqual(["a"]);
    expect(readQueue("other").map((q) => q.id)).toEqual(["b"]);
    discard(U, "a");
    expect(readQueue(U)).toEqual([]);
    expect(localStorage.getItem(`coinleaf.queue.${U}`)).toBeNull();
    expect(seen).toHaveBeenCalledTimes(3);
    window.removeEventListener(QUEUE_EVENT, seen);
  });
  it("ignores unreadable data", () => {
    localStorage.setItem(`coinleaf.queue.${U}`, "{oops");
    expect(readQueue(U)).toEqual([]);
    localStorage.setItem(`coinleaf.queue.${U}`, '{"a":1}');
    expect(readQueue(U)).toEqual([]);
  });
  it("remembers who was signed in for the offline page", () => {
    rememberUser(U);
    expect(localStorage.getItem("coinleaf.lastUser")).toBe(U);
  });
  it("tells the person when the device cannot keep an entry", () => {
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    expect(() => enqueue(U, body, "personal", "a")).toThrow("cannot keep the entry");
    set.mockRestore();
  });
});

describe("saved lists", () => {
  const cats = [{ id: "c1", name: "Food", color: "#123456", extra: "dropped" }];
  const sources = [{ id: "s1", name: "Salary", amount: 1 }];
  it("keeps only what is needed to pick a category", () => {
    saveLists(U, cats, sources);
    expect(readLists(U)).toEqual({ categories: [{ id: "c1", name: "Food", color: "#123456" }], sources: [{ id: "s1", name: "Salary" }], at: expect.any(Number) });
  });
  it("reads nothing when nothing is saved or the data is damaged", () => {
    expect(readLists(U)).toBeNull();
    localStorage.setItem(`coinleaf.lists.${U}`, "{nope");
    expect(readLists(U)).toBeNull();
    localStorage.setItem(`coinleaf.lists.${U}`, JSON.stringify({ categories: "x" }));
    expect(readLists(U)).toBeNull();
  });
  it("does not throw when storage is full", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    expect(() => saveLists(U, cats, sources)).not.toThrow();
    spy.mockRestore();
  });
  it("fetches the personal lists quietly and saves them", async () => {
    s.impl.mockImplementation(async (p: string) => (p === "/categories" ? cats : sources));
    await refreshLists(U);
    expect(s.impl).toHaveBeenCalledWith("/categories", { quiet: true, space: "personal" });
    expect(s.impl).toHaveBeenCalledWith("/income-sources", { quiet: true, space: "personal" });
    expect(readLists(U)?.categories[0].name).toBe("Food");
  });
  it("does not ask again while the saved lists are recent, and asks when they are old", async () => {
    saveLists(U, cats, sources);
    await refreshLists(U);
    expect(s.impl).not.toHaveBeenCalled();
    s.impl.mockResolvedValue([]);
    await refreshLists(U, -1);
    expect(s.impl).toHaveBeenCalledTimes(2);
  });
  it("keeps the old lists when the connection is down", async () => {
    saveLists(U, cats, sources);
    s.impl.mockRejectedValue(err(0));
    await expect(refreshLists(U, -1)).resolves.toBeUndefined();
    expect(readLists(U)?.categories).toHaveLength(1);
  });
});

describe("flushQueue", () => {
  it("sends entries oldest first with their ids and spaces, then clears them", async () => {
    enqueue(U, { ...body, note: "first" }, "personal", "a");
    enqueue(U, { ...body, note: "second" }, "house-1", "b");
    s.impl.mockResolvedValue({});
    expect(await flushQueue(U)).toEqual({ sent: 2, failed: 0, left: 0 });
    expect(s.impl.mock.calls.map((c) => [c[1].body.id, c[1].body.note, c[1].space, c[1].quiet])).toEqual([
      ["a", "first", "personal", true],
      ["b", "second", "house-1", true],
    ]);
    expect(readQueue(U)).toEqual([]);
  });
  it("stops when the connection drops and keeps the rest", async () => {
    enqueue(U, body, "personal", "a");
    enqueue(U, body, "personal", "b");
    s.impl.mockResolvedValueOnce({}).mockRejectedValueOnce(err(0));
    expect(await flushQueue(U)).toEqual({ sent: 1, failed: 0, left: 1 });
    expect(readQueue(U).map((q) => q.id)).toEqual(["b"]);
  });
  it("keeps entries the server refuses, with the reason, and carries on with the rest", async () => {
    enqueue(U, body, "personal", "a");
    enqueue(U, body, "personal", "b");
    s.impl.mockRejectedValueOnce(err(400, "That category no longer exists")).mockResolvedValueOnce({});
    expect(await flushQueue(U)).toEqual({ sent: 1, failed: 1, left: 0 });
    expect(readQueue(U)).toEqual([expect.objectContaining({ id: "a", error: "That category no longer exists" })]);
    s.impl.mockClear();
    await flushQueue(U);
    expect(s.impl).not.toHaveBeenCalled(); // a refused entry is not retried forever
  });
  it("retries later on server trouble and rate limits", async () => {
    enqueue(U, body, "personal", "a");
    s.impl.mockRejectedValue(err(503));
    expect(await flushQueue(U)).toEqual({ sent: 0, failed: 0, left: 1 });
    s.impl.mockRejectedValue(err(429));
    expect(await flushQueue(U)).toEqual({ sent: 0, failed: 0, left: 1 });
    expect(readQueue(U)[0].error).toBeUndefined();
  });
  it("does not run twice at once", async () => {
    enqueue(U, body, "personal", "a");
    let release!: () => void;
    s.impl.mockImplementation(() => new Promise((r) => (release = () => r({}))));
    const first = flushQueue(U);
    expect(await flushQueue(U)).toEqual({ sent: 0, failed: 0, left: 1 });
    release();
    expect(await first).toEqual({ sent: 1, failed: 0, left: 0 });
    expect(s.impl).toHaveBeenCalledTimes(1);
  });
});

describe("offline page script", () => {
  const load = () => {
    const win = { crypto: { randomUUID: () => "11111111-2222-4333-8444-555555555555" }, document: { getElementById: () => null } } as unknown as Record<string, unknown>;
    vm.runInNewContext(fs.readFileSync(path.join(process.cwd(), "public/offline.js"), "utf8"), { window: win, document: win.document, crypto: win.crypto });
    return win.CoinLeafOffline as { addEntry: (s: Storage, f: Record<string, string>, now?: Date) => { ok: boolean; error?: string; waiting?: number } };
  };
  const LISTS = { categories: [{ id: "c1", name: "Food" }], sources: [{ id: "s1", name: "Salary" }], at: Date.now() };
  it("files an expense under a saved category and income under a saved source", () => {
    const { addEntry } = load();
    localStorage.setItem("coinleaf.lastUser", U);
    localStorage.setItem(`coinleaf.lists.${U}`, JSON.stringify(LISTS));
    addEntry(localStorage, { type: "expense", amount: "5", category: "c1", source: "s1", date: "2026-11-21" }, new Date(2026, 10, 21));
    addEntry(localStorage, { type: "income", amount: "9", category: "c1", source: "s1", date: "2026-11-21" }, new Date(2026, 10, 21));
    const [a, b] = readQueue(U);
    expect(a.body).toMatchObject({ category_id: "c1", income_source_id: null });
    expect(b.body).toMatchObject({ category_id: null, income_source_id: "s1" });
  });
  it("ignores a category it was not given by the app", () => {
    const { addEntry } = load();
    localStorage.setItem("coinleaf.lastUser", U);
    addEntry(localStorage, { type: "expense", amount: "5", category: "c1", date: "2026-11-21" }, new Date(2026, 10, 21));
    localStorage.setItem(`coinleaf.lists.${U}`, JSON.stringify(LISTS));
    addEntry(localStorage, { type: "expense", amount: "5", category: "not-mine", date: "2026-11-21" }, new Date(2026, 10, 21));
    localStorage.setItem(`coinleaf.lists.${U}`, "{broken");
    addEntry(localStorage, { type: "expense", amount: "5", category: "c1", date: "2026-11-21" }, new Date(2026, 10, 21));
    expect(readQueue(U).map((q) => q.body.category_id)).toEqual([null, null, null]);
  });
  it("reads the saved lists, and none when there are none", () => {
    const { readLists } = load() as unknown as { readLists: (s: Storage) => unknown };
    expect(readLists(localStorage)).toBeNull();
    localStorage.setItem("coinleaf.lastUser", U);
    expect(readLists(localStorage)).toBeNull();
    localStorage.setItem(`coinleaf.lists.${U}`, JSON.stringify(LISTS));
    expect(readLists(localStorage)).toEqual(LISTS);
  });
  it("adds to the same list the app reads", () => {
    const { addEntry } = load();
    localStorage.setItem("coinleaf.lastUser", U);
    const r = addEntry(localStorage, { type: "income", amount: "2500", note: " bonus ", date: "2026-11-21" }, new Date(2026, 10, 21));
    expect(r).toEqual({ ok: true, waiting: 1 });
    expect(readQueue(U)[0]).toMatchObject({ id: "11111111-2222-4333-8444-555555555555", space: "personal", body: { type: "income", amount: 2500, occurred_on: "2026-11-21", note: "bonus", category_id: null, income_source_id: null } });
    addEntry(localStorage, { type: "expense", amount: "10", note: "", date: "" }, new Date(2026, 10, 22));
    expect(readQueue(U)).toHaveLength(2);
    expect(readQueue(U)[1].body).toMatchObject({ occurred_on: "2026-11-22", note: null });
  });
  it("checks the entry and needs a remembered sign-in", () => {
    const { addEntry } = load();
    expect(addEntry(localStorage, { type: "expense", amount: "5" }).error).toContain("sign in");
    localStorage.setItem("coinleaf.lastUser", U);
    expect(addEntry(localStorage, { type: "expense", amount: "0" }).error).toContain("greater than zero");
    expect(addEntry(localStorage, { type: "expense", amount: "abc" }).ok).toBe(false);
    expect(addEntry(localStorage, { type: "gift", amount: "5" }).error).toContain("expense or income");
    expect(readQueue(U)).toEqual([]);
  });
  it("recovers from a damaged list", () => {
    const { addEntry } = load();
    localStorage.setItem("coinleaf.lastUser", U);
    localStorage.setItem(`coinleaf.queue.${U}`, "{bad");
    expect(addEntry(localStorage, { type: "expense", amount: "5", date: "2026-11-01" }).ok).toBe(true);
    expect(readQueue(U)).toHaveLength(1);
  });
});
