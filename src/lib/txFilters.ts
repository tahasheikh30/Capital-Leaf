export type Filters = {
  q: string;
  type: "" | "income" | "expense";
  category: string; // "" any, "none" uncategorised, or a category id
  min: string;
  max: string;
  tags: string[];
  period: "month" | "all" | "custom";
  from: string;
  to: string;
  receipt: "" | "yes" | "no";
};

export const NO_FILTERS: Filters = { q: "", type: "", category: "", min: "", max: "", tags: [], period: "month", from: "", to: "", receipt: "" };

// True when the list should come from the search instead of the plain month view.
export const isFiltering = (f: Filters) => !!(f.q.trim() || f.type || f.category || f.min || f.max || f.tags.length || f.receipt || f.period !== "month");

export const monthEnd = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};

export function searchPath(f: Filters, month: string, offset: number, limit: number): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.type) p.set("type", f.type);
  if (f.category) p.set("category", f.category);
  if (f.min !== "") p.set("min", f.min);
  if (f.max !== "") p.set("max", f.max);
  if (f.tags.length) p.set("tags", f.tags.join(","));
  if (f.receipt) p.set("receipt", f.receipt === "yes" ? "true" : "false");
  if (f.period === "month" && month) {
    p.set("from", `${month}-01`);
    p.set("to", monthEnd(month));
  } else if (f.period === "custom") {
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
  }
  p.set("limit", String(limit));
  if (offset) p.set("offset", String(offset));
  return `/transactions/search?${p.toString()}`;
}

// A short description of what is being searched, for the result line.
export function describeFilters(f: Filters): string {
  const bits: string[] = [];
  if (f.q.trim()) bits.push(`"${f.q.trim()}"`);
  if (f.tags.length) bits.push(f.tags.map((t) => `#${t}`).join(" "));
  return bits.join(" ");
}
