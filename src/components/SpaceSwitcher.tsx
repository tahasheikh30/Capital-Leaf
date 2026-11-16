"use client";

import { useSpace } from "@/lib/space";

// Shown only to people who belong to a household.
export default function SpaceSwitcher({ className = "" }: { className?: string }) {
  const { household, space, setSpace } = useSpace();
  if (!household) return null;
  return (
    <div className={`space-switch ${className}`} role="group" aria-label="Which records to show">
      <button type="button" className={space === "personal" ? "on" : ""} aria-pressed={space === "personal"} onClick={() => setSpace("personal")}>
        Personal
      </button>
      <button type="button" className={space === household.id ? "on" : ""} aria-pressed={space === household.id} onClick={() => setSpace(household.id)} title={household.name}>
        <span className="space-name">{household.name}</span>
      </button>
    </div>
  );
}
