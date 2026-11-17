"use client";

import Link from "next/link";
import { ArrowUp } from "lucide-react";
import Logo from "@/components/Logo";
import ExternalLink from "@/components/ExternalLink";
import { EXTERNAL_LINKS } from "@/lib/nav";

export default function AppFooter() {
  function toTop() {
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" });
  }

  return (
    <footer className="site-footer">
      <div className="sf-inner">
        <div className="sf-grid">
          <div className="sf-brand">
            <Link href="/dashboard" aria-label="Capital Leaf, dashboard">
              <Logo tone="dark" />
            </Link>
            <p className="sf-blurb">
              A calm place for your income, spending, budgets and Pakistan Stock Exchange holdings. Made for people who want to know what is left, not just what is gone.
            </p>
            <a className="sf-social" href="https://github.com/tahasheikh30/Capital-Leaf" target="_blank" rel="noopener noreferrer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.76 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" /></svg>
              <span className="sr-only">Capital Leaf on GitHub (opens in a new tab)</span>
            </a>
          </div>

          <nav className="sf-col" aria-labelledby="sf-day">
            <h2 id="sf-day" className="sf-h">Day to day</h2>
            <ul>
              <li><Link href="/dashboard">Dashboard</Link></li>
              <li><Link href="/transactions">Transactions</Link></li>
              <li><Link href="/recurring">Recurring</Link></li>
              <li><Link href="/budget">Budget</Link></li>
            </ul>
          </nav>

          <nav className="sf-col" aria-labelledby="sf-wealth">
            <h2 id="sf-wealth" className="sf-h">Wealth</h2>
            <ul>
              <li><Link href="/net-worth">Net worth</Link></li>
              <li><Link href="/stocks">Stocks</Link></li>
              <li><Link href="/freelancer">Tax and income</Link></li>
              <li><Link href="/ask">Ask your money</Link></li>
            </ul>
          </nav>

          <nav className="sf-col" aria-labelledby="sf-res">
            <h2 id="sf-res" className="sf-h">Resources</h2>
            <ul>
              {EXTERNAL_LINKS.map((l) => (
                <li key={l.href}>
                  <ExternalLink href={l.href}>{l.label}</ExternalLink>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="sf-col" aria-labelledby="sf-legal">
            <h2 id="sf-legal" className="sf-h">Legal and data</h2>
            <ul>
              <li><Link href="/privacy">Privacy policy</Link></li>
              <li><Link href="/terms">Terms of use</Link></li>
              <li><Link href="/settings#data">Export your data</Link></li>
              <li><Link href="/settings#data">Delete your account</Link></li>
            </ul>
          </nav>
        </div>

        <div className="sf-bar">
          <p>&copy; {new Date().getFullYear()} Capital Leaf. All rights reserved.</p>
          <p className="sf-note">Market data comes from third parties and may be delayed. Nothing here is financial advice.</p>
          <button type="button" className="sf-top" onClick={toTop}>
            Back to top
            <ArrowUp size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </footer>
  );
}
