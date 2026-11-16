"use client";

import { useState } from "react";
import AlertsPanel from "@/components/stocks/AlertsPanel";
import DividendsPanel from "@/components/stocks/DividendsPanel";
import HoldingsPanel from "@/components/stocks/HoldingsPanel";
import PersonalOnly from "@/components/PersonalOnly";
import Tabs from "@/components/Tabs";

type Tab = "holdings" | "dividends" | "alerts";

export default function StocksPage() {
  const [tab, setTab] = useState<Tab>("holdings");
  return (
    <PersonalOnly>
      <div className="page-head">
        <h1>Stocks</h1>
      </div>
      <Tabs
        label="Stocks sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "holdings", label: "Holdings" },
          { id: "dividends", label: "Dividends" },
          { id: "alerts", label: "Price alerts" },
        ]}
      />
      {tab === "holdings" && <HoldingsPanel />}
      {tab === "dividends" && <DividendsPanel />}
      {tab === "alerts" && <AlertsPanel />}
    </PersonalOnly>
  );
}
