"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clearApiCache } from "@/lib/api";
import ResourcesMenu from "@/components/ResourcesMenu";
import SpaceSwitcher from "@/components/SpaceSwitcher";
import Bell from "@/components/Bell";
import Logo from "@/components/Logo";
import { Bell as BellIcon, ChartNoAxesCombined, Home, Target, Landmark, LayoutList, LogOut, PieChart, Repeat, Settings, Sparkles, Tags, Users, Wallet, Receipt } from "lucide-react";

// The full navigation, grouped by what you are doing rather than listed alphabetically.
const GROUPS = [
  {
    title: "Day to day",
    links: [
      { href: "/dashboard", label: "Dashboard", Icon: Home },
      { href: "/transactions", label: "Transactions", Icon: LayoutList },
      { href: "/recurring", label: "Recurring", Icon: Repeat },
      { href: "/budget", label: "Budget", Icon: PieChart },
    ],
  },
  {
    title: "Wealth",
    links: [
      { href: "/net-worth", label: "Net worth", Icon: Landmark },
      { href: "/goals", label: "Goals", Icon: Target },
      { href: "/stocks", label: "Stocks", Icon: ChartNoAxesCombined },
      { href: "/freelancer", label: "Tax and income", Icon: Receipt },
    ],
  },
  {
    title: "Set up",
    links: [
      { href: "/income", label: "Income sources", Icon: Wallet },
      { href: "/categories", label: "Categories", Icon: Tags },
      { href: "/household", label: "Household", Icon: Users },
      { href: "/ask", label: "Ask your money", Icon: Sparkles },
      { href: "/notifications", label: "Notifications", Icon: BellIcon },
      { href: "/settings", label: "Settings", Icon: Settings },
    ],
  },
];

// The four screens used most on a phone, plus a More tab for the rest.
const TABS = [
  { href: "/dashboard", label: "Home", icon: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/transactions", label: "Activity", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/budget", label: "Budget", icon: "M12 3a9 9 0 1 0 9 9h-9z M15 3.5A9 9 0 0 1 20.5 9H15z" },
  { href: "/net-worth", label: "Wealth", icon: "M12 2v20M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 3 5 3 5 1.1 5 3-2.2 3-5 3-5-1.1-5-3" },
  { href: "/more", label: "More", icon: "M5 12h.01M12 12h.01M19 12h.01" },
];

const MORE_PAGES = ["/more", "/goals", "/income", "/categories", "/recurring", "/settings", "/stocks", "/freelancer", "/household", "/ask", "/notifications"];

export default function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    clearApiCache();
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <aside className="sidebar">
        <Link href="/dashboard" className="brand" aria-label="Capital Leaf, dashboard">
          <Logo tone="dark" />
        </Link>
        <SpaceSwitcher className="on-dark" />
        <nav className="side-nav" aria-label="Main">
          {GROUPS.map((g) => (
            <div key={g.title} className="side-group">
              <div className="side-title">{g.title}</div>
              {g.links.map(({ href, label, Icon }) => (
                <Link key={href} href={href} className={`nav-link ${pathname.startsWith(href) ? "active" : ""}`} aria-current={pathname.startsWith(href) ? "page" : undefined}>
                  <Icon size={18} aria-hidden="true" />
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="email-text">{email}</div>
          <button className="signout" onClick={signOut}>
            <LogOut size={16} aria-hidden="true" /> Log out
          </button>
        </div>
      </aside>

      <header className="topbar">
        <Link href="/dashboard" className="brand" aria-label="Capital Leaf, dashboard">
          <Logo tone="dark" />
        </Link>
        <div className="topbar-right">
          <ResourcesMenu className="res-on-dark" />
          <Bell className="on-dark" />
        </div>
      </header>
      <div className="space-bar">
        <SpaceSwitcher className="on-dark" />
      </div>

      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => {
          const active = t.href === "/more" ? MORE_PAGES.some((p) => pathname.startsWith(p)) : pathname.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className={`tab ${active ? "active" : ""}`}>
              <svg viewBox="0 0 24 24" className="tab-icon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={t.icon} />
              </svg>
              <span>{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
