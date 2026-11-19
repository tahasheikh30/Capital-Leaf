import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanApiUrl } from "@/lib/apiUrl";
import { compact, longDate, money, monthKey, monthLabel, shortDate, today } from "@/lib/format";
import { EXTERNAL_LINKS, LINKS } from "@/lib/nav";
import { isSavingsKind, SAVINGS_KINDS, shortKind } from "@/lib/savings";

afterEach(() => vi.useRealTimers());

describe("money", () => {
  it("formats rupees with no decimals", () => expect(money(125000)).toMatch(/Rs\s?125,000/));
  it("groups thousands with commas", () => expect(money(1234567)).toMatch(/1,234,567|12,34,567/));
  it("rounds to whole rupees", () => expect(money(10.6)).toMatch(/Rs\s?11$/));
  it("shows zero for nothing", () => { expect(money(0)).toMatch(/Rs\s?0/); expect(money(NaN)).toMatch(/Rs\s?0/); });
  it("shows negative amounts", () => expect(money(-500)).toMatch(/-/));
  it("supports another currency", () => expect(money(10, "USD")).toMatch(/US\$|\$/));
});

describe("monthKey and monthLabel", () => {
  it("makes a key from a date string", () => expect(monthKey("2026-03-15")).toBe("2026-03"));
  it("makes a key from a Date", () => expect(monthKey(new Date(2026, 10, 5))).toBe("2026-11"));
  it("pads single digit months", () => expect(monthKey("2026-01-31")).toBe("2026-01"));
  it("labels a month", () => expect(monthLabel("2026-03")).toBe("Mar 26"));
  it("labels December", () => expect(monthLabel("2025-12")).toBe("Dec 25"));
});

describe("dates", () => {
  it("short date", () => expect(shortDate("2026-11-08")).toBe("Nov 8"));
  it("long date", () => expect(longDate("2026-11-08")).toBe("Nov 8, 2026"));
  it("today is local and padded", () => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 0, 5, 23, 30)); expect(today()).toBe("2026-01-05"); });
});

describe("compact", () => {
  it.each([[14000, "14K"], [1500000, "1.5M"], [999, "999"], [0, "0"], [NaN, "0"]])("%s -> %s", (n, want) => expect(compact(n)).toBe(want));
});

describe("cleanApiUrl", () => {
  it.each([
    [undefined, "http://localhost:4000"], ["", "http://localhost:4000"], ["   ", "http://localhost:4000"],
    ["https://api.example.com", "https://api.example.com"], ["https://api.example.com/", "https://api.example.com"],
    ["https://api.example.com///", "https://api.example.com"], ["  https://api.example.com  ", "https://api.example.com"],
    ["api.example.com", "https://api.example.com"], ["http://localhost:4000", "http://localhost:4000"], ["HTTP://X.COM", "HTTP://X.COM"],
  ])("%j -> %s", (raw, want) => expect(cleanApiUrl(raw as string | undefined)).toBe(want));
});

describe("savings kinds", () => {
  it("offers cash, funds and other only", () => expect(SAVINGS_KINDS.map((k) => k.value)).toEqual(["cash", "mutual_fund", "other"]));
  it.each(["cash", "mutual_fund", "other"])("%s is savings", (k) => expect(isSavingsKind(k)).toBe(true));
  it.each(["gold", "certificate", "liability", "", "stocks"])("%s is not savings", (k) => expect(isSavingsKind(k)).toBe(false));
  it.each([["mutual_fund", "fund"], ["cash", "cash"], ["other", "other"], ["gold", "other"]])("shortKind(%s) = %s", (k, want) => expect(shortKind(k)).toBe(want));
});

describe("navigation lists", () => {
  it("every app link is a distinct absolute path", () => {
    expect(new Set(LINKS.map((l) => l.href)).size).toBe(LINKS.length);
    for (const l of LINKS) expect(l.href).toMatch(/^\/[a-z-]+$/);
  });
  it("has the main pages", () => { for (const p of ["/dashboard", "/transactions", "/budget", "/net-worth", "/settings"]) expect(LINKS.some((l) => l.href === p)).toBe(true); });
  it("has no Resources entry (they live in the footer)", () => expect(LINKS.some((l) => /resources/i.test(l.label))).toBe(false));
  it("external links are https with notes", () => { for (const l of EXTERNAL_LINKS) { expect(l.href).toMatch(/^https:\/\//); expect(l.note.length).toBeGreaterThan(0); } });
});
