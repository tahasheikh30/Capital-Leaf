"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Meter from "@/components/Meter";
import { api, peek } from "@/lib/api";
import { money } from "@/lib/format";
import { useSpace } from "@/lib/space";
import type { Goal } from "@/lib/types";

// The three goals closest to their target. Goals are personal, so nothing shows inside a household.
export default function DashboardGoals() {
  const { isHousehold } = useSpace();
  const [goals, setGoals] = useState<Goal[]>(() => (isHousehold ? [] : peek<Goal[]>("/goals") ?? []));

  useEffect(() => {
    if (isHousehold) return;
    api<Goal[]>("/goals")
      .then(setGoals)
      .catch(() => {});
  }, [isHousehold]);

  const shown = isHousehold ? [] : goals.filter((g) => !g.done).sort((a, b) => b.percent - a.percent).slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <section className="sec">
      <div className="sec-head">
        <h2 className="sec-title">Goals</h2>
        <Link href="/goals" className="sec-link">
          All goals
        </Link>
      </div>
      <ul className="ledger goal-mini">
        {shown.map((g) => (
          <li key={g.id}>
            <span className="ledger-main">
              {g.name}
              <span className="ledger-sub">
                {money(g.saved)} of {money(g.target_amount)}
              </span>
              <Meter value={g.percent} label={g.name} />
            </span>
            <span className="ledger-amt">{Math.round(g.percent)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
