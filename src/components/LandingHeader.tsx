"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import Logo from "@/components/Logo";
import ResourcesMenu from "@/components/ResourcesMenu";

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#plan", label: "Plan ahead" },
  { href: "#privacy", label: "Your data" },
];

// A floating pill. On phones the links fold into a menu that closes on Escape, on a link tap or a tap outside.
export default function LandingHeader() {
  const [open, setOpen] = useState(false);
  const [lifted, setLifted] = useState(false);
  const box = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className={`lp-header ${lifted ? "lifted" : ""}`} ref={box}>
      <div className="lp-pill">
        <Link href="#top" className="lp-brand" aria-label="Capital Leaf, back to top">
          <Logo tone="light" />
        </Link>

        <nav className="lp-nav" aria-label="Main navigation">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>{l.label}</a>
          ))}
          <ResourcesMenu className="res-landing" />
        </nav>

        <div className="lp-actions">
          <Link href="/login" className="lp-login">Log in</Link>
          <Link href="/signup" className="lp-btn lp-btn-tomato lp-cta">Sign up free</Link>
          <button type="button" className="lp-burger" aria-expanded={open} aria-controls="lp-sheet" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((o) => !o)}>
            {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="lp-sheet" id="lp-sheet">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>
          ))}
          <Link href="/login" onClick={() => setOpen(false)}>Log in</Link>
          <Link href="/signup" className="lp-btn lp-btn-tomato" onClick={() => setOpen(false)}>Create your free account</Link>
        </div>
      )}
    </header>
  );
}
