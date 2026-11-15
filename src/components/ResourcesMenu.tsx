"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import ExternalLink from "@/components/ExternalLink";
import { EXTERNAL_LINKS } from "@/lib/nav";

// A button that opens a small list of outside links. Closes on Escape, on a click elsewhere,
// and when the page changes.
export default function ResourcesMenu({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`res-menu ${className}`} ref={box}>
      <button type="button" className="res-trigger" aria-expanded={open} aria-controls="res-list" onClick={() => setOpen((o) => !o)}>
        Resources <ChevronDown size={16} className={`res-chevron ${open ? "open" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <ul className="res-pop" id="res-list">
          {EXTERNAL_LINKS.map((l) => (
            <li key={l.href}>
              <ExternalLink href={l.href} className="res-item">
                <span className="res-label">{l.label}</span>
                <span className="res-note">{l.note}</span>
              </ExternalLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
