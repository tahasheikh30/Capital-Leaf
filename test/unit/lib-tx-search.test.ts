import { describe, expect, it } from "vitest";
import { addTag, isValidTag, normalizeTag } from "@/lib/tags";
import { describeFilters, isFiltering, monthEnd, NO_FILTERS, searchPath } from "@/lib/txFilters";

describe("tags", () => {
  it("normalises", () => expect(normalizeTag("  Re  Imbursable ")).toBe("re imbursable"));
  it("validates length and characters", () => {
    expect(isValidTag("business")).toBe(true);
    expect(isValidTag("q1-2026_a b")).toBe(true);
    expect(isValidTag("کھانا")).toBe(true);
    expect(isValidTag("")).toBe(false);
    expect(isValidTag("x".repeat(25))).toBe(false);
    expect(isValidTag("a,b")).toBe(false);
    expect(isValidTag("#tag")).toBe(false);
  });
  it("adds a tag in lower case", () => expect(addTag([], " Business ")).toEqual({ tags: ["business"] }));
  it("ignores empty input and repeats", () => {
    expect(addTag(["a"], "  ")).toEqual({ tags: ["a"] });
    expect(addTag(["a"], "A")).toEqual({ tags: ["a"] });
  });
  it("takes a trailing comma", () => expect(addTag([], "trip,")).toEqual({ tags: ["trip"] }));
  it("explains why a tag is refused", () => {
    expect(addTag([], "x".repeat(30))).toEqual({ error: "Tags can be up to 24 characters" });
    expect(addTag([], "a$b")).toMatchObject({ error: expect.stringContaining("letters") });
    expect(addTag(Array.from({ length: 8 }, (_, i) => `t${i}`), "more")).toEqual({ error: "You can add up to 8 tags" });
  });
});

describe("search filters", () => {
  it("has no filters by default", () => expect(isFiltering(NO_FILTERS)).toBe(false));
  it("notices each kind of filter", () => {
    for (const patch of [{ q: "x" }, { type: "income" as const }, { category: "none" }, { min: "0" }, { max: "5" }, { tags: ["a"] }, { receipt: "yes" as const }, { period: "all" as const }]) {
      expect(isFiltering({ ...NO_FILTERS, ...patch })).toBe(true);
    }
  });
  it("ignores a blank search", () => expect(isFiltering({ ...NO_FILTERS, q: "   " })).toBe(false));
  it("finds the last day of a month", () => {
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthEnd("2028-02")).toBe("2028-02-29");
    expect(monthEnd("2026-11")).toBe("2026-11-30");
  });
  it("limits to the selected month by default", () => {
    expect(searchPath({ ...NO_FILTERS, q: " petrol " }, "2026-11", 0, 50)).toBe("/transactions/search?q=petrol&from=2026-11-01&to=2026-11-30&limit=50");
  });
  it("covers all time without dates", () => {
    expect(searchPath({ ...NO_FILTERS, period: "all", q: "a" }, "2026-11", 0, 50)).toBe("/transactions/search?q=a&limit=50");
  });
  it("uses custom dates, only those that are set", () => {
    expect(searchPath({ ...NO_FILTERS, period: "custom", from: "2026-01-01" }, "2026-11", 0, 50)).toBe("/transactions/search?from=2026-01-01&limit=50");
    expect(searchPath({ ...NO_FILTERS, period: "custom", from: "2026-01-01", to: "2026-02-01" }, "x", 0, 50)).toContain("to=2026-02-01");
  });
  it("sends every filter", () => {
    const p = new URL("http://x" + searchPath({ q: "shop", type: "expense", category: "none", min: "10", max: "99.5", tags: ["a", "b c"], period: "all", from: "", to: "", receipt: "no" }, "2026-11", 100, 50)).searchParams;
    expect(Object.fromEntries(p)).toEqual({ q: "shop", type: "expense", category: "none", min: "10", max: "99.5", tags: "a,b c", receipt: "false", limit: "50", offset: "100" });
  });
  it("keeps a zero amount", () => expect(searchPath({ ...NO_FILTERS, period: "all", min: "0" }, "", 0, 10)).toContain("min=0"));
  it("describes the search", () => {
    expect(describeFilters({ ...NO_FILTERS, q: " a ", tags: ["x", "y"] })).toBe('"a" #x #y');
    expect(describeFilters(NO_FILTERS)).toBe("");
  });
});
