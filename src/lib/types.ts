export type IncomeSource = {
  id: string;
  name: string;
  kind: "job" | "side_hustle" | "investment" | "other";
  expected_monthly: number;
};

export type Category = { id: string; name: string; color: string };

export type Transaction = {
  id: string;
  type: "income" | "expense";
  amount: number;
  occurred_on: string;
  note: string | null;
  income_source_id: string | null;
  category_id: string | null;
  recurring_id?: string | null;
};

export type BudgetRuleItem = {
  id: string;
  name: string;
  mode: "percent" | "fixed";
  value: number;
  amount: number;
};

export type BudgetSummary = {
  base: number;
  usingExpected: boolean;
  basis?: "earned" | "expected" | "average";
  taxSetAside?: number;
  allocated: number;
  spendable: number;
  spent: number;
  remaining: number;
  rules: BudgetRuleItem[];
};

export type HoldingItem = {
  id: string;
  symbol: string;
  shares: number;
  avg_buy_price: number | null;
  manual_price: number | null;
  price: number | null;
  priceSource: "live" | "manual" | "none";
  change: number | null;
  value: number | null;
  pnl: number | null;
};

export type Portfolio = {
  holdings: HoldingItem[];
  totalValue: number;
  totalPnl: number;
  fetchedAt: string;
};

export type DashboardData = {
  month: string;
  income: number;
  spent: number;
  setAside: number;
  taxSetAside?: number;
  leftToSpend: number;
  monthly: { month: string; income: number; spent: number }[];
  byCategory: { name: string; color: string; value: number }[];
  bySource: { name: string; value: number }[];
  recent: Transaction[];
};

export const KIND_LABEL: Record<IncomeSource["kind"], string> = {
  job: "Permanent job",
  side_hustle: "Side hustle",
  investment: "Investment",
  other: "Other",
};

export type RecurringItem = {
  id: string;
  type: "income" | "expense";
  amount: number;
  note: string | null;
  category_id: string | null;
  income_source_id: string | null;
  frequency: "weekly" | "monthly" | "yearly";
  start_date: string;
  end_date: string | null;
  next_due: string;
  active: boolean;
};

export type Profile = {
  id: string;
  full_name: string | null;
  timezone: string;
  currency: string;
  freelancer_mode: boolean;
  tax_set_aside_pct: number;
  smooth_budget: boolean;
  ai_enabled: boolean;
};

export const FREQUENCY_LABEL: Record<RecurringItem["frequency"], string> = {
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
};

export type Features = { email: boolean; ai: boolean };

export type HouseholdMember = { user_id: string; role: "owner" | "member"; joined_at: string; name: string; email: string };
export type Household = {
  id: string;
  name: string;
  role: "owner" | "member";
  members: HouseholdMember[];
  invites: { id: string; email: string; expires_at: string; created_at: string }[];
  limits: { members: number };
};

export type AssetKind = "cash" | "gold" | "certificate" | "mutual_fund" | "other" | "liability";
export type Asset = {
  id: string;
  kind: AssetKind;
  name: string;
  amount: number | null;
  grams: number | null;
  karat: number | null;
  rate_per_tola: number | null;
  annual_rate: number | null;
  start_date: string | null;
  maturity_date: string | null;
  payout: "at_maturity" | "periodic" | null;
};

export type NetWorthLine = { id: string; kind: AssetKind; name: string; value: number | null; detail: Record<string, unknown> };
export type NetWorth = {
  today: string;
  total: number;
  classes: { cash: number; stocks: number; gold: number; certificates: number; mutualFunds: number; other: number; liabilities: number };
  lines: NetWorthLine[];
  portfolio: { count: number; value: number; pnl: number };
  goldRate: { perTola24k: number; perGram24k: number; source: "xaus" | "xaus+fx"; fetchedAt: string; stale: boolean } | null;
  warnings: string[];
  complete: boolean;
  history: { day: string; total: number }[];
  change30: number | null;
};

export type Dividend = {
  id: string;
  symbol: string;
  ex_date: string;
  pay_date: string | null;
  per_share: number;
  shares: number;
  tax_pct: number;
  gross: number;
  tax: number;
  net: number;
  status: "expected" | "received";
  received_on: string | null;
};
export type DividendsData = {
  items: Dividend[];
  summary: {
    receivedThisFinancialYear: number;
    receivedLast12Months: number;
    expectedNet: number;
    expectedCount: number;
    yieldOnCost: number | null;
    bySymbol: { symbol: string; net: number }[];
    financialYearStart: string;
  };
};

export type PriceAlert = {
  id: string;
  symbol: string;
  direction: "above" | "below";
  target: number;
  notify_email: boolean;
  active: boolean;
  triggered_at: string | null;
  triggered_price: number | null;
  seen_at: string | null;
};

export type FreelancerSummary = {
  enabled: boolean;
  taxPct: number;
  smoothBudget: boolean;
  months: { month: string; income: number; spent: number }[];
  stats: {
    enoughHistory: boolean;
    monthsConsidered: number;
    averageIncome: number | null;
    averageSpending: number | null;
    lowestMonth: { month: string; income: number } | null;
    highestMonth: { month: string; income: number } | null;
    swing: number | null;
    safeMonthlyBudget: number | null;
    runwayMonths: number | null;
    thisMonth: { income: number; spent: number; taxSetAside: number; vsAverage: number | null };
  };
  cash: number;
  tax: { financialYearStart: string; incomeThisYear: number; setAsideTarget: number; paid: number; stillToHold: number };
  payments: { id: string; paid_on: string; amount: number; note: string | null }[];
};

export type CategorySuggestion = { key: string; category_id: string | null; category_name: string | null; source: "history" | "ai" | "none" };
