"use client";
import Link from "next/link";
import Logo from "@/components/Logo";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="state-page">
      <Logo />
      <p className="state-code">Error</p>
      <h1>Something went wrong</h1>
      <p className="muted">Your data is safe. Try again, or head back to the dashboard.</p>
      <div className="state-actions">
        <button className="btn btn-accent" onClick={reset}>Try again</button>
        <Link className="btn" href="/dashboard">Go to dashboard</Link>
      </div>
    </main>
  );
}
