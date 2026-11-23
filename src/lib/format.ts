import { getDefaultCurrency } from "@/lib/currency";

export function money(n: number, currency: string = getDefaultCurrency()) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n || 0);
}

export function monthKey(d: Date | string) {
  const date = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en", { month: "short", year: "2-digit" });
}

// "Nov 8" and "Nov 8, 2026" from a YYYY-MM-DD date.
export const shortDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en", { day: "numeric", month: "short" });
export const longDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Short numbers for chart axes: 14000 becomes 14K.
export function compact(n: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
}
