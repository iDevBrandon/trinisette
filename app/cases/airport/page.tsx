import Image from "next/image";
import Link from "next/link";
import AxisConvergence from "../../../components/AxisConvergence";
import ScenarioCompare from "../../../components/ScenarioCompare";
import { Axis, Label, Panel, Section } from "../../../components/ui";
import {
  buildScenarios,
  recommend,
  type ScenarioInput,
} from "../../../lib/scenarios";

export const metadata = {
  title: "Airport queue intelligence — Trinisette case 01",
  description:
    "A design study: how the three axes land on airport queues, and where the coverage gaps make the lateral edge necessary rather than clever.",
};

function input(): ScenarioInput {
  // Fixed clock so the page renders identically on every request — the same discipline
  // the substrate requires of `cause` (§ADR-004: nothing reproducible may read a clock).
  const now = new Date();
  now.setHours(5, 10, 0, 0);

  return {
    airport: "STL",
    terminal: "Main Terminal",
    boardingAt: "08:35",
    transitMin: 34,
    walkMin: 12,
    now,
    options: [
      { minutesFromNow: 0, label: "leave now" },
      { minutesFromNow: 45, label: "+45 min" },
      { minutesFromNow: 90, label: "+1h 30m" },
      { minutesFromNow: 130, label: "+2h 10m" },
    ],
    curve: [
      // STL is `official_estimate`: it publishes a current checkpoint estimate, and no
      // forecast behind it. So the near columns are real and the forward ones cannot be.
      {
        minutesFromNow: 34,
        waitMin: 14,
        prov: {
          source: "official",
          detail: "airport-published estimate",
          ageMinutes: 4,
        },
      },
      {
        minutesFromNow: 79,
        waitMin: 23,
        prov: {
          source: "community",
          detail: "3 traveller reports",
          ageMinutes: 18,
        },
      },
      // Nothing at STL knows the shape of the morning bank, so it is borrowed from DFW.
      {
        minutesFromNow: 124,
        waitMin: 46,
        prov: {
          source: "grafted",
          detail: "pre-bank spike",
          ageMinutes: 6,
          originAirport: "DFW",
        },
      },
      {
        minutesFromNow: 164,
        waitMin: 58,
        prov: {
          source: "grafted",
          detail: "pre-bank spike",
          ageMinutes: 6,
          originAirport: "DFW",
        },
      },
    ],
  };
}

const MAPPING = [
  {
    of: "mare" as const,
    name: "Mare",
    is: "Forked worlds — a different assumption",
    why: "Heavier demand, two more lanes, a later departure. Mutually exclusive: only one can become actual, and that exclusivity is the test. Each fork is a real materialized state with its own address, not a row in a scenario table.",
  },
  {
    of: "vongola" as const,
    name: "Vongola",
    is: "The chain this world came through",
    why: "Every snapshot this world has passed through, still readable and still forkable — including the ones inherited from a parent world above the fork point. Not a lookup of yesterday's reading: that is ordinary data inside the current snapshot, and you cannot branch from it.",
  },
  {
    of: "arcobaleno" as const,
    name: "Arcobaleno",
    is: "One world at one instant",
    why: "The point where the two axes cross: a single materialized, content-addressed state. Change any input and the address changes; change nothing and it does not.",
  },
];

const DEMONSTRATES = [
  [
    "I6",
    "Suppressed effects",
    "Publishing a “leave now” push is irreversible, so it would fire only from the primary world. In the scenario worlds it is recorded as suppressed — the counterfactual is computed, the notification is never sent.",
  ],
  [
    "I5",
    "Provenance on every figure",
    "Each number carries source and age inline. A confidence score with no visible derivation asks for trust it has not earned; this one can be read straight off the column.",
  ],
  [
    "I8",
    "Graft, not merge",
    "STL publishes a current checkpoint estimate and nothing behind it — no forecast, no time-of-day shape. The near columns are its own; the two late ones borrow the shape of the bank from DFW, which has a direct feed: labelled, marked second-hand, confidence docked to 60%. Across the surveyed network 6 airports are estimate-only and another 16 have no queue feed at all — 22 of 46, permanently, so this is the ordinary case rather than a launch-week gap.",
  ],
];

export default function AirportCase() {
  const i = input();
  const scenarios = buildScenarios(i);

  return (
    <>
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
          <Label className="text-fg-4">case 01</Label>
          <Link
            href="/"
            className="ml-auto text-[12.5px] text-fg-3 transition-colors hover:text-fg"
          >
            ← Platform
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-295 px-6 pt-14 pb-12 md:px-10 md:pt-20">
        <Label className="text-fg-4">case 01 · design study</Label>
        <h1 className="hero mt-6 max-w-[20ch] text-[42px] leading-none text-fg md:text-[68px]">
          Airport queue intelligence
        </h1>
        <p className="mt-7 max-w-[54ch] text-b4 text-fg-2">
          The first application planned on Trinisette. Travellers report
          checkpoint queues; the question they actually have is not{" "}
          <em className="not-italic text-fg-3">how busy is the terminal</em> —
          it is <span className="text-fg">when should I leave</span>. That turns
          the product from a dashboard into a decision, and the candidates into
          parallel worlds.
        </p>
        <div className="mt-9 flex flex-wrap gap-px border border-line bg-line">
          {[
            ["status", "in design"],
            ["built on Trinisette", "not yet"],
            ["figures below", "modelled"],
          ].map(([k, v]) => (
            <div key={k} className="flex-1 bg-panel px-4 py-3">
              <Label className="text-fg-4">{k}</Label>
              <div className="mt-1.5 text-b1 text-fg">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link href="/examples/airport-now" className="btn btn-primary">
            Try it now →
          </Link>
          <span className="font-mono text-[12px] text-fg-3">
            /examples/airport-now
          </span>
        </div>

        <p className="mt-6 max-w-[62ch] text-b1 text-fg-3">
          The console is real — forkable worlds, declared actions, addressed
          states. The scenario figures further down are modelled inputs, and
          nothing here is shipped to travellers yet.
        </p>
      </div>

      <Section
        index="01"
        title="The mapping"
        lede="Each axis lands on something concrete in this domain. The one that is easy to get wrong is Mare."
      >
        <div className="grid gap-px border border-line bg-line lg:grid-cols-3">
          {MAPPING.map((m) => (
            <div key={m.name} className="bg-panel p-6">
              <div className="flex items-center gap-2.5">
                <Axis of={m.of} size={18} />
                <span className="font-mono text-[12px] tracking-[0.14em] text-fg-2">
                  {m.name.toUpperCase()}
                </span>
              </div>
              <div className="mt-4 text-b4 text-fg">{m.is}</div>
              <p className="mt-3 text-b1 text-fg-3">{m.why}</p>
            </div>
          ))}
        </div>

        <Panel className="mt-px border-t-0 p-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Label className="text-warn">correction</Label>
            <span className="text-b2 text-fg">
              Adjacent airports are not Mare.
            </span>
          </div>
          <p className="mt-3 max-w-[80ch] text-b1 text-fg-2">
            Mare is{" "}
            <span className="text-fg">
              this airport under a condition that did not happen
            </span>{" "}
            — a different departure time, a different assumed demand. Those are
            mutually exclusive, which is the test: only one can become actual.
            <br />
            <br />A neighbouring airport fails that test. STL and DFW are two
            objects in the <span className="text-fg">same</span> world and both
            are real right now; if merely having several rows in a table
            counted, every database would be Mare. Another airport is the{" "}
            <span className="text-fg">source of grafted experience</span> — the
            lateral edge, not the horizontal axis — and that is what fixes cold
            start: a structural pattern (&ldquo;the queue spikes ~90 minutes
            before the first international bank&rdquo;) transfers; a live
            reading (&ldquo;DFW is 45 minutes right now&rdquo;) must not.
            <br />
            <br />
            One more edge that is easy to miss: a{" "}
            <em className="not-italic text-fg">
              later time is not automatically another world
            </em>
            . 08:00 is Mare only if it is a departure you could still choose. If
            it is merely your forecast of what this world will look like at
            08:00, that is Vongola extrapolated forward, and treating it as a
            sibling world double-counts the same timeline.
            <br />
            <br />
            And the mirror of it on the vertical axis:{" "}
            <em className="not-italic text-fg">
              a past reading is not automatically Vongola
            </em>
            . Yesterday&rsquo;s curve, sitting in a table inside the current
            snapshot, is data — it has no coordinate and you cannot fork from
            it. Vongola is the chain of states this world actually passed
            through. The test is the same one in both directions: if you cannot
            address it and branch from it, it is not an axis.
          </p>
        </Panel>
      </Section>

      <Section
        index="02"
        title="Where one estimate comes from"
        lede="Each axis contributes exactly one addressable snapshot, and they converge on a single declared Action. The addresses are the part a normal dashboard cannot show."
      >
        <AxisConvergence />
      </Section>

      <Section
        index="03"
        title="Use it"
        lede="The argument only counts if you can operate it. The console lives on its own route so it is a tool rather than a figure in an essay — this page explains the shape, that page is the shape."
      >
        <Link
          href="/examples/airport-now"
          className="group block border border-line bg-panel transition-colors hover:border-fg-4"
        >
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4 px-6 py-7">
            <div>
              <Label className="text-fg-4">run a world</Label>
              <div className="mt-2 font-mono text-[22px] tracking-widest text-fg">
                /examples/airport-now
              </div>
            </div>
            <p className="max-w-[46ch] text-b1 text-fg-2">
              Pick a departure airport, walk the clock into the bank, fork, and
              try to publish an alert. The runtime refuses it outside primary
              and tells you why — that refusal is the product, not the object
              list.
            </p>
            <span className="ml-auto font-mono text-[13px] text-accent transition-transform group-hover:translate-x-0.5">
              Open the console →
            </span>
          </div>
        </Link>
        <div className="mt-6 grid gap-px border border-line bg-line md:grid-cols-3">
          {[
            [
              "1",
              "Move the world",
              "Advance the clock into the departure bank, or open a lane. The posted wait recomputes and the primary value shows struck through.",
            ],
            [
              "2",
              "Fix the coverage gap",
              "Pick ORD, SFO, SEA or SJC — real airports with no queue feed. Graft a bank shape from a covered peer and watch every figure downstream get stamped second-hand at 60%.",
            ],
            [
              "3",
              "Try to publish",
              "PublishAlert is irreversible. Fork, then press it: the runtime suppresses it — state updates, nothing is emitted.",
            ],
          ].map(([n, t, d]) => (
            <div key={n} className="bg-panel p-5">
              <span className="font-mono text-[11px] text-accent">{n}</span>
              <div className="mt-2 text-b2 text-fg">{t}</div>
              <p className="mt-2 text-b1 text-fg-3">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-[80ch] text-b1 text-fg-3">
          Over there, the parameter forms, the validation messages and the
          suppression are all consequences of the declarations in{" "}
          <code className="font-mono text-[13px] text-fg-2">
            lib/tri/airport.ts
          </code>
          . Change an action&rsquo;s{" "}
          <code className="font-mono text-[13px] text-fg-2">effect</code> to{" "}
          <code className="font-mono text-[13px] text-fg-2">irreversible</code>{" "}
          and it starts being refused outside primary, with no change to any
          component.
        </p>
      </Section>

      <Section
        index="04"
        title="Mare, rendered"
        lede="Four candidate departures for an 08:35 boarding. Read across a row to compare worlds; read down a column to see one world end to end."
      >
        <ScenarioCompare
          airport={i.airport}
          terminal={i.terminal}
          boardingAt={i.boardingAt}
          scenarios={scenarios}
          recommendedId={recommend(scenarios)}
        />
        <p className="mt-6 max-w-[80ch] text-b1 text-fg-3">
          The recommendation is the <span className="text-fg-2">latest</span>{" "}
          departure still comfortable, not the earliest safe one — advising
          someone to leave 45 minutes before they need to is a cost, not a
          courtesy.
        </p>
      </Section>

      <Section
        index="05"
        title="What the substrate is doing underneath"
        lede="If the framework were decoration, this page would look the same without it. These three behaviours are what it would buy once the application is built."
      >
        <Panel>
          {DEMONSTRATES.map(([id, title, body]) => (
            <div
              key={id}
              className="grid gap-2 border-b border-line-soft px-5 py-5 last:border-b-0 md:grid-cols-[56px_200px_1fr] md:gap-6"
            >
              <span className="font-mono text-[11.5px] text-accent">{id}</span>
              <span className="text-b1 text-fg">{title}</span>
              <span className="max-w-[72ch] text-b1 text-fg-2">{body}</span>
            </div>
          ))}
        </Panel>
        <p className="mt-6 max-w-[80ch] text-b1 text-fg-3">
          Stated honestly: the effect boundary is thinner here than in a pricing
          system. The genuinely irreversible act — the traveller leaving home —
          happens outside the system. This advises; it does not act.
        </p>
      </Section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-295 items-center gap-6 px-6 py-8 md:px-10">
          <Link
            href="/"
            className="font-mono text-[12px] text-fg-3 transition-colors hover:text-fg"
          >
            ← Back to the platform
          </Link>
        </div>
      </footer>
    </>
  );
}
