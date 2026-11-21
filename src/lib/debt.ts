// Debt payoff planning. Pure functions, no network, so the maths can be tested on its own.

export type Debt = { id: string; name: string; balance: number; rate: number; minPayment: number };
export type Strategy = "avalanche" | "snowball";

export type DebtResult = { id: string; name: string; paidOffMonth: number | null; interest: number };
export type Plan = {
  strategy: Strategy | "minimums";
  months: number; // months until every debt is gone (the cap when never paid off)
  paidOff: boolean;
  totalInterest: number;
  totalPaid: number;
  debts: DebtResult[];
  order: string[]; // names in the order they are cleared
};

export const MAX_MONTHS = 600;
// When a debt has no minimum set, assume the usual lender default so the plan still works.
export const DEFAULT_MIN_SHARE = 0.03;

const cents = (n: number) => Math.round(n * 100) / 100;

// Turns the saved liability rows into planner input. Rows with nothing owed are dropped.
export function toDebts(rows: { id: string; kind: string; name: string; amount: number | string | null; annual_rate?: number | string | null; min_payment?: number | string | null }[]): Debt[] {
  return rows
    .filter((r) => r.kind === "liability" && Number(r.amount) > 0)
    .map((r) => {
      const balance = Number(r.amount);
      const min = r.min_payment != null && Number(r.min_payment) > 0 ? Number(r.min_payment) : cents(balance * DEFAULT_MIN_SHARE);
      return { id: r.id, name: r.name, balance, rate: Number(r.annual_rate ?? 0), minPayment: min };
    });
}

export function orderDebts(debts: Debt[], strategy: Strategy): Debt[] {
  const list = [...debts];
  if (strategy === "avalanche") list.sort((a, b) => b.rate - a.rate || a.balance - b.balance);
  else list.sort((a, b) => a.balance - b.balance || b.rate - a.rate);
  return list;
}

// Runs the plan month by month. With `rollover` false a cleared debt's payment is not passed on (the "minimums only" case).
function simulate(debts: Debt[], extra: number, strategy: Strategy, rollover: boolean): Plan {
  const items = orderDebts(debts, strategy).map((d) => ({ ...d, left: d.balance, interest: 0, done: null as number | null }));
  const budget = items.reduce((s, d) => s + d.minPayment, 0) + Math.max(0, extra);
  let totalPaid = 0;
  let month = 0;
  while (items.some((d) => d.left > 0.005) && month < MAX_MONTHS) {
    month++;
    for (const d of items) {
      if (d.left <= 0) continue;
      const i = cents((d.left * d.rate) / 100 / 12);
      d.left = cents(d.left + i);
      d.interest = cents(d.interest + i);
    }
    let pool = rollover ? budget : items.reduce((s, d) => s + (d.left > 0 ? d.minPayment : 0), 0) + Math.max(0, extra);
    for (const d of items) {
      if (d.left <= 0) continue;
      const pay = Math.min(d.minPayment, d.left, pool);
      d.left = cents(d.left - pay);
      pool = cents(pool - pay);
      totalPaid = cents(totalPaid + pay);
    }
    for (const d of items) {
      if (d.left <= 0 || pool <= 0) continue;
      const pay = Math.min(d.left, pool);
      d.left = cents(d.left - pay);
      pool = cents(pool - pay);
      totalPaid = cents(totalPaid + pay);
    }
    for (const d of items) if (d.left <= 0.005 && d.done === null) d.done = month;
  }
  const paidOff = items.every((d) => d.done !== null);
  return {
    strategy,
    months: month,
    paidOff,
    totalInterest: cents(items.reduce((s, d) => s + d.interest, 0)),
    totalPaid,
    debts: items.map((d) => ({ id: d.id, name: d.name, paidOffMonth: d.done, interest: d.interest })),
    order: items.filter((d) => d.done !== null).sort((a, b) => (a.done as number) - (b.done as number)).map((d) => d.name),
  };
}

export function minimumsOnly(debts: Debt[]): Plan {
  return { ...simulate(debts, 0, "avalanche", false), strategy: "minimums" };
}

export function plan(debts: Debt[], extra: number, strategy: Strategy): Plan {
  return simulate(debts, extra, strategy, true);
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monthsLabel(m: number): string {
  const y = Math.floor(m / 12);
  const r = m % 12;
  const parts = [];
  if (y) parts.push(`${y} ${y === 1 ? "year" : "years"}`);
  if (r || !y) parts.push(`${r} ${r === 1 ? "month" : "months"}`);
  return parts.join(" ");
}

// A minimum that does not even cover the monthly interest never clears the debt.
export const coversInterest = (d: Debt) => d.minPayment > (d.balance * d.rate) / 100 / 12;
