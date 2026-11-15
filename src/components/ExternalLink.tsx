import { ExternalLink as Icon } from "lucide-react";

// A link to another website. Opens in a new tab and tells screen readers so.
export default function ExternalLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <Icon size={13} className="ext-icon" aria-hidden="true" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
