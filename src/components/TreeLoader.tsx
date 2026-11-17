// A money tree that grows from the ground to full size, with leaves and coins, then starts over.
// Everything is drawn with SVG attributes and CSS classes (no inline styles), so it works under the strict CSP.
// Without animation (reduced motion, or the animations switch off) the full-grown tree is shown.

const TRUNK = "M60 108 C60 96 59 84 60 60";
const BRANCHES = [
  "M60 86 C52 82 44 76 36 66",
  "M60 76 C68 72 76 66 84 56",
  "M60 64 C56 56 52 48 50 38",
  "M60 62 C64 54 70 46 74 36",
];
const TWIGS = ["M47 79 C44 72 40 66 40 58", "M73 69 C76 62 80 58 80 48", "M60 60 C60 50 60 40 60 30"];

// Each cluster of leaves sits at a branch tip. Clusters appear one after another as the tree grows.
const CLUSTERS: { x: number; y: number; stage: 1 | 2 | 3 }[] = [
  { x: 36, y: 66, stage: 1 },
  { x: 84, y: 56, stage: 1 },
  { x: 40, y: 58, stage: 2 },
  { x: 80, y: 48, stage: 2 },
  { x: 50, y: 38, stage: 2 },
  { x: 74, y: 36, stage: 3 },
  { x: 60, y: 30, stage: 3 },
];
const ANGLES = [-150, -80, -20, 40, 110, 170];
const SHADES = ["a", "b", "c"] as const;

const LEAVES = CLUSTERS.flatMap((c, ci) =>
  ANGLES.map((angle, i) => ({
    x: c.x + Math.cos(((angle + ci * 17) * Math.PI) / 180) * 3,
    y: c.y + Math.sin(((angle + ci * 17) * Math.PI) / 180) * 3,
    rot: angle + ci * 17,
    stage: c.stage,
    shade: SHADES[(i + ci) % 3],
  })),
);

const COINS = [
  { x: 30, y: 52 },
  { x: 90, y: 44 },
  { x: 44, y: 27 },
  { x: 80, y: 27 },
  { x: 60, y: 44 },
];

export default function TreeLoader({ size = 120, label }: { size?: number; label?: string }) {
  return (
    <svg className="tree-loader" width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={label ?? "Loading"}>
      <g className="tree-all">
        <ellipse className="tree-ground" cx="60" cy="109" rx="30" ry="3.5" />
        <g className="tree-wood" fill="none" strokeLinecap="round">
          <path className="tree-draw t1" d={TRUNK} strokeWidth="5" pathLength="1" />
          {BRANCHES.map((d, i) => (
            <path key={d} className={`tree-draw t2 b${i}`} d={d} strokeWidth="3" pathLength="1" />
          ))}
          {TWIGS.map((d) => (
            <path key={d} className="tree-draw t3" d={d} strokeWidth="2" pathLength="1" />
          ))}
        </g>
        {LEAVES.map((l, i) => (
          <g key={i} transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${l.rot})`}>
            <path className={`tree-leaf s${l.stage} ${l.shade}`} d="M0 0 C2.5 -4 8 -4 11 0 C8 4 2.5 4 0 0Z" />
          </g>
        ))}
        {COINS.map((c, i) => (
          <g key={i} transform={`translate(${c.x} ${c.y})`}>
            <g className={`tree-coin c${i % 3}`}>
              <circle r="5.2" className="coin-face" />
              <circle r="3.4" className="coin-ring" fill="none" strokeWidth="0.8" />
              <path d="M0 -2 V2 M-1.4 -0.8 H1.2 M-1.2 0.9 H1.4" className="coin-mark" fill="none" strokeWidth="0.9" strokeLinecap="round" />
            </g>
          </g>
        ))}
      </g>
    </svg>
  );
}
