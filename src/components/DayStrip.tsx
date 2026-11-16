// The month as a row of days: one bar per day, tall when you spent a lot.
// Days still to come are dotted, and a dashed line marks the daily amount the month can afford.
export default function DayStrip({ daysInMonth, today, spendByDay, plan }: { daysInMonth: number; today: number; spendByDay: number[]; plan: number | null }) {
  const W = 14;
  const H = 100;
  const max = Math.max(plan ?? 0, ...spendByDay, 1) * 1.15;
  const planY = plan != null ? H - (plan / max) * H : null;
  return (
    <svg className="daystrip" viewBox={`0 0 ${daysInMonth * W} ${H + 14}`} preserveAspectRatio="none" role="img" aria-label={`Spending for each day of the month so far${plan != null ? `, with ${Math.round(plan)} rupees a day as the plan` : ""}`}>
      {Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const x = i * W + 2;
        if (day > today) return <circle key={day} className="ds-future" cx={x + (W - 4) / 2} cy={H - 1} r="1.6" />;
        const v = spendByDay[i] ?? 0;
        const h = Math.max(v > 0 ? (v / max) * H : 0, v > 0 ? 3 : 0);
        const over = plan != null && v > plan;
        return (
          <g key={day} className={day === today ? "ds-today" : undefined}>
            {v === 0 ? <circle className="ds-none" cx={x + (W - 4) / 2} cy={H - 1} r="1.6" /> : <rect className={over ? "ds-over" : "ds-ok"} x={x} y={H - h} width={W - 4} height={h} rx="3" />}
          </g>
        );
      })}
      {planY != null && <line className="ds-plan" x1="0" x2={daysInMonth * W} y1={planY} y2={planY} />}
      <line className="ds-base" x1="0" x2={daysInMonth * W} y1={H + 2} y2={H + 2} />
      {[1, 8, 15, 22, daysInMonth].map((d) => (
        <text key={d} className="ds-label" x={(d - 1) * W + (W - 4) / 2 + 2} y={H + 13} textAnchor="middle">
          {d}
        </text>
      ))}
    </svg>
  );
}
