import Link from "next/link";
import Logo from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="state-page">
      <Logo />
      <p className="state-code">404</p>
      <h1>This page isn&apos;t here</h1>
      <p className="muted">The link may be old, or the address was typed wrong.</p>
      <Link className="btn btn-accent" href="/dashboard">Go to dashboard</Link>
    </main>
  );
}
