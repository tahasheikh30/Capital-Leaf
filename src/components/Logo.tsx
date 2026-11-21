import { Leaf } from "lucide-react";

// The CoinLeaf mark: the same leaf and wordmark as the landing page.
export default function Logo({ tone = "light", className = "" }: { tone?: "light" | "dark"; className?: string }) {
  return (
    <span className={`logo logo-${tone} ${className}`}>
      <span className="logo-mark" aria-hidden="true">
        <Leaf size={20} />
      </span>
      <span className="logo-word">coinleaf.</span>
    </span>
  );
}
