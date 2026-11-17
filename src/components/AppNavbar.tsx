"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Bell from "@/components/Bell";
import ExternalLink from "@/components/ExternalLink";
import { EXTERNAL_LINKS, LINKS } from "@/lib/nav";

// Top bar for tablet and desktop: where you are on the left, useful outside sites on the right.
// On a phone the brand bar and the Resources menu take its place.
export default function AppNavbar() {
  const pathname = usePathname();
  const here = LINKS.find((l) => pathname.startsWith(l.href))?.label ?? "Capital Leaf";

  return (
    <header className="appbar">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/dashboard">Capital Leaf</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{here}</span>
      </nav>
      <div className="appbar-right">
      <nav className="appbar-links" aria-label="Useful sites">
        {EXTERNAL_LINKS.slice(0, 3).map((l) => (
          <ExternalLink key={l.href} href={l.href} className="appbar-link">
            {l.label}
          </ExternalLink>
        ))}
      </nav>
      <Bell />
      </div>
    </header>
  );
}
