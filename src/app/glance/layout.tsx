import type { Metadata } from "next";

// A tiny installable page of its own: its manifest makes "Add to Home screen" give a one-number app icon.
export const metadata: Metadata = {
  title: "Left to spend | CoinLeaf",
  manifest: "/glance.webmanifest",
  robots: { index: false, follow: false },
};

export default function GlanceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
