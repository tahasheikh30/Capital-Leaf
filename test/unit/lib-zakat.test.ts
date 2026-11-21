import { describe, expect, it } from "vitest";
import { NISAB_GOLD_GRAMS, NISAB_SILVER_GRAMS, nisabValue, zakat } from "@/lib/zakat";

describe("nisabValue", () => {
  it("is 87.48 g of gold", () => expect(nisabValue("gold", 30000)).toBe(2624400));
  it("is 612.36 g of silver", () => expect(nisabValue("silver", 300)).toBe(183708));
  it("is unknown without a price", () => {
    expect(nisabValue("gold", 0)).toBeNull();
    expect(nisabValue("gold", NaN)).toBeNull();
    expect(nisabValue("silver", -5)).toBeNull();
  });
  it("uses the standard weights", () => {
    expect(NISAB_GOLD_GRAMS).toBe(87.48);
    expect(NISAB_SILVER_GRAMS).toBe(612.36);
  });
});

describe("zakat", () => {
  const base = { assets: [1_000_000, 2_000_000], deductions: 0, basis: "gold" as const, pricePerGram: 30000 };
  it("is 2.5% when wealth reaches the nisab", () => expect(zakat(base)).toEqual({ gross: 3_000_000, net: 3_000_000, nisab: 2_624_400, due: true, zakat: 75_000 }));
  it("is nothing below the nisab", () => expect(zakat({ ...base, assets: [2_000_000] })).toMatchObject({ due: false, zakat: 0 }));
  it("is due exactly at the nisab", () => expect(zakat({ ...base, assets: [2_624_400] })).toMatchObject({ due: true, zakat: 65_610 }));
  it("subtracts debts first", () => {
    const r = zakat({ ...base, deductions: 1_000_000 });
    expect(r).toMatchObject({ gross: 3_000_000, net: 2_000_000, due: false, zakat: 0 });
  });
  it("never goes negative when debts exceed assets", () => expect(zakat({ ...base, deductions: 9_000_000 })).toMatchObject({ net: 0, due: false, zakat: 0 }));
  it("is not due when there is no price to measure the nisab", () => expect(zakat({ ...base, pricePerGram: 0 })).toMatchObject({ nisab: null, due: false, zakat: 0 }));
  it("can use silver, which gives a lower nisab", () => {
    const r = zakat({ assets: [200_000], deductions: 0, basis: "silver", pricePerGram: 300 });
    expect(r).toMatchObject({ nisab: 183_708, due: true, zakat: 5000 });
  });
  it("ignores negative and invalid amounts", () => expect(zakat({ ...base, assets: [-5, NaN, 3_000_000] }).gross).toBe(3_000_000));
  it("rounds to two decimals", () => expect(zakat({ ...base, assets: [3_000_000.333] }).zakat).toBe(75_000.01));
  it("handles nothing at all", () => expect(zakat({ assets: [], deductions: 0, basis: "gold", pricePerGram: 1 })).toMatchObject({ gross: 0, due: false, zakat: 0 }));
});
