"use client";

/**
 * The coordinate bar — the frame, not a section.
 *
 * An earlier version of this gave each axis a tall explainer card, which made the triad
 * visible and made the console unreadable: three paragraphs of theory before you reach
 * anything you can act on, and the whole tool pushed off the fold. The axes belong in
 * the chrome. Mare and Arcobaleno sit on this bar; Vongola runs along the bottom of the
 * screen as the lineage strip. Everything between them is the airport.
 *
 *   🌊 Mare        which world        left of the bar — worlds side by side, fork here
 *   🌈 Arcobaleno  where that lands   right of the bar — the address of what you see
 *   🐚 Vongola     how far along      the strip at the foot of the console
 *
 * Definitions are one line each and the long form is a `title` tooltip, so the argument
 * is reachable without being in the way.
 */
import { useState } from "react";
import { fmtClock } from "../../lib/tri/airport";
import { short } from "../../lib/tri/hash";
import { fmtUtc } from "../../lib/tri/time";
import type { Snapshot, Store } from "../../lib/tri/runtime";
import { Axis } from "../ui";

const MARE_WHY =
  "Mare — the horizontal axis. Alternatives that exclude each other: only one can become actual. That is the test, and it is why a second airport is not Mare but a second assumption is.";
const ARCO_WHY =
  "Arcobaleno — the point. One world × one moment = one materialised state, addressed by its contents. Change anything and the address changes; change nothing and it does not.";

export interface CoordinateProps {
  store: Store;
  world: string;
  view: Snapshot;
  head: Snapshot;
  at: number;
  localMin: number;
  tzLabel: string;
  clockSource: string;
  airport: string;
  onWorld: (w: string) => void;
  onFork: () => void;
}

export default function Coordinate({
  store, world, view, head, at, localMin, tzLabel, clockSource, airport, onWorld, onFork,
}: CoordinateProps) {
  const [copied, setCopied] = useState(false);
  const worlds = Object.values(store.worlds);
  const captured = clockSource.startsWith("capture");

  const copy = () => {
    if (typeof window === "undefined") return;
    navigator.clipboard?.writeText(window.location.href).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1600); },
      () => {},
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-4 py-2.5">
      {/* 🌊 Mare */}
      <div className="flex items-center gap-2" title={MARE_WHY}>
        <Axis of="mare" size={14} />
        <span className="font-mono text-[10px] tracking-[0.16em] text-fg">MARE</span>
        <span className="font-mono text-[10px] text-fg-4">which world</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {worlds.map((x) => (
          <button
            key={x.id}
            onClick={() => onWorld(x.id)}
            title={x.kind === "primary" ? "primary — reality. The only world an irreversible action fires in." : x.hypothesis}
            className={`border px-2.5 py-1 font-mono text-[11px] transition-colors ${
              x.id === world ? "border-mare bg-mare text-white" : "border-line text-fg-2 hover:border-mare hover:text-fg"
            }`}
          >
            {x.name}{x.kind === "primary" && <span className="ml-1.5 opacity-70">★</span>}
          </button>
        ))}
        <button
          onClick={onFork}
          className="border border-dashed border-line px-2.5 py-1 font-mono text-[11px] text-fg-3 transition-colors hover:border-mare hover:text-mare"
        >
          + fork
        </button>
      </div>

      {/* 🌈 Arcobaleno */}
      <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex items-center gap-2" title={ARCO_WHY}>
          <Axis of="arcobaleno" size={14} />
          <span className="font-mono text-[10px] tracking-[0.16em] text-fg">ARCOBALENO</span>
        </div>
        <span className="font-mono text-[11.5px] text-fg">
          <span className="text-arcobaleno">{airport}</span>
          <span className="text-fg-4"> / </span>{world}
          <span className="text-fg-4"> / </span><span className="nums">seq {view.seq}</span>
          {view.id !== head.id && <span className="text-warn"> pinned</span>}
          <span className="text-fg-4"> / </span>
          <span className="nums">{fmtClock(localMin)}</span>
          <span className="text-fg-4"> {tzLabel}</span>
        </span>
        <span
          className="font-mono text-[11px] text-fg-3"
          title={`${fmtUtc(at)} — the world sits at one instant; each airport reads it in its own zone. Clock source: ${clockSource}.`}
        >
          root <span className="text-arcobaleno">{short(view.root, 12)}</span>
          <span className={`ml-2 ${captured ? "text-ok" : "text-fg-4"}`}>
            {clockSource === "genesis" ? "genesis clock" : captured ? "live clock" : "advanced"}
          </span>
        </span>
        <button
          onClick={copy}
          className="border border-line px-2 py-0.5 font-mono text-[10.5px] text-fg-3 transition-colors hover:border-arcobaleno hover:text-arcobaleno"
        >
          {copied ? "copied ✓" : "copy link"}
        </button>
      </div>
    </div>
  );
}
