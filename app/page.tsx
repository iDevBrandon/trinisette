import Image from "next/image";
import Link from "next/link";
import StackVsLoop from "../components/StackVsLoop";
import {
  ArcobalenoFigure,
  MareFigure,
  VongolaFigure,
} from "../components/TriadDiagram";
import { Axis, Label, Panel, Section, Triad } from "../components/ui";
import { EXAMPLES } from "../lib/tri/domains";

/**
 * The three axes, each with the calls that belong to it.
 *
 * This used to be two tables — the triad here and an "API surface" section further down,
 * both split three ways by the same axis, both listing signatures, with the first call of
 * each group appearing in both. One table with the calls attached says the same thing
 * once: an axis is not an idea with an API bolted on, it is the calls.
 */
const TRIAD = [
  {
    key: "mare" as const,
    name: "Mare",
    axis: "horizontal",
    Fig: MareFigure,
    here: "World",
    body: "An isolated, forkable branch. Forking is O(1): the child shares the parent's root, so nothing is copied. Worlds are mutually exclusive — only one of them can become actual.",
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
    key: "vongola" as const,
    name: "Vongola",
    axis: "vertical",
    Fig: VongolaFigure,
    here: "Lineage",
    body: "Inheritance through time. Two distinct clocks live here: step time within a world, and agent version across generations. Conflating them means the first schema change makes all history unreadable.",
    calls: [
      ["invoke(world, action, params)", "the only write path (I7)"],
      ["migrate(world, version)", "agent or ontology generation change"],
      ["replay(world, from, to)", "re-executes against the cassette"],
    ],
  },
  {
    key: "arcobaleno" as const,
    name: "Arcobaleno",
    axis: "point",
    Fig: ArcobalenoFigure,
    here: "Agent State",
    body: "One materialized snapshot, content-addressed, at a given (World, seq). Because the address is a hash, reproducibility is testable as equality rather than as resemblance.",
    calls: [
      ["materialize(snapshot)", "content-addressed read"],
      ["diff(a, b)", "structural, O(diff) over the DAG"],
      ["ancestors(snapshot)", "walks temporal AND lateral edges"],
    ],
  },
];

/**
 * The eight load-bearing rules, each with a way to check it on this site.
 *
 * The third column is the point. An invariant with no way to test it is a claim, and a
 * page full of claims is what every infrastructure site already is. `check` is written
 * so a visitor can falsify it in under a minute.
 */
const INVARIANTS: [string, string, string, string, string?][] = [
  [
    "I1",
    "Snapshots are immutable and content-addressed",
    "An address always resolves to the same bytes",
    "Reload the console. Genesis lands on root 8031872e5446 every time — same state, same address.",
    "/examples/airport",
  ],
  [
    "I2",
    "Worlds are append-only; advance never rewrites",
    "History cannot be retconned",
    "Post a queue report, then run the clock past 120 minutes. It goes struck-through and stays: no longer evidence, never deleted.",
    "/examples/airport",
  ],
  [
    "I3",
    "fork(W, s) cannot affect W",
    "Experiments are safe by construction",
    "Fork, change the staffing, then read primary in the compare tab. It has not moved, and the child shares the parent's root rather than a copy.",
    "/examples/airport",
  ],
  [
    "I4",
    "materialize(sid) is deterministic and idempotent",
    "A point is reproducible, not merely recorded",
    "The fetch instant arrives inside the capture payload instead of being read from a clock, so replaying a payload lands on the address it had when it was live.",
    "/examples/airport",
  ],
  [
    "I5",
    "Every object carries provenance to an origin",
    "No anonymous state; contamination is traceable",
    "Click any posted number. The trace walks every input back to the sha256 of the bytes the FAA returned.",
    "/examples/airport",
  ],
  [
    "I6",
    "Irreversible effects only from the primary world",
    "Forking the agent does not fork the outside world",
    "Fork and press the irreversible action in all four examples — a push, a binding nomination, a public warning, a berth commitment. Suppressed in every one.",
    "/examples",
  ],
  [
    "I7",
    "The ontology mutates only via a declared Action",
    "An agent cannot write what nobody typed in advance",
    "Three of the four examples have no interface code at all. The forms, the validation and the refusals are all built from the declaration.",
    "/examples/oil",
  ],
  [
    "I8",
    "Every cross-world transfer is a lateral edge",
    "Provenance audits see imports, not just history",
    "Graft a shape onto an airport with no queue feed. Every figure downstream is stamped grafted ← ATL and docked to 60%.",
    "/examples/airport?a=SJC",
  ],
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
              href="/examples/airport"
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
          <Link href="/examples/airport" className="btn btn-secondary">
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
                <Label className="text-fg-4">here</Label>
                <div className="mt-1.5 text-b4 text-fg">{t.here}</div>
              </div>
              <p className="mt-4 flex-1 text-b1 text-fg-2">{t.body}</p>
              <div className="mt-5 border-t border-line-soft pt-4">
                <Label className="text-fg-4">surface</Label>
                <div className="mt-2 space-y-2.5">
                  {t.calls.map(([sig, note]) => (
                    <div key={sig}>
                      <code className="block font-mono text-[11.5px] text-fg">
                        {sig}
                      </code>
                      <span className="mt-0.5 block text-[11px] leading-snug text-fg-3">
                        {note}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-5 max-w-[86ch] text-b1 text-fg-3">
          One primitive group per axis, and there is no generic write. Every
          step is an invocation of an action somebody declared in advance, with
          typed parameters, preconditions and a fixed effect class.
        </p>

        <Panel className="mt-5 p-6">
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

      {/* ── 04 invariants ───────────────────────────────────────────── */}
      <Section
        id="invariants"
        index="02"
        title="Invariants, and how to check them"
        lede="These are the load-bearing claims: violate one and the coordinate system stops meaning anything. The right-hand column is what makes them worth reading — every rule has something on this site that would falsify it in under a minute."
      >
        <Panel>
          <div className="hidden border-b border-line px-4 py-2.5 md:grid md:grid-cols-[44px_1.05fr_0.85fr_1.15fr] md:gap-5">
            <Label className="text-fg-4">id</Label>
            <Label className="text-fg-4">rule</Label>
            <Label className="text-fg-4">why it matters</Label>
            <Label className="text-fg-4">check it here</Label>
          </div>
          {INVARIANTS.map(([id, rule, why, check, href]) => (
            <div
              key={id}
              className="grid gap-1.5 border-b border-line-soft px-4 py-3.5 last:border-b-0 md:grid-cols-[44px_1.05fr_0.85fr_1.15fr] md:gap-5"
            >
              <span className="font-mono text-[11.5px] text-accent">{id}</span>
              <span className="text-b1 text-fg">{rule}</span>
              <span className="text-b1 text-fg-3">{why}</span>
              <span className="text-[13px] leading-relaxed text-fg-2">
                {check}{" "}
                {href && (
                  <Link
                    href={href}
                    className="whitespace-nowrap font-mono text-[11.5px] text-accent hover:text-fg"
                  >
                    open →
                  </Link>
                )}
              </span>
            </div>
          ))}
        </Panel>

        <div className="mt-px grid gap-px border border-line bg-line md:grid-cols-4">
          {[
            ["4 domains", "one runtime, zero engine changes"],
            ["8 / 30", "queue adapters pinned to a real response"],
            ["10", "upstreams declined, each with a stated reason"],
            ["4 / 4", "domains suppress their irreversible action in a fork"],
          ].map(([n, d]) => (
            <div key={n} className="bg-panel px-4 py-4">
              <div className="nums font-mono text-[17px] text-fg">{n}</div>
              <div className="mt-1.5 text-[12px] leading-snug text-fg-3">
                {d}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 max-w-[86ch] text-b1 text-fg-3">
          The site runs an in-memory port of these rules so the console works in
          a browser. The version that enforces them the way the argument
          requires — as PostgreSQL constraints and triggers, where a violation
          is rejected by the database rather than by a code path someone
          remembered to write — lives in{" "}
          <code className="font-mono text-[13px] text-fg-2">reference/</code>{" "}
          and is excluded from this build. Two of the eight were only stated
          correctly after that engine rejected the first attempt at them.
        </p>
      </Section>

      {/* ── 04 domains ─────────────────────────────────────────────────── */}
      <Section
        index="03"
        title="Four domains, one substrate"
        lede="A substrate is only as convincing as something built on it — and only as general as the second thing built on it. Airport is the one being built for real. The other three are sketches, and they are here because each is a plain ontology declaration on the same runtime with no interface code written for it."
      >
        <div className="grid gap-px border border-line bg-line md:grid-cols-2">
          {EXAMPLES.map((e) => (
            <Link
              key={e.slug}
              href={`/examples/${e.slug}`}
              className="group flex flex-col bg-panel p-6 transition-colors hover:bg-panel-2 md:p-7"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-b4 text-fg">{e.name}</span>
                <code className="font-mono text-[11.5px] text-fg-4">
                  /examples/{e.slug}
                </code>
                <span
                  className={`ml-auto font-mono text-[9.5px] uppercase tracking-[0.14em] ${
                    e.status === "live" ? "text-ok" : "text-warn"
                  }`}
                >
                  {e.status}
                </span>
              </div>

              <p className="mt-3 max-w-[46ch] grow text-b1 text-fg-2">
                {e.blurb}
              </p>

              <div className="mt-5 space-y-1.5 border-t border-line-soft pt-4 font-mono text-[10.5px] text-fg-4">
                <div className="flex gap-2">
                  <span className="shrink-0 text-fg-3">irreversible</span>
                  <span>{e.irreversible}</span>
                </div>
                <div className="flex gap-2">
                  <span className="shrink-0 text-fg-3">coverage gap</span>
                  <span>{e.gap}</span>
                </div>
                {e.feed && (
                  <div className="flex gap-2">
                    <span className="shrink-0 text-ok">feed</span>
                    <span>{e.feed}</span>
                  </div>
                )}
              </div>

              <span className="mt-4 font-mono text-[12px] text-accent transition-transform group-hover:translate-x-0.5">
                open →
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-6 max-w-[86ch] text-b1 text-fg-3">
          Read down the two rows that repeat in every card. The{" "}
          <span className="text-fg-2">irreversible action</span> is a push
          notification, a binding contract, a public warning and a berth
          commitment — four different weights, each declared per action rather
          than assumed per application. The{" "}
          <span className="text-fg-2">coverage gap</span> is a missing queue
          feed, an unpriced grade, a sparse station network and a terminal with
          no arrivals — four different holes, all answered by the same lateral
          edge. None of them needed the engine changed.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link
            href="/cases/airport"
            className="font-mono text-[12px] text-accent hover:text-fg"
          >
            Read the airport case study →
          </Link>
          <span className="text-[12px] text-fg-4">
            why the axes land where they do, and the two ways to get them wrong
          </span>
        </div>
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
