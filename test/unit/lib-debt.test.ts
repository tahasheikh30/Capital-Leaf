import { describe, expect, it } from "vitest";
import { addMonths, coversInterest, minimumsOnly, MAX_MONTHS, monthsLabel, orderDebts, plan, toDebts, type Debt } from "@/lib/debt";

const d = (over: Partial<Debt> = {}): Debt => ({ id: "a", name: "Card", balance: 1000, rate: 0, minPayment: 100, ...over });

describe("toDebts", () => {
  it("keeps only liabilities that still owe money", () => {
    const rows = [
      { id: "1", kind: "liability", name: "Loan", amount: 5000, annual_rate: 12, min_payment: 300 },
      { id: "2", kind: "cash", name: "Bank", amount: 9000 },
      { id: "3", kind: "liability", name: "Paid", amount: 0 },
    ];
    expect(toDebts(rows)).toEqual([{ id: "1", name: "Loan", balance: 5000, rate: 12, minPayment: 300 }]);
  });
  it("reads numbers that arrive as strings", () => {
    expect(toDebts([{ id: "1", kind: "liability", name: "L", amount: "2000.50", annual_rate: "10", min_payment: "50" }])[0]).toMatchObject({ balance: 2000.5, rate: 10, minPayment: 50 });
  });
  it("assumes 3 percent of the balance when no minimum is saved, and 0 percent interest when no rate", () => {
    expect(toDebts([{ id: "1", kind: "liability", name: "L", amount: 10000, annual_rate: null, min_payment: null }])[0]).toMatchObject({ rate: 0, minPayment: 300 });
    expect(toDebts([{ id: "1", kind: "liability", name: "L", amount: 10000, min_payment: 0 }])[0].minPayment).toBe(300);
  });
});

describe("orderDebts", () => {
  const list = [d({ id: "a", name: "Big", balance: 9000, rate: 5 }), d({ id: "b", name: "Small", balance: 500, rate: 2 }), d({ id: "c", name: "Pricey", balance: 3000, rate: 25 })];
  it("avalanche goes by highest rate", () => expect(orderDebts(list, "avalanche").map((x) => x.name)).toEqual(["Pricey", "Big", "Small"]));
  it("snowball goes by smallest balance", () => expect(orderDebts(list, "snowball").map((x) => x.name)).toEqual(["Small", "Pricey", "Big"]));
  it("breaks ties on the other measure", () => {
    expect(orderDebts([d({ name: "x", rate: 5, balance: 900 }), d({ name: "y", rate: 5, balance: 100 })], "avalanche").map((x) => x.name)).toEqual(["y", "x"]);
    expect(orderDebts([d({ name: "x", rate: 5, balance: 100 }), d({ name: "y", rate: 9, balance: 100 })], "snowball").map((x) => x.name)).toEqual(["y", "x"]);
  });
  it("does not change the input", () => {
    const copy = [...list];
    orderDebts(list, "avalanche");
    expect(list).toEqual(copy);
  });
});

describe("plan", () => {
  it("clears an interest free debt in balance over payment months", () => {
    const p = plan([d({ balance: 1000, minPayment: 100 })], 0, "avalanche");
    expect(p).toMatchObject({ months: 10, paidOff: true, totalInterest: 0, totalPaid: 1000 });
    expect(p.debts[0].paidOffMonth).toBe(10);
  });
  it("charges monthly interest", () => {
    // 1200 at 12% a year is 1% a month: first month adds 12.
    const p = plan([d({ balance: 1200, rate: 12, minPayment: 1212 })], 0, "avalanche");
    expect(p.months).toBe(1);
    expect(p.totalInterest).toBe(12);
    expect(p.totalPaid).toBe(1212);
  });
  it("extra money shortens the plan and saves interest", () => {
    const debts = [d({ balance: 10000, rate: 24, minPayment: 400 })];
    const slow = plan(debts, 0, "avalanche");
    const fast = plan(debts, 500, "avalanche");
    expect(fast.months).toBeLessThan(slow.months);
    expect(fast.totalInterest).toBeLessThan(slow.totalInterest);
  });
  it("ignores a negative extra amount", () => {
    const debts = [d()];
    expect(plan(debts, -50, "avalanche")).toEqual(plan(debts, 0, "avalanche"));
  });
  it("passes a cleared debt's payment on to the next one", () => {
    const debts = [d({ id: "a", name: "Small", balance: 200, minPayment: 100 }), d({ id: "b", name: "Large", balance: 1000, minPayment: 100 })];
    const p = plan(debts, 0, "snowball");
    expect(p.order).toEqual(["Small", "Large"]);
    // Month 1-2 pay both; then 200 a month goes to Large: 800 left after 2 months -> 4 more months.
    expect(p.months).toBe(6);
    expect(minimumsOnly(debts).months).toBe(10);
  });
  it("avalanche costs no more interest than snowball", () => {
    const debts = [d({ id: "a", name: "Cheap", balance: 500, rate: 3, minPayment: 50 }), d({ id: "b", name: "Dear", balance: 8000, rate: 28, minPayment: 250 })];
    const av = plan(debts, 300, "avalanche");
    const sn = plan(debts, 300, "snowball");
    expect(av.totalInterest).toBeLessThanOrEqual(sn.totalInterest);
    expect(sn.order[0]).toBe("Cheap");
  });
  it("never spends more than the budget in one month", () => {
    const p = plan([d({ balance: 150, minPayment: 100 })], 500, "avalanche");
    expect(p.totalPaid).toBe(150);
    expect(p.months).toBe(1);
  });
  it("stops at the cap when the payment cannot beat the interest", () => {
    const p = plan([d({ balance: 100000, rate: 36, minPayment: 100 })], 0, "avalanche");
    expect(p.paidOff).toBe(false);
    expect(p.months).toBe(MAX_MONTHS);
    expect(p.order).toEqual([]);
    expect(p.debts[0].paidOffMonth).toBeNull();
  });
  it("handles no debts", () => {
    expect(plan([], 100, "avalanche")).toMatchObject({ months: 0, paidOff: true, totalInterest: 0, totalPaid: 0, order: [] });
  });
});

describe("minimumsOnly", () => {
  it("does not roll a cleared debt's payment over", () => {
    const m = minimumsOnly([d({ id: "a", balance: 100, minPayment: 100 }), d({ id: "b", balance: 500, minPayment: 100 })]);
    expect(m.strategy).toBe("minimums");
    expect(m.months).toBe(5);
  });
  it("costs more interest than a plan with extra money", () => {
    const debts = [d({ balance: 5000, rate: 20, minPayment: 150 })];
    expect(minimumsOnly(debts).totalInterest).toBeGreaterThan(plan(debts, 200, "avalanche").totalInterest);
  });
});

describe("helpers", () => {
  it("adds months and keeps the day inside short months", () => {
    expect(addMonths("2026-01-15", 1)).toBe("2026-02-15");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-21", 14)).toBe("2028-01-21");
    expect(addMonths("2026-11-21", 0)).toBe("2026-11-21");
  });
  it("words durations", () => {
    expect(monthsLabel(0)).toBe("0 months");
    expect(monthsLabel(1)).toBe("1 month");
    expect(monthsLabel(12)).toBe("1 year");
    expect(monthsLabel(14)).toBe("1 year 2 months");
    expect(monthsLabel(36)).toBe("3 years");
  });
  it("knows when a minimum does not cover interest", () => {
    expect(coversInterest(d({ balance: 12000, rate: 12, minPayment: 100 }))).toBe(false);
    expect(coversInterest(d({ balance: 12000, rate: 12, minPayment: 121 }))).toBe(true);
  });
});
