import Link from "next/link";
import Logo from "@/components/Logo";
import AppFooter from "@/components/AppFooter";

export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="legal-shell">
      <header className="legal-top">
        <Link href="/" aria-label="CoinLeaf, home">
          <Logo tone="light" />
        </Link>
        <Link href="/login" className="btn btn-ghost">Log in</Link>
      </header>
      <main className="legal-main">
        <h1>{title}</h1>
        <p className="muted">Last updated {updated}</p>
        {children}
      </main>
      <AppFooter />
    </div>
  );
}
