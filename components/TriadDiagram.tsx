/**
 * The triad, drawn from the source material's own geometry.
 *
 * The original renders these as glowing violet→gold gradients on a soft blue field.
 * That rendering cannot come across into a Palantir-derived theme — gradients and glow
 * are exactly what this design language removes. So what is borrowed is the GEOMETRY,
 * which is the part that was carrying the meaning anyway:
 *
 *   Mare        many verticals running upward, sharing one root, with a double-headed
 *               axis cutting ACROSS them. Time goes up; Mare goes sideways.
 *   Vongola     one vertical, generation to generation. I世 → X世 becomes v1 → v3.
 *               Its branch points are drawn as dots, because a fork point IS a snapshot —
 *               forking is how worlds come to exist, so it belongs to Mare, not beside it.
 *   Arcobaleno  the intersection — one world crossed by one moment, marked with a point.
 *
 * Everything is hairline stroke at the theme's own weights, with the axis colour from
 * the qualitative palette. Nothing here is decorative: every line is a claim.
 */

const INK = "currentColor";

function Head({ id, color }: { id: string; color: string }) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="8"
      refY="5"
      markerWidth="5"
      markerHeight="5"
      orient="auto-start-reverse"
    >
      <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
    </marker>
  );
}

/* ── MARE — parallel worlds, one root, one crossing axis ─────────────────── */
export function MareFigure() {
  const xs = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];
  const pair = (a: number, b: number, y: number) =>
    `M ${a} ${y} V ${y + 14} H ${b} V ${y}`;

  return (
    <svg viewBox="0 0 360 224" className="w-full text-fg-4" fill="none" aria-hidden>
      <defs>
        <Head id="mare-up" color="#767676" />
        <Head id="mare-ax" color="#00a396" />
      </defs>

      {/* worlds, running upward */}
      {xs.map((x) => (
        <line
          key={x}
          x1={x}
          y1={170}
          x2={x}
          y2={26}
          stroke={INK}
          strokeWidth="1"
          markerEnd="url(#mare-up)"
        />
      ))}

      {/* shared ancestry: every world descends from one root */}
      <g stroke={INK} strokeWidth="1">
        <path d={pair(22.5, 67.5, 170)} />
        <path d={pair(112.5, 157.5, 170)} />
        <path d={pair(202.5, 247.5, 170)} />
        <path d={pair(292.5, 337.5, 170)} />
        <path d={pair(45, 135, 184)} />
        <path d={pair(225, 315, 184)} />
        <path d={pair(90, 270, 198)} />
        <line x1="180" y1="212" x2="180" y2="222" />
      </g>

      {/*
        The fork motif, absorbed. Each dot is a branch point — and a branch point IS a
        snapshot (`world.fork_point` references one). Drawing it here rather than as its
        own panel says the true thing: forking is how worlds come to exist, so it belongs
        to Mare. It is not a separate axis.
      */}
      <g className="fill-current text-fg">
        <circle cx="45" cy="184" r="2.5" />
        <circle cx="135" cy="184" r="2.5" />
        <circle cx="225" cy="184" r="2.5" />
        <circle cx="315" cy="184" r="2.5" />
        <circle cx="90" cy="198" r="2.5" />
        <circle cx="270" cy="198" r="2.5" />
        <circle cx="180" cy="212" r="3" />
      </g>

      {/* Mare: the axis that crosses them */}
      <line
        x1="10"
        y1="96"
        x2="350"
        y2="96"
        stroke="#00a396"
        strokeWidth="1.75"
        markerStart="url(#mare-ax)"
        markerEnd="url(#mare-ax)"
      />
    </svg>
  );
}

/* ── VONGOLA — one world, generation to generation ───────────────────────── */
export function VongolaFigure() {
  const gens = [
    { y: 170, label: "v1" },
    { y: 112, label: "v2" },
    { y: 54, label: "v3" },
  ];
  return (
    <svg viewBox="0 0 360 224" className="w-full text-fg-4" fill="none" aria-hidden>
      <defs>
        <Head id="vg-up" color="#d1980b" />
      </defs>

      <line
        x1="180"
        y1="196"
        x2="180"
        y2="30"
        stroke="#d1980b"
        strokeWidth="1.75"
        markerEnd="url(#vg-up)"
      />

      <text x="216" y="116" className="fill-current font-mono text-[10px] text-fg-4">
        memory carries across
      </text>
      <text x="216" y="130" className="fill-current font-mono text-[10px] text-fg-4">
        every generation
      </text>

      {gens.map((g) => (
        <g key={g.label}>
          <line x1="164" y1={g.y} x2="196" y2={g.y} stroke={INK} strokeWidth="1" />
          <text
            x="152"
            y={g.y + 4}
            textAnchor="end"
            className="fill-current font-mono text-[11px] text-fg-3"
          >
            {g.label}
          </text>

        </g>
      ))}
    </svg>
  );
}

/* ── ARCOBALENO — the intersection of one world and one moment ───────────── */
export function ArcobalenoFigure() {
  return (
    <svg viewBox="0 0 360 224" className="w-full text-fg-4" fill="none" aria-hidden>
      <defs>
        <Head id="ab-up" color="#767676" />
      </defs>

      {[120, 180, 240].map((x) => (
        <line
          key={x}
          x1={x}
          y1={200}
          x2={x}
          y2={30}
          stroke={INK}
          strokeWidth="1"
          markerEnd="url(#ab-up)"
        />
      ))}

      {/* the moment: a horizontal cut across every world */}
      <line
        x1="40"
        y1="118"
        x2="320"
        y2="118"
        stroke={INK}
        strokeWidth="1"
        strokeDasharray="3 4"
      />

      {/* the point that exists at exactly one (world, moment) */}
      <circle cx="180" cy="118" r="6" fill="#634dbf" />
      <circle cx="180" cy="118" r="12" stroke="#634dbf" strokeWidth="1" opacity="0.4" />

      <text x="254" y="114" className="fill-current font-mono text-[10px] text-fg-3">
        (world, seq)
      </text>
    </svg>
  );
}
