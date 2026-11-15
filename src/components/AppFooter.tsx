import Link from "next/link";
import ExternalLink from "@/components/ExternalLink";
import { EXTERNAL_LINKS } from "@/lib/nav";

export default function AppFooter() {
  return (
    <footer className="app-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <div className="footer-logo">
            <span className="brand-mark">C</span> Capital Leaf
          </div>
          <p>A little more clarity, every day.</p>
        </div>

        <nav aria-label="App">
          <h3>App</h3>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/transactions">Transactions</Link>
          <Link href="/budget">Budget</Link>
          <Link href="/stocks">Stocks</Link>
        </nav>

        <nav aria-label="Resources">
          <h3>Resources</h3>
          {EXTERNAL_LINKS.map((l) => (
            <ExternalLink key={l.href} href={l.href}>
              {l.label}
            </ExternalLink>
          ))}
        </nav>

        <nav aria-label="Your data">
          <h3>Your data</h3>
          <Link href="/settings">Export your data</Link>
          <Link href="/settings">Delete your account</Link>
        </nav>
      </div>
      <div className="footer-base">
        <span>&copy; {new Date().getFullYear()} Capital Leaf</span>
        <span>Market data comes from third parties and may be delayed. Nothing here is financial advice.</span>
      </div>
    </footer>
  );
}
