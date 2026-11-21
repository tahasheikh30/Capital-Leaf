// A small stand-in for the Supabase auth server and the Capital Leaf API, used by the browser tests.
// It keeps its data in memory: lists can be added to, edited and deleted, and a POST to /__reset restores the sample data.
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT || 4010);
const ORIGIN = process.env.APP_ORIGIN || "http://localhost:3010";
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const iso = (d) => d.toISOString().slice(0, 10);
const day = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return iso(d); };
const user = { id: uid(1), aud: "authenticated", role: "authenticated", email: "taha@example.com", app_metadata: {}, user_metadata: { full_name: "Taha" }, created_at: "2026-09-01T00:00:00Z" };
const asset = (o) => ({ amount: null, grams: null, karat: null, rate_per_tola: null, annual_rate: null, start_date: null, maturity_date: null, payout: null, ...o });

function seed() {
  const cats = [["Groceries", "#5b8a72"], ["Transport", "#d97757"], ["Bills", "#c9a227"], ["Eating out", "#8e6bbf"], ["Health", "#4a90a4"]].map(([name, color], i) => ({ id: uid(100 + i), name, color }));
  const sources = [{ id: uid(200), name: "Salary", kind: "job", expected_monthly: 180000 }, { id: uid(201), name: "Freelance projects", kind: "side_hustle", expected_monthly: 40000 }];
  const tx = [
    ["income", 180000, 0, "Salary", null, 0], ["income", 45000, -1, "Website project", null, 1],
    ["expense", 18500, -1, "Monthly groceries", 0], ["expense", 2400, -2, "Careem to office", 1], ["expense", 12800, -3, "Electricity bill", 2],
    ["expense", 3200, -4, "Lunch with team", 3], ["expense", 6500, -5, "Pharmacy", 4],
  ].map(([type, amount, d, note, ci, si], i) => ({ id: uid(300 + i), type, amount, occurred_on: day(d), note, category_id: type === "expense" ? cats[ci].id : null, income_source_id: type === "income" ? sources[si].id : null, recurring_id: null }));
  return {
    categories: cats, "income-sources": sources, transactions: tx,
    assets: [
      asset({ id: uid(400), kind: "cash", name: "Meezan savings account", amount: 270000 }),
      asset({ id: uid(401), kind: "mutual_fund", name: "Meezan Islamic Fund", amount: 130000 }),
      asset({ id: uid(402), kind: "gold", name: "Wedding gold", grams: 35, karat: 22 }),
      asset({ id: uid(404), kind: "liability", name: "Car loan", amount: 350000, annual_rate: 15, min_payment: 12000 }),
    ],
    goals: [
      { id: uid(400), name: "Meezan savings account", target_amount: 400000, target_date: null, saved: 270000, percent: 67.5, remaining: 130000, reached: false, overdue: false, done: false, days_left: null, monthly_needed: null },
    ],
    recurring: [{ id: uid(600), type: "expense", amount: 12800, note: "Electricity bill", category_id: cats[2].id, income_source_id: null, frequency: "monthly", start_date: "2026-01-01", end_date: null, next_due: day(5), active: true }],
    holdings: [{ id: uid(500), symbol: "MEBL", shares: 800, avg_buy_price: 212.5, manual_price: null }],
    alerts: [], dividends: [], "budget-rules": [{ id: uid(900), name: "Savings", mode: "percent", value: 20 }],
    "savings-transfers": [], payments: [],
    profile: { id: user.id, full_name: "Taha", timezone: "Asia/Karachi", currency: "PKR", freelancer_mode: true, tax_set_aside_pct: 10, smooth_budget: false, ai_enabled: true },
    household: null, shared: { expenses: [], settlements: [] }, log: [],
  };
}
let db = seed();
let n = 10000;
const newId = () => uid(n++);

const income = () => db.transactions.filter((t) => t.type === "income").reduce((a, t) => a + Number(t.amount), 0);
const spent = () => db.transactions.filter((t) => t.type === "expense").reduce((a, t) => a + Number(t.amount), 0);
const month = () => day(0).slice(0, 7);
const dashboard = () => {
  const byCat = db.categories.map((c) => ({ name: c.name, color: c.color, value: db.transactions.filter((t) => t.category_id === c.id).reduce((a, t) => a + Number(t.amount), 0) })).filter((c) => c.value > 0);
  return { month: month(), income: income(), spent: spent(), setAside: 45000, taxSetAside: 0, movedToSavings: 0, leftToSpend: income() - spent() - 45000,
    monthly: [-5, -4, -3, -2, -1, 0].map((o, i) => ({ month: iso(new Date(new Date().getFullYear(), new Date().getMonth() + o, 1)).slice(0, 7), income: 190000 + i * 5000, spent: 80000 + (i % 3) * 7000 })),
    byCategory: byCat, bySource: db["income-sources"].map((s) => ({ name: s.name, value: db.transactions.filter((t) => t.income_source_id === s.id).reduce((a, t) => a + Number(t.amount), 0) })).filter((s) => s.value > 0),
    recent: [...db.transactions].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)).slice(0, 6) };
};
const SARA = uid(778);
const sharedView = () => {
  const net = { [user.id]: 0, [SARA]: 0 };
  const split = (id, c) => (net[id] = (net[id] ?? 0) + c);
  for (const e of db.shared.expenses) { split(e.paid_by, Number(e.amount)); for (const p of e.participants) split(p, -Number(e.amount) / e.participants.length); }
  for (const t of db.shared.settlements) { split(t.from_user, Number(t.amount)); split(t.to_user, -Number(t.amount)); }
  const debtors = Object.entries(net).filter(([, v]) => v < -0.005), creditors = Object.entries(net).filter(([, v]) => v > 0.005);
  const suggestions = debtors.length && creditors.length ? [{ from: debtors[0][0], to: creditors[0][0], amount: Math.round(Math.min(-debtors[0][1], creditors[0][1]) * 100) / 100 }] : [];
  return { me: user.id, members: db.household.members.map((m) => ({ user_id: m.user_id, role: m.role, name: m.name })), expenses: db.shared.expenses, settlements: db.shared.settlements,
    balances: Object.entries(net).map(([user_id, balance]) => ({ user_id, name: user_id === SARA ? "Sara" : "Taha", balance })), suggestions };
};
const netWorth = () => {
  const val = (a) => (a.kind === "gold" ? 238000 : Number(a.amount ?? 0));
  const sum = (k) => db.assets.filter((a) => a.kind === k).reduce((x, a) => x + val(a), 0);
  const classes = { cash: sum("cash"), stocks: 312000, gold: sum("gold"), certificates: sum("certificate"), mutualFunds: sum("mutual_fund"), other: sum("other"), liabilities: sum("liability") };
  const total = classes.cash + classes.stocks + classes.gold + classes.certificates + classes.mutualFunds + classes.other - classes.liabilities;
  return { today: day(0), total, classes, lines: db.assets.map((a) => ({ id: a.id, kind: a.kind, name: a.name, value: val(a), detail: {} })), portfolio: { count: 1, value: 312000, pnl: 41800 },
    goldRate: { perTola24k: 41200, perGram24k: 3532, source: "mock", fetchedAt: new Date().toISOString(), stale: false }, warnings: [], complete: true,
    history: Array.from({ length: 10 }, (_, i) => ({ day: day(i - 9), total: total - (9 - i) * 3000 })), change30: 4.8 };
};
const portfolio = () => {
  const rows = db.holdings.map((h) => { const price = 268.4; return { ...h, price, priceSource: "live", change: 1.2, value: h.shares * price, pnl: h.avg_buy_price != null ? h.shares * (price - h.avg_buy_price) : null }; });
  return { holdings: rows, totalValue: rows.reduce((a, r) => a + r.value, 0), totalPnl: rows.reduce((a, r) => a + (r.pnl ?? 0), 0), fetchedAt: new Date().toISOString() };
};
const divSummary = () => ({ receivedThisFinancialYear: db.dividends.filter((d) => d.status === "received").reduce((a, d) => a + d.net, 0), receivedLast12Months: 0, expectedCount: db.dividends.filter((d) => d.status === "expected").length, expectedNet: db.dividends.filter((d) => d.status === "expected").reduce((a, d) => a + d.net, 0), yieldOnCost: db.dividends.length ? 4.1 : null, bySymbol: [], financialYearStart: "2026-07-01" });
const freelancer = () => ({ enabled: !!db.profile.freelancer_mode, taxPct: db.profile.tax_set_aside_pct, smoothBudget: false,
  months: dashboard().monthly, stats: { enoughHistory: true, monthsConsidered: 6, averageIncome: 205000, averageSpending: 91000, lowestMonth: { month: "2026-06", income: 190000 }, highestMonth: { month: "2026-11", income: 225000 }, swing: 0.35, safeMonthlyBudget: 98000, runwayMonths: 5.2, thisMonth: { income: income(), spent: spent(), taxSetAside: 0, vsAverage: 1000 } },
  cash: 270000, tax: { financialYearStart: "2026-07-01", incomeThisYear: 1020000, setAsideTarget: 102000, paid: db.payments.reduce((a, p) => a + Number(p.amount), 0), stillToHold: 62000 }, payments: db.payments });
const budgetSummary = () => ({ base: income(), usingExpected: false, basis: "earned", taxSetAside: 0, allocated: 45000, spendable: income() - 45000, spent: spent(), remaining: income() - 45000 - spent(), movedToSavings: 0,
  rules: db["budget-rules"].map((r) => ({ ...r, amount: r.mode === "percent" ? (income() * r.value) / 100 : r.value })) });

// Plain lists: GET returns them, POST adds, PATCH changes, DELETE removes.
const LISTS = { "/api/transactions": "transactions", "/api/categories": "categories", "/api/income-sources": "income-sources", "/api/assets": "assets", "/api/recurring": "recurring", "/api/alerts": "alerts", "/api/budget-rules": "budget-rules" };

const cors = { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Headers": "*, authorization, content-type, x-space, apikey, x-client-info, x-supabase-api-version", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS", "Access-Control-Allow-Credentials": "true" };

let hit0;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const path = url.pathname;
  const send = (code, body) => { res.writeHead(code, { "Content-Type": "application/json", ...cors }); res.end(JSON.stringify(body)); };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  if (path === "/auth/v1/user") return send(200, user);
  if (path === "/auth/v1/logout") { res.writeHead(204, cors); return res.end(); }
  if (path.startsWith("/auth/v1/")) return send(200, {});
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    const m = req.method;
    if (path === "/__reset") { db = seed(); return send(200, { ok: true }); }
    if (path === "/__log") return send(200, db.log);
    if (m !== "GET") db.log.push({ method: m, path, body });
    if (path === "/health") return send(200, { ok: true });

    // Special reads
    if (m === "GET") {
      if (path === "/api/dashboard") return send(200, dashboard());
      if (path === "/api/net-worth") return send(200, netWorth());
      if (path === "/api/holdings") return send(200, portfolio());
      if (path === "/api/dividends") return send(200, { items: db.dividends, summary: divSummary() });
      if (path === "/api/freelancer/summary") return send(200, freelancer());
      if (path === "/api/budget-rules/summary") return send(200, budgetSummary());
      if (path === "/api/goals") return send(200, db.goals);
      if (path === "/api/savings-transfers") return send(200, db["savings-transfers"]);
      if (path === "/api/profile") return send(200, { preferences: {}, ...db.profile });
      if (path === "/api/features") return send(200, { email: false, ai: true });
      if (path === "/api/ai/status") return send(200, { available: true, enabled: !!db.profile.ai_enabled });
      if (path === "/api/households/me") return send(200, { household: db.household });
      if (path === "/api/shared") return send(200, sharedView());
      if (path === "/api/alerts/check") return send(200, { fired: [], unseen: [] });
      if (path in LISTS) {
        let rows = db[LISTS[path]];
        const q = url.searchParams.get("month");
        if (q && path === "/api/transactions") rows = rows.filter((t) => t.occurred_on.startsWith(q));
        return send(200, rows);
      }
    }

    // Writes
    if (path === "/api/households" && m === "POST") {
      db.household = { id: uid(777), name: body.name, role: "owner", invites: [], limits: { members: 6 }, members: [{ user_id: user.id, role: "owner", name: "Taha", email: user.email }, { user_id: SARA, role: "member", name: "Sara", email: "sara@example.com" }] };
      return send(201, { id: uid(777) });
    }
    if (path === "/api/shared/expenses" && m === "POST") { const e = { id: newId(), created_by: user.id, ...body }; db.shared.expenses.unshift(e); return send(201, e); }
    if (path === "/api/shared/settlements" && m === "POST") { const t = { id: newId(), created_by: user.id, occurred_on: day(0), ...body }; db.shared.settlements.unshift(t); return send(201, t); }
    hit0 = path.match(/^\/api\/shared\/(expenses|settlements)\/([^/]+)$/);
    if (hit0 && m === "DELETE") { db.shared[hit0[1]] = db.shared[hit0[1]].filter((r) => r.id !== hit0[2]); return send(200, { ok: true }); }
    if (path === "/api/ai/ask" && m === "POST") return send(200, { answer: `You asked: ${body.question}. This is a sample answer.` });
    if (path === "/api/ai/categorize" && m === "POST") return send(200, { suggestions: [] });
    if (path === "/api/profile" && m === "PATCH") { Object.assign(db.profile, Object.fromEntries(Object.entries(body).filter(([k]) => k !== "preferences"))); return send(200, { preferences: {}, ...db.profile }); }
    if (path === "/api/goals" && m === "POST") {
      const id = body.asset_id ?? newId();
      if (!body.asset_id) db.assets.push(asset({ id, kind: body.new_item.kind, name: body.new_item.name, amount: 0 }));
      const name = body.asset_id ? db.assets.find((a) => a.id === id)?.name ?? "Goal" : body.new_item.name;
      const g = { id, name, target_amount: body.target_amount, target_date: body.target_date ?? null, saved: 0, percent: 0, remaining: body.target_amount, reached: false, overdue: false, done: false, days_left: null, monthly_needed: null };
      db.goals.push(g); return send(201, g);
    }
    let hit = path.match(/^\/api\/goals\/([^/]+)$/);
    if (hit) {
      const i = db.goals.findIndex((g) => g.id === hit[1]);
      if (i < 0) return send(404, { error: "Not found" });
      if (m === "DELETE") { db.goals.splice(i, 1); return send(200, { ok: true }); }
      if (m === "PATCH") { Object.assign(db.goals[i], body); return send(200, db.goals[i]); }
    }
    if (path === "/api/holdings" && m === "POST") { const h = { id: newId(), manual_price: null, ...body }; db.holdings.push(h); return send(201, h); }
    hit = path.match(/^\/api\/holdings\/([^/]+)$/);
    if (hit) { const i = db.holdings.findIndex((h) => h.id === hit[1]); if (m === "DELETE") db.holdings.splice(i, 1); else if (m === "PATCH") Object.assign(db.holdings[i], body); return send(200, { ok: true }); }
    if (path === "/api/dividends" && m === "POST") { const gross = body.per_share * body.shares; const d = { id: newId(), status: "expected", received_on: null, gross, tax: gross * body.tax_pct / 100, net: gross * (1 - body.tax_pct / 100), ...body }; db.dividends.push(d); return send(201, d); }
    hit = path.match(/^\/api\/dividends\/([^/]+)(\/receive)?$/);
    if (hit) { const i = db.dividends.findIndex((d) => d.id === hit[1]); if (hit[2]) { db.dividends[i].status = "received"; db.dividends[i].received_on = day(0); } else if (m === "DELETE") db.dividends.splice(i, 1); else if (m === "PATCH") Object.assign(db.dividends[i], body); return send(200, { ok: true }); }
    if (path === "/api/freelancer/payments" && m === "POST") { const p = { id: newId(), ...body }; db.payments.push(p); return send(201, p); }
    hit = path.match(/^\/api\/freelancer\/payments\/([^/]+)$/);
    if (hit && m === "DELETE") { db.payments = db.payments.filter((p) => p.id !== hit[1]); return send(200, { ok: true }); }
    if (path === "/api/savings-transfers" && m === "POST") { db["savings-transfers"].push({ id: newId(), transaction_id: null, asset_id: body.asset_id ?? uid(400), asset_name: "Meezan savings account", amount: body.amount, direction: body.direction ?? "in", occurred_on: day(0), created_at: new Date().toISOString() }); return send(201, { transfer_id: newId(), asset_id: body.asset_id ?? uid(400), asset_name: "Meezan savings account", asset_amount: body.amount }); }
    hit = path.match(/^\/api\/savings-transfers\/([^/]+)$/);
    if (hit && m === "DELETE") { db["savings-transfers"] = db["savings-transfers"].filter((t) => t.id !== hit[1]); return send(200, { ok: true }); }
    hit = path.match(/^\/api\/alerts\/([^/]+)\/rearm$/);
    if (hit) { const a = db.alerts.find((x) => x.id === hit[1]); if (a) { a.active = true; a.triggered_at = null; } return send(200, { ok: true }); }

    // Generic lists
    const listKey = LISTS[path] ?? LISTS[path.replace(/\/[^/]+$/, "")];
    if (listKey) {
      const rows = db[listKey];
      if (path in LISTS && m === "POST") { const row = { id: newId(), active: true, triggered_at: null, triggered_price: null, ...body }; rows.push(row); return send(201, row); }
      const id = path.split("/").pop();
      const i = rows.findIndex((r) => r.id === id);
      if (m === "DELETE") { if (i >= 0) rows.splice(i, 1); return send(200, { ok: true }); }
      if (m === "PATCH" && i >= 0) { Object.assign(rows[i], body); return send(200, rows[i]); }
    }
    if (path === "/api/account") return send(200, { ok: true });
    return send(m === "GET" ? 200 : 200, m === "GET" ? [] : { ok: true });
  });
});
server.listen(PORT, () => console.log("mock api on", PORT));
