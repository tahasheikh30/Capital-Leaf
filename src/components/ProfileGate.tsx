"use client";

import { Fragment, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { CURRENCY_EVENT, getDefaultCurrency, setDefaultCurrency } from "@/lib/currency";
import type { Profile } from "@/lib/types";

// Loads the profile once for the whole app. It sets the currency every amount is shown in and sends
// brand new accounts to the first-run setup. A profile without the flag (an older server) counts as set up.
export default function ProfileGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [currency, setCurrency] = useState(getDefaultCurrency());

  useEffect(() => {
    let live = true;
    api<Profile>("/profile")
      .then((p) => {
        if (!live) return;
        setDefaultCurrency(p.currency);
        setCurrency(getDefaultCurrency());
        if (p.onboarded_at === null && pathname !== "/welcome") router.replace("/welcome");
      })
      .catch(() => {});
    const onChange = (e: Event) => setCurrency((e as CustomEvent<string>).detail);
    window.addEventListener(CURRENCY_EVENT, onChange);
    return () => {
      live = false;
      window.removeEventListener(CURRENCY_EVENT, onChange);
    };
  }, [pathname, router]);

  // A new key redraws the pages once when the currency differs from the default.
  return <Fragment key={currency}>{children}</Fragment>;
}
