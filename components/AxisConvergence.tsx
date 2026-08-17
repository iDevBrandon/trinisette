/**
 * The three axes converging on one estimate.
 *
 * Each axis contributes one addressable snapshot. The addresses are the point: a generic
 * dashboard could show "past / now / other scenario" too; what it could not show is that
 * every input is a `(world, seq)` coordinate you can go back to, read, and fork from.
 *
 * Note what Vongola is here and what it is NOT. It is an ANCESTOR SNAPSHOT of this world
 * — a state this world actually passed through, which is still readable and can still be
 * forked from. It is not a lookup of yesterday's reading. A past observation that was
 * never a state of this chain is ordinary data sitting inside the current snapshot; it
 * has no coordinate, and you cannot branch from it. That difference is the axis.
 */
import { Axis, Label, type AxisKey } from "./ui";

interface SourceCard {
  axis: AxisKey;
  role: string;
  /** The Trinisette coordinate this figure was read from. */
  address: string;
  place: string;
  when: string;
  value: number;
  unit: string;
  prov: string;
  tone: "ok" | "warn" | "bad";
}

const TONE = { ok: "text-ok", warn: "text-warn", bad: "text-bad" } as const;

const SOURCES: SourceCard[] = [
  {
    axis: "mare",
    role: "a sibling world",
    address: "exp-1 / seq 3",
    place: "ATL North Main",
    when: "if demand runs heavy",
    value: 85,
    unit: "min",
    prov: "forked at seq 1, AssumeDemand",
    tone: "warn",
  },
  {
    axis: "vongola",
    role: "an ancestor of this world",
    address: "primary / seq 1",
    place: "ATL North Main",
    when: "before the capture landed",
    value: 73,
    unit: "min",
    prov: "a snapshot in this chain, still readable",
    tone: "bad",
  },
  {
    axis: "arcobaleno",
    role: "this world, at head",
    address: "primary / seq 2",
    place: "ATL North Main",
    when: "the captured instant",
    value: 59,
    unit: "min",
    prov: "official feed · sha e0ed4852",
    tone: "warn",
  },
];

export default function AxisConvergence() {
  return (
    <div>
      {/* ── the three inputs ─────────────────────────────────────────── */}
      <div className="grid gap-px border border-line bg-line md:grid-cols-3">
        {SOURCES.map((s) => (
          <div key={s.axis} className="bg-panel p-5">
            <div className="flex items-center gap-2.5">
              <Axis of={s.axis} size={17} />
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg-2">
                {s.axis}
              </span>
              <Label className="ml-auto text-fg-4">{s.role}</Label>
            </div>

            <div className="mt-5 flex items-baseline gap-2">
              <span className="font-mono text-[13px] tracking-[0.1em] text-fg">{s.place}</span>
              <span className="truncate text-[12px] text-fg-3">{s.when}</span>
            </div>

            <div className="mt-3 flex items-baseline gap-1.5">
              <span className={`nums font-mono text-[30px] leading-none ${TONE[s.tone]}`}>
                {s.value}
              </span>
              <span className="text-[11px] text-fg-3">{s.unit}</span>
            </div>

            <div className="mt-4 border-t border-line-soft pt-3">
              <div className="text-[11.5px] text-fg-3">{s.prov}</div>
              <code className="mt-1.5 block font-mono text-[10.5px] text-fg-4">{s.address}</code>
            </div>
          </div>
        ))}
      </div>

      {/*
        Connector. An earlier version drew three drops into a horizontal bus; combined
        with the panel borders above and below it closed into two rectangles and read as
        a table, not a flow. A single labelled hairline says the same thing and cannot
        collide with anything.
      */}
      <div className="flex flex-col items-center py-5" aria-hidden>
        <span className="h-6 w-px bg-line" />
        <span className="my-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-4">
          converge
        </span>
        <span className="h-6 w-px bg-line" />
      </div>

      {/* ── the output ───────────────────────────────────────────────── */}
      <div className="border border-line bg-panel">
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <Label className="text-fg-4">action</Label>
          <code className="font-mono text-[12px] text-fg">EstimateWait</code>
          <span className="ml-auto font-mono text-[10.5px] text-fg-4">effect_class: pure</span>
        </div>

        <div className="flex flex-wrap items-start gap-x-10 gap-y-5 px-5 py-6">
          <div>
            <Label className="text-fg-4">expected wait</Label>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="nums font-mono text-[52px] leading-none text-fg">42</span>
              <span className="text-b1 text-fg-3">min</span>
            </div>
          </div>

          <div className="max-w-[46ch]">
            <p className="text-b1 text-fg-2">
              Three inputs, three addresses, one declared Action. Because every input is a{" "}
              <span className="text-fg">(world, seq)</span> coordinate and the model call goes
              through the cassette, this number can be replayed months later and will come back
              byte-identical — or the system says loudly that it cannot.
            </p>
            <p className="mt-3 text-[11.5px] text-fg-3">
              That is the difference between a prediction and an auditable prediction. Ask
              &ldquo;why 42?&rdquo; and the answer is three snapshots you can open, not a
              model shrug.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
