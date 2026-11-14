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

export type Profile = { id: string; full_name: string | null; timezone: string; currency: string };

export const FREQUENCY_LABEL: Record<RecurringItem["frequency"], string> = {
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
};
