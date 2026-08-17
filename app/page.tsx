import Image from "next/image";
import Link from "next/link";
import StackVsLoop from "../components/StackVsLoop";
import {
  ArcobalenoFigure,
  MareFigure,
  VongolaFigure,
} from "../components/TriadDiagram";
import { Axis, Label, Panel, Row, Section, Triad } from "../components/ui";

const TRIAD = [
  {
    key: "mare" as const,
    name: "Mare",
    axis: "horizontal",
    Fig: MareFigure,
    knowledge: "Cross-World Knowledge",
    here: "World",
    body: "An isolated, forkable branch. Forking is O(1): the child shares the parent's root, so nothing is copied. Worlds are mutually exclusive — only one of them can become actual.",
    api: "fork(at, hypothesis) → World",
  },
  {
    key: "vongola" as const,
    name: "Vongola",
    axis: "vertical",
    Fig: VongolaFigure,
    knowledge: "Experience across time",
    here: "Lineage",
    body: "Inheritance through time. Two distinct clocks live here: step time within a world, and agent version across generations. Conflating them means the first schema change makes all history unreadable.",
    api: "invoke(world, action, params) → Snapshot",
  },
  {
    key: "arcobaleno" as const,
    name: "Arcobaleno",
    axis: "point",
    Fig: ArcobalenoFigure,
    knowledge: "Point-in-Time State",
    here: "Agent State",
    body: "One materialized snapshot, content-addressed, at a given (World, seq). Because the address is a hash, reproducibility is testable as equality rather than as resemblance.",
    api: "materialize(snapshot) → State",
  },
];

const INVARIANTS = [
  [
    "I1",
    "Snapshots are immutable and content-addressed",
    "An address always resolves to the same bytes",
  ],
  [
    "I2",
    "Worlds are append-only; advance never rewrites",
    "History cannot be retconned",
  ],
  ["I3", "fork(W, s) cannot affect W", "Experiments are safe by construction"],
  [
    "I4",
    "materialize(sid) is deterministic and idempotent",
    "A point is reproducible, not merely recorded",
  ],
  [
    "I5",
    "Every object carries provenance to an origin",
    "No anonymous state; contamination is traceable",
  ],
  [
    "I6",
    "Irreversible effects only from the primary world",
    "Forking the agent does not fork the outside world",
  ],
  [
    "I7",
    "The ontology mutates only via a declared Action",
    "An agent cannot write what nobody typed in advance",
  ],
  [
    "I8",
    "Every cross-world transfer is a lateral edge",
    "Provenance audits see imports, not just history",
  ],
];

const API = [
  {
    group: "Mare",
    of: "mare" as const,
    calls: [
      ["fork(at, hypothesis)", "O(1) — child shares the parent root"],
      [
        "graft(source, selector, mode)",
        "typed transfer, observed | assimilated",
      ],
      ["promote(world → primary)", "replays actions; not a state merge"],
    ],
  },
  {
    group: "Vongola",
    of: "vongola" as const,
    calls: [
      ["invoke(world, action, params)", "the only write path (I7)"],
      ["migrate(world, version)", "agent or ontology generation change"],
      ["replay(world, from, to)", "re-executes against the cassette"],
    ],
  },
  {
    group: "Arcobaleno",
    of: "arcobaleno" as const,
    calls: [
      ["materialize(snapshot)", "content-addressed read"],
      ["diff(a, b)", "structural, O(diff) over the DAG"],
      ["ancestors(snapshot)", "walks temporal AND lateral edges"],
    ],
  },
];

export default function Home() {
  return (
    <>
      {/* ── nav ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-295 items-center gap-8 px-6 py-3.5 md:px-10">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt=""
              width={20}
              height={20}
              priority
              className="opacity-90"
            />
            <span className="font-mono text-[12.5px] tracking-[0.16em] text-fg">
              TRINISETTE
            </span>
          </Link>
          <nav className="ml-auto flex items-center gap-6">
            <a
              href="#primitives"
              className="text-[12.5px] text-fg-3 transition-colors hover:text-fg"
            >
              Primitives
            </a>
            <a
              href="#invariants"
              className="text-[12.5px] text-fg-3 transition-colors hover:text-fg"
            >
              Invariants
            </a>
            <Link
              href="/cases/airport"
              className="text-[12.5px] text-fg-3 transition-colors hover:text-fg"
            >
              Case
            </Link>
            <Link
              href="/examples/airport-now"
              className="text-[12.5px] text-accent transition-colors hover:text-fg"
            >
              Try it
            </Link>
          </nav>
        </div>
      </header>

      {/* ── hero ────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-295 px-6 pt-8 pb-14 md:px-10 md:pt-12 md:pb-20">
        <Label className="text-fg-4">state &amp; execution substrate</Label>
        <h1 className="hero mt-6 max-w-[19ch] text-[46px] leading-none text-fg md:text-hero">
          Infrastructure for agents that must explore{" "}
          <span className="text-fg-3">more than one</span> world.
        </h1>
        <p className="mt-8 max-w-[54ch] text-b4 text-fg-2">
          Trinisette is a branching state substrate that lets AI agents execute,
          reproduce, and transfer experience across parallel worlds and time.
          Fork a world, act inside it, and replay it later to the byte.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link href="/cases/airport" className="btn btn-primary">
            See a worked case →
          </Link>
          <Link href="/examples/airport-now" className="btn btn-secondary">
            Try it live
          </Link>
        </div>

        {/*
          The triad sits inside the hero block with no heading of its own. A section
          title here would name what the table already says, and the section padding
          would push it below the fold — the idea should be the first thing under the
          sentence that promises it.
        */}
        <div
          id="primitives"
          className="mt-14 grid gap-px border border-line bg-line lg:grid-cols-3"
        >
          {TRIAD.map((t) => (
            <div key={t.key} className="flex flex-col bg-panel p-6">
              <div className="flex items-center gap-2.5">
                <Axis of={t.key} size={18} />
                <span className="font-mono text-[13px] tracking-[0.14em] text-fg">
                  {t.name.toUpperCase()}
                </span>
                <Label className="ml-auto text-fg-4">{t.axis}</Label>
              </div>
              <div className="mt-5 border-y border-line-soft py-4">
                <t.Fig />
              </div>
              <div className="mt-4 border-t border-line-soft pt-4">
                <Label className="text-fg-4">{t.knowledge}</Label>
                <div className="mt-1.5 text-b4 text-fg">{t.here}</div>
              </div>
              <p className="mt-4 flex-1 text-b1 text-fg-2">{t.body}</p>
              <code className="mt-5 block border border-line-soft bg-panel-2 px-3 py-2 font-mono text-[11px] text-fg-3">
                {t.api}
              </code>
            </div>
          ))}
        </div>

        <Panel className="mt-px border-t-0 p-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Label className="text-mare">note</Label>
            <span className="text-b2 text-fg">
              Experience is not a fourth primitive.
            </span>
          </div>
          <p className="mt-3 max-w-[78ch] text-b1 text-fg-2">
            It has no axis of its own — it is inheritance pointed sideways.
            Vongola is the vertical edge, from a snapshot to its predecessor in
            the same world; Experience is the horizontal edge, from a snapshot
            to one in another world. A grafted snapshot therefore has two
            parents, which makes the snapshot graph a{" "}
            <span className="text-fg">DAG, not a tree</span>, and means lineage
            traversal must follow both edges or every import goes unaudited.
          </p>
        </Panel>
      </div>

      {/* ── shape ───────────────────────────────────────────────────── */}
      <Section
        index="01"
        title="Foundry is an ontology with a what-if feature attached"
        lede="Trinisette is a branching substrate with an ontology on top. The priority is inverted, and the reason it matters is that agents produce branches at machine rate — content-addressed copy-on-write, O(1) fork, a snapshot per step, and recorded non-determinism are all choices sized for that."
      >
        <StackVsLoop />
      </Section>

      {/* ── 03 api ──────────────────────────────────────────────────── */}
      <Section
        index="02"
        title="Surface"
        lede="One primitive group per axis. There is no generic write: every step is an invocation of an action somebody declared in advance, with typed parameters, preconditions, and a fixed effect class."
      >
        <div className="grid gap-px border border-line bg-line lg:grid-cols-3">
          {API.map((g) => (
            <div key={g.group} className="bg-panel">
              <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
                <Axis of={g.of} size={16} />
                <span className="font-mono text-[11px] tracking-[0.16em] text-fg-2">
                  {g.group.toUpperCase()}
                </span>
              </div>
              <div className="p-1">
                {g.calls.map(([sig, note]) => (
                  <div key={sig} className="px-3 py-2.5">
                    <code className="block font-mono text-[11.5px] text-fg">
                      {sig}
                    </code>
                    <span className="mt-1 block text-[11px] text-fg-3">
                      {note}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 04 invariants ───────────────────────────────────────────── */}
      <Section
        id="invariants"
        index="03"
        title="Invariants"
        lede="These are the load-bearing claims. Violate one and the coordinate system stops meaning anything, so each is enforced by a constraint or a trigger in the database rather than by convention."
      >
        <Panel>
          <div className="hidden border-b border-line px-4 py-2.5 md:grid md:grid-cols-[48px_1fr_1fr] md:gap-6">
            <Label className="text-fg-4">id</Label>
            <Label className="text-fg-4">rule</Label>
            <Label className="text-fg-4">why it matters</Label>
          </div>
          {INVARIANTS.map(([id, rule, why]) => (
            <div
              key={id}
              className="grid gap-1 border-b border-line-soft px-4 py-3 last:border-b-0 md:grid-cols-[48px_1fr_1fr] md:gap-6"
            >
              <span className="font-mono text-[11.5px] text-accent">{id}</span>
              <span className="text-b1 text-fg">{rule}</span>
              <span className="text-b1 text-fg-3">{why}</span>
            </div>
          ))}
        </Panel>
      </Section>

      {/* ── 05 verification ─────────────────────────────────────────── */}
      <Section
        index="04"
        title="What has actually been run"
        lede="Phases 0–3 are implemented against PostgreSQL. The milestone was never that fork() returns — it is that forking, diverging, and replaying leaves the original bit-identical, which is checkable as hash equality because snapshots are content-addressed."
      >
        <div className="grid gap-px border border-line bg-line lg:grid-cols-2">
          <div className="bg-panel">
            <div className="border-b border-line px-4 py-3">
              <Label>acceptance · §9.1</Label>
            </div>
            <pre className="overflow-x-auto px-4 py-4 font-mono text-[11.5px] leading-[1.85] text-fg-2">
              {`s_a  = invoke(A, SetFare, price=504)
B    = fork(A, at=s_a)
s_b  = invoke(B, SetFare, price=420)

`}
              <span className="text-fg-4">{`// divergence is real`}</span>
              {`
assert s_b.id !== s_a.id

s_a2 = replay(A, to=s_a)
`}
              <span className="text-ok">{`assert s_a2.id === s_a.id   ✔`}</span>
            </pre>
          </div>
          <div className="bg-panel">
            <div className="border-b border-line px-4 py-3">
              <Label>measured</Label>
            </div>
            <div>
              <Row k="Engine tests" v="21 / 21" tone="ok" />
              <Row
                k="Schema invariant tests"
                v="24"
                note="17 rejections"
                tone="ok"
              />
              <Row k="Worlds in the worked grid" v="16" note="1 primary" />
              <Row
                k="Irreversible actions suppressed"
                v="15"
                note="by trigger"
                tone="accent"
              />
              <Row k="Object identity nodes" v="46" />
              <Row k="Stored payloads" v="21" note="54% shared" tone="accent" />
            </div>
          </div>
        </div>
        <p className="mt-6 max-w-[78ch] text-b1 text-fg-3">
          That last pair is a correction the implementation forced. Folding
          provenance into a single node hash made cross-world sharing impossible
          by construction — the grid stored 46 objects for 21 distinct facts.
          Identity is now split from payload, so provenance stays hash-sensitive
          while storage does not.
        </p>
      </Section>

      {/* ── 06 case ─────────────────────────────────────────────────── */}
      <Section
        index="05"
        title="Worked case"
        lede="A substrate is only as convincing as something built on it. The first application planned on Trinisette is airport queue intelligence — crowd-reported checkpoint waits, reframed so the traveller’s real question becomes a set of parallel worlds."
      >
        <Link href="/cases/airport" className="group block">
          <Panel className="transition-colors group-hover:border-fg-4">
            <div className="grid md:grid-cols-[1.15fr_1fr]">
              <div className="p-6 md:p-8">
                <Label className="text-fg-4">case 01 · design study</Label>
                <h3 className="mt-3 text-h2 text-fg">
                  Airport queue intelligence
                </h3>
                <p className="mt-4 max-w-[48ch] text-b2 text-fg-2">
                  The traveller&apos;s real question is not{" "}
                  <em className="not-italic text-fg-3">
                    how busy is the terminal
                  </em>{" "}
                  — it is <span className="text-fg">when should I leave</span>.
                  Each candidate departure time is a world, and only one of them
                  will happen. In design; nothing shipped yet.
                </p>
                <span className="mt-6 flex flex-wrap items-center gap-4">
                  <span className="font-mono text-[12px] text-accent">
                    Open the case →
                  </span>
                  <span className="font-mono text-[11px] text-fg-4">
                    live at /examples/airport-now
                  </span>
                </span>
              </div>
              <div className="border-t border-line md:border-t-0 md:border-l">
                {[
                  [
                    "mare",
                    "Mare",
                    "Departure-time scenarios — mutually exclusive",
                  ],
                  ["vongola", "Vongola", "This terminal's own queue history"],
                  [
                    "arcobaleno",
                    "Arcobaleno",
                    "The checkpoint state right now",
                  ],
                ].map(([k, n, d]) => (
                  <div
                    key={n}
                    className="flex items-start gap-3 border-b border-line-soft px-6 py-4 last:border-b-0"
                  >
                    <span className="mt-px">
                      <Axis of={k as "mare"} size={17} />
                    </span>
                    <div>
                      <div className="font-mono text-[11px] tracking-[0.14em] text-fg-2">
                        {n.toUpperCase()}
                      </div>
                      <div className="mt-1 text-[12.5px] text-fg-3">{d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </Link>
      </Section>

      {/* ── footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-295 flex-wrap items-center gap-x-8 gap-y-3 px-6 py-8 md:px-10">
          <Triad />
          <Label className="text-fg-4">rev. 3 · phases 0–3 implemented</Label>
          <span className="ml-auto font-mono text-[10.5px] text-fg-4">
            Mare divides worlds · Vongola carries experience through time ·
            Arcobaleno is the state at that point
          </span>
        </div>
      </footer>
    </>
  );
}
