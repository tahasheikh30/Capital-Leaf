"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/recurring", label: "Recurring" },
  { href: "/income", label: "Income sources" },
  { href: "/categories", label: "Categories" },
  { href: "/budget", label: "Budget" },
  { href: "/stocks", label: "Stocks" },
  { href: "/settings", label: "Settings" },
];

// The four screens used most on a phone, plus a More tab for the rest.
const TABS = [
  { href: "/dashboard", label: "Home", icon: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/transactions", label: "Activity", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/budget", label: "Budget", icon: "M12 3a9 9 0 1 0 9 9h-9z M15 3.5A9 9 0 0 1 20.5 9H15z" },
  { href: "/stocks", label: "Stocks", icon: "M3 17l5-6 4 3 8-9M15 5h5v5" },
  { href: "/more", label: "More", icon: "M5 12h.01M12 12h.01M19 12h.01" },
];

const MORE_PAGES = ["/more", "/income", "/categories", "/recurring", "/settings"];

export default function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">C</span> Capital Leaf
        </div>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`nav-link ${pathname.startsWith(l.href) ? "active" : ""}`}>
            {l.label}
          </Link>
        ))}
        <div className="sidebar-footer">
          <div className="email-text">{email}</div>
          <button className="btn btn-ghost btn-on-dark" onClick={signOut}>
            Log out
          </button>
        </div>
      </aside>

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">C</span> Capital Leaf
        </div>
      </header>

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
