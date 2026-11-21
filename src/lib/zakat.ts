// Zakat: 2.5% of zakatable wealth held for a lunar year, once it reaches the nisab.
// Pure functions so the numbers can be tested on their own.

export const ZAKAT_RATE = 0.025;
export const NISAB_GOLD_GRAMS = 87.48; // 7.5 tola
export const NISAB_SILVER_GRAMS = 612.36; // 52.5 tola

export type NisabBasis = "gold" | "silver";

export type ZakatInput = {
  assets: number[]; // everything zakatable: cash, gold, stocks, funds, certificates, other
  deductions: number; // debts due that the person chooses to subtract
  basis: NisabBasis;
  pricePerGram: number; // the metal chosen as the basis
};

export type ZakatResult = {
  gross: number;
  net: number;
  nisab: number | null; // null until a metal price is known
  due: boolean;
  zakat: number;
};

const clean = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

export const nisabValue = (basis: NisabBasis, pricePerGram: number): number | null => {
  const p = clean(pricePerGram);
  if (p === 0) return null;
  return round2((basis === "gold" ? NISAB_GOLD_GRAMS : NISAB_SILVER_GRAMS) * p);
};

export function zakat(input: ZakatInput): ZakatResult {
  const gross = round2(input.assets.reduce((s, a) => s + clean(a), 0));
  const net = round2(Math.max(0, gross - clean(input.deductions)));
  const nisab = nisabValue(input.basis, input.pricePerGram);
  const due = nisab !== null && net >= nisab && net > 0;
  return { gross, net, nisab, due, zakat: due ? round2(net * ZAKAT_RATE) : 0 };
}
