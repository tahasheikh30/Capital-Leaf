"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clearApiCache } from "@/lib/api";

const ITEMS = [
  { href: "/reports", label: "Reports", hint: "This month against last month, as a PDF too" },
  { href: "/goals", label: "Goals", hint: "Save toward something and track progress" },
  { href: "/debts", label: "Debt payoff", hint: "Plan how to clear loans and cards" },
  { href: "/zakat", label: "Zakat", hint: "Work out the zakat on your wealth" },
  { href: "/stocks", label: "Stocks", hint: "Holdings, dividends and price alerts" },
  { href: "/freelancer", label: "Tax and income", hint: "Irregular income and tax set aside" },
  { href: "/household", label: "Household", hint: "Share a budget with family" },
  { href: "/shared", label: "Shared expenses", hint: "Split bills and see who owes whom" },
  { href: "/ask", label: "Ask your money", hint: "Questions about your spending" },
  { href: "/income", label: "Income sources", hint: "Job, side hustle and more" },
  { href: "/categories", label: "Categories", hint: "Names and colours for spending" },
  { href: "/recurring", label: "Recurring", hint: "Bills and income that repeat" },
  { href: "/notifications", label: "Notifications", hint: "Messages and price alerts reached" },
  { href: "/settings", label: "Settings", hint: "Account, notifications, display and data" },
];

export default function MorePage() {
  const router = useRouter();

  async function signOut() {
    clearApiCache();
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <div className="page-head">
        <h1>More</h1>
      </div>
      <div className="card more-list">
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} className="more-item">
            <strong>{i.label}</strong>
            <span className="muted fs-sm">{i.hint}</span>
          </Link>
        ))}
      </div>
      <button className="btn btn-ghost btn-block mt-14" onClick={signOut}>
        Log out
      </button>
    </>
  );
}
