"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Bell from "@/components/Bell";
import { LINKS } from "@/lib/nav";

// Top bar for tablet and desktop: where you are on the left, notifications on the right.
// On a phone the brand bar takes its place. The outside links live in the footer.
export default function AppNavbar() {
  const pathname = usePathname();
  const here = LINKS.find((l) => pathname.startsWith(l.href))?.label ?? "CoinLeaf";

  return (
    <header className="appbar">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/dashboard">CoinLeaf</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{here}</span>
      </nav>
      <div className="appbar-right">
        <Bell />
      </div>
    </header>
  );
}
