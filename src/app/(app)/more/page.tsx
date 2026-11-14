"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ITEMS = [
  { href: "/income", label: "Income sources", hint: "Job, side hustle and more" },
  { href: "/categories", label: "Categories", hint: "Names and colours for spending" },
  { href: "/recurring", label: "Recurring", hint: "Bills and income that repeat" },
  { href: "/settings", label: "Settings", hint: "Profile, export, delete account" },
];

export default function MorePage() {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <div className="page-head">
        <h1>More</h1>
      </div>
      <div className="card more-list">
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} className="more-item">
            <strong>{i.label}</strong>
            <span className="muted fs-sm">{i.hint}</span>
          </Link>
        ))}
      </div>
      <button className="btn btn-ghost btn-block mt-14" onClick={signOut}>
        Log out
      </button>
    </>
  );
}
