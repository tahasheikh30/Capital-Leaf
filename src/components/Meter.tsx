// A thin horizontal bar. Drawn as SVG so no inline styles are needed (the security policy forbids them).
export default function Meter({ value, tone = "good", label }: { value: number; tone?: "good" | "warn" | "bad"; label: string }) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <svg className={`meter meter-${tone}`} viewBox="0 0 100 3" preserveAspectRatio="none" role="img" aria-label={`${label}: ${Math.round(pct)} percent`}>
      <rect className="meter-track" width="100" height="3" rx="1.5" />
      <rect className="meter-fill" width={pct} height="3" rx="1.5" />
    </svg>
  );
}
