// What a savings item can be. Gold, certificates and debts are not savings, so they are left out.
export const SAVINGS_KINDS = [
  { value: "cash", label: "Cash and bank" },
  { value: "mutual_fund", label: "Mutual fund" },
  { value: "other", label: "Other asset" },
] as const;
export type SavingsKind = (typeof SAVINGS_KINDS)[number]["value"];

export const isSavingsKind = (kind: string): kind is SavingsKind => SAVINGS_KINDS.some((k) => k.value === kind);

// A short name for dropdowns, so item names are not cut off on a phone.
export const shortKind = (kind: string) => (kind === "mutual_fund" ? "fund" : kind === "cash" ? "cash" : "other");
