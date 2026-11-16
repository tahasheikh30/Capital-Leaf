"use client";

import { useSpace } from "@/lib/space";

// Stocks, net worth, tax and alerts belong to one person, so they are not shown inside a shared household.
export default function PersonalOnly({ children }: { children: React.ReactNode }) {
  const { isHousehold, setSpace } = useSpace();
  if (!isHousehold) return <>{children}</>;
  return (
    <div className="card">
      <h2>This section is personal</h2>
      <p className="muted mt-0">Investments, net worth, tax and alerts are private to you and are not shared with your household.</p>
      <button className="btn btn-primary" onClick={() => setSpace("personal")}>
        Switch to my personal space
      </button>
    </div>
  );
}
