"use client";

/**
 * Compare — three relationships, three tables.
 *
 * An earlier version of this offered one comparison: world against world. That is the
 * Mare axis and it was the wrong thing to offer alone, for two reasons.
 *
 * The first is that Mare comparison is currently vacuous. Every figure is
 * `baseLoad × demand × bank × faa ÷ lanes` — independent scalars with no interaction, no
 * shared resource, no cascade. Turn one knob and the delta IS that knob. A counterfactual
 * only informs when the result is not a function of the input you turned, and this model
 * has nothing of the sort yet.
 *
 * The second is a mistake in reasoning. "Two airports are not Mare" is true — they both
 * exist right now, so they are not mutually exclusive. But that only means airport-versus-
 * airport is not the horizontal AXIS; it does not mean it is not worth looking at. Ruling
 * out the axis and ruling out the view are different claims, and conflating them cost the
 * two comparisons a person actually wants:
 *
 *   ACROSS OBJECTS  ATL against SJC, right now, one world. Not an axis — and the place the
 *                   coverage argument becomes visible rather than asserted: a live feed at
 *                   90% next to a grafted shape at 40%.
 *   ACROSS TIME     ATL now against ATL an hour ago. This IS Vongola, and until now the
 *                   axis was only ever drawn as dots on a strip. Reading two moments side
 *                   by side is what makes it an axis you can use.
 *   ACROSS WORLDS   the Mare table, kept, with its confound guard.
 *
 * Two of the three work against the model exactly as it stands.
 */
import { useState } from "react";
import { SOURCES, TIERS, type SourceTier } from "../../lib/feeds/sources";
import {
  clockOf,
  fmtClock,
  fmtOffset,
  localMinuteAt,
  tzOffsetMin,
} from "../../lib/tri/airport";
import { fmtParams, short } from "../../lib/tri/hash";
import {
  headOf,
  lineage,
  objKey,
  type OntoObject,
  type Snapshot,
  type Store,
} from "../../lib/tri/runtime";
import { Axis, Label } from "../ui";

export type CompareMode = "worlds" | "airports" | "time";

export interface CompareProps {
  store: Store;
  world: string;
  view: Snapshot;
  airport: string;
  checkpoints: { key: string; label: string }[];
  onWorld: (w: string) => void;
  onAirport: (a: string) => void;
  onRefork?: () => void;
}

const cellsOf = (s: Snapshot, t: string) =>
  Object.values(s.state.objects).filter((o) => o.typeId === t);

const postedOf = (s: Snapshot, cp: string) => {
  const o = s.state.objects[objKey("Checkpoint", cp)];
  return o ? Number(o.props.postedMin) : null;
};

/** Airport-level rollup. Checkpoints do not line up across airports, so the row is the airport. */
function rollup(s: Snapshot, iata: string) {
  const cps = cellsOf(s, "Checkpoint").filter((c) => c.props.airport === iata);
  const a = s.state.objects[objKey("Airport", iata)];
  const curve = s.state.objects[objKey("Curve", iata)];
  const faa = s.state.objects[objKey("FaaStatus", iata)];
  const worst = cps.reduce<OntoObject | null>(
    (m, c) =>
      !m || Number(c.props.postedMin) > Number(m.props.postedMin) ? c : m,
    null,
  );
  const at = clockOf(s.state);
  return {
    airport: a,
    curve,
    faa,
    worst,
    checkpoints: cps,
    localMin: localMinuteAt(s.state, iata),
    offset: tzOffsetMin(String(a?.props.tz ?? "UTC"), at),
    tier: String(a?.props.tier ?? "none") as SourceTier,
    grafted: curve?.prov.originKind === "grafted",
    confidencePct: worst ? Number(worst.props.confidencePct) : 0,
  };
}

const TIER_TEXT: Record<string, string> = {
  official: "text-ok",
  official_estimate: "text-info",
  none: "text-fg-4",
  grafted: "text-warn",
};

export default function Compare({
  store,
  world,
  view,
  airport,
  checkpoints,
  onWorld,
  onAirport,
  onRefork,
}: CompareProps) {
  const worlds = Object.values(store.worlds);
  const [mode, setMode] = useState<CompareMode>(
    worlds.length > 1 ? "worlds" : "airports",
  );

  // Default the object comparison to something that shows the coverage gap immediately.
  const [peers, setPeers] = useState<string[]>(() => {
    const other = SOURCES.find(
      (s) => s.tier === "official" && s.iata !== airport,
    )?.iata;
    const uncovered = SOURCES.find(
      (s) => s.tier === "none" && s.iata !== airport,
    )?.iata;
    return [other, uncovered].filter((x): x is string => !!x);
  });

  const shown: CompareMode =
    mode === "worlds" && worlds.length < 2 ? "airports" : mode;
  const th = "border-b border-line px-3 py-2 text-left align-top";
  const td = "border-l border-line px-3 py-2";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-mare/[0.04] px-3 py-1.5">
        <Axis of={shown === "time" ? "vongola" : "mare"} size={13} />
        <span className="font-mono text-[10px] tracking-[0.16em] text-fg">
          COMPARE
        </span>
        <div className="flex items-center gap-px">
          {(
            [
              ["worlds", `worlds ${worlds.length}`, worlds.length < 2],
              ["airports", "airports", false],
              ["time", "time", false],
            ] as const
          ).map(([k, label, disabled]) => (
            <button
              key={k}
              disabled={disabled}
              onClick={() => setMode(k)}
              title={
                k === "worlds"
                  ? "Mare — same object, different premise. Needs more than one world."
                  : k === "airports"
                    ? "Different objects in ONE world. Not an axis — and where the coverage gap becomes visible."
                    : "Vongola — one object, several moments from this world's own chain."
              }
              className={`border px-2 py-0.5 font-mono text-[10.5px] transition-colors disabled:opacity-30 ${
                shown === k
                  ? "border-fg bg-fg text-bg"
                  : "border-line text-fg-3 hover:border-fg-4 hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-[10px] text-fg-4">
          {shown === "worlds"
            ? "same object · different premise"
            : shown === "airports"
              ? "one world · one instant · different objects"
              : "one object · one world · different moments"}
        </span>
      </div>

      {shown === "worlds" && (
        <Worlds {...{ store, world, checkpoints, onWorld, onRefork, th, td }} />
      )}
      {shown === "airports" && (
        <Airports {...{ view, airport, peers, setPeers, onAirport, th, td }} />
      )}
      {shown === "time" && (
        <Time {...{ store, world, airport, checkpoints, th, td }} />
      )}
    </div>
  );
}

/* ── 🌊 across worlds ─────────────────────────────────────────────────────── */

function Worlds({
  store,
  world,
  checkpoints,
  onWorld,
  onRefork,
  th,
  td,
}: Pick<
  CompareProps,
  "store" | "world" | "checkpoints" | "onWorld" | "onRefork"
> & { th: string; td: string }) {
  const worlds = Object.values(store.worlds);
  const heads: Record<string, Snapshot> = {};
  for (const w of worlds) heads[w.id] = headOf(store, w.id);
  const primary = heads.primary;

  // Mare needs the SAME MOMENT and a different premise. Different clocks mix "what if"
  // with "what hour", and a delta across them is not a counterfactual.
  const sameInstant =
    new Set(worlds.map((w) => clockOf(heads[w.id].state))).size === 1;

  const changesIn = (id: string) =>
    id === "primary"
      ? "reality"
      : lineage(store, heads[id].id)
          .filter((s) => s.world === id && s.cause.kind === "action")
          .reverse()
          .map((s) => `${s.cause.action} ${fmtParams(s.cause.params)}`)
          .join(" · ") || "forked, nothing changed yet";

  return (
    <div>
      {!sameInstant && (
        <div className="border-b border-warn/40 bg-warn/[0.07] px-3 py-2 text-[11.5px] leading-relaxed text-fg-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-warn">
            confounded
          </span>{" "}
          These worlds sit at different clocks, so a difference between them
          mixes <span className="text-fg">what if</span> with{" "}
          <span className="text-fg">what hour</span>. Ingesting a capture moves
          primary&rsquo;s clock and a fork made earlier keeps the one it
          inherited — reality is only observed in primary.
          {onRefork && (
            <button
              onClick={onRefork}
              className="ml-2 border border-line bg-panel px-2 py-0.5 font-mono text-[10.5px] text-fg-2 hover:border-mare hover:text-mare"
            >
              re-fork from primary
            </button>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th
                className={`w-[150px] ${th} font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-fg-4`}
              >
                checkpoint
              </th>
              {worlds.map((w) => (
                <th key={w.id} className={`min-w-[130px] border-l ${th}`}>
                  <button
                    onClick={() => onWorld(w.id)}
                    className="block w-full text-left"
                  >
                    <div className="font-mono text-[11.5px] text-fg">
                      {w.name}
                      {w.kind === "primary" && (
                        <span className="ml-1 opacity-60">★</span>
                      )}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-fg-4">
                      seq {heads[w.id].seq} ·{" "}
                      {fmtClock(
                        ((clockOf(heads[w.id].state) % 1440) + 1440) % 1440,
                      )}
                    </div>
                    <div className="mt-1 max-w-[24ch] font-mono text-[9.5px] leading-snug text-fg-3">
                      {changesIn(w.id)}
                    </div>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {checkpoints.map((cp) => {
              const base = postedOf(primary, cp.key);
              return (
                <tr
                  key={cp.key}
                  className="border-b border-line-soft last:border-b-0"
                >
                  <td className="px-3 py-2">
                    <div className="text-[12px] text-fg">{cp.label}</div>
                    <div className="font-mono text-[9.5px] text-fg-4">
                      {cp.key}
                    </div>
                  </td>
                  {worlds.map((w) => {
                    const v = postedOf(heads[w.id], cp.key);
                    const d =
                      v !== null && base !== null && w.kind !== "primary"
                        ? v - base
                        : 0;
                    return (
                      <td key={w.id} className={td}>
                        {v === null ? (
                          <span className="font-mono text-[12px] text-fg-4">
                            —
                          </span>
                        ) : (
                          <span className="flex items-baseline gap-1.5">
                            <span className="nums font-mono text-[16px] text-fg">
                              {v}
                            </span>
                            <span className="text-[9.5px] text-fg-4">min</span>
                            {d !== 0 && (
                              <span
                                className={`nums font-mono text-[11px] ${!sameInstant ? "text-fg-4" : d < 0 ? "text-ok" : "text-bad"}`}
                              >
                                {d > 0 ? "+" : ""}
                                {d}
                                {!sameInstant && "*"}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line-soft px-3 py-1.5 text-[10.5px] text-fg-4">
        Each column is a materialised state with its own address. ★ is the only
        one where an irreversible action fires.
        {!sameInstant && " * marked deltas span different clocks."}
      </p>
    </div>
  );
}

/* ── across objects, one world ────────────────────────────────────────────── */

function Airports({
  view,
  airport,
  peers,
  setPeers,
  onAirport,
  th,
  td,
}: {
  view: Snapshot;
  airport: string;
  peers: string[];
  setPeers: (p: string[]) => void;
  onAirport: (a: string) => void;
  th: string;
  td: string;
}) {
  const shown = [airport, ...peers.filter((p) => p !== airport)].slice(0, 4);
  const rows = shown.map((ia) => ({ iata: ia, r: rollup(view, ia) }));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2">
        <Label className="text-fg-4">compare with</Label>
        {peers.map((pi) => (
          <button
            key={pi}
            onClick={() => setPeers(peers.filter((x) => x !== pi))}
            className="border border-line px-2 py-0.5 font-mono text-[10.5px] text-fg-2 hover:border-bad hover:text-bad"
            title="remove"
          >
            {pi} ×
          </button>
        ))}
        {peers.length < 3 && (
          <select
            value=""
            onChange={(e) =>
              e.target.value && setPeers([...peers, e.target.value])
            }
            className="border border-line bg-panel px-1.5 py-0.5 font-mono text-[10.5px] text-fg-3"
          >
            <option value="">+ add</option>
            {SOURCES.filter(
              (s) => s.iata !== airport && !peers.includes(s.iata),
            ).map((s) => (
              <option key={s.iata} value={s.iata}>
                {s.iata} — {TIERS[s.tier].label}
              </option>
            ))}
          </select>
        )}
        <span className="ml-auto font-mono text-[10px] text-fg-4">
          one instant, read across — the gap between these columns is the
          coverage argument
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th
                className={`w-[150px] ${th} font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-fg-4`}
              >
                airport
              </th>
              {rows.map(({ iata, r }) => (
                <th key={iata} className={`min-w-[140px] border-l ${th}`}>
                  <button
                    onClick={() => onAirport(iata)}
                    className="block w-full text-left"
                  >
                    <div
                      className={`font-mono text-[13px] ${iata === airport ? "text-mare" : "text-fg"}`}
                    >
                      {iata}
                    </div>
                    <div className="mt-1 max-w-[18ch] text-[10.5px] leading-snug text-fg-3">
                      {String(r.airport?.props.city ?? "")}
                    </div>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(
              [
                [
                  "local time",
                  (r: ReturnType<typeof rollup>) =>
                    `${fmtClock(r.localMin)} ${fmtOffset(r.offset)}`,
                  "One instant read through each zone. The board is never the same hour twice.",
                ],
                [
                  "worst queue",
                  (r: ReturnType<typeof rollup>) =>
                    r.worst
                      ? `${r.worst.props.postedMin} min · ${r.worst.props.label}`
                      : "—",
                  "The number a traveller would actually hit.",
                ],
                [
                  "confidence",
                  (r: ReturnType<typeof rollup>) => `${r.confidencePct}%`,
                  "How much of that number is measured versus modelled.",
                ],
                [
                  "queue source",
                  (r: ReturnType<typeof rollup>) =>
                    r.grafted
                      ? `grafted ← ${r.curve?.prov.via}`
                      : TIERS[r.tier].label,
                  "The tier from the source survey — or a borrowed shape.",
                ],
                [
                  "day shape",
                  (r: ReturnType<typeof rollup>) =>
                    r.curve ? `peak ${r.curve.props.peak}` : "none — flat",
                  "Without a curve the clock changes nothing at this airport.",
                ],
                [
                  "FAA",
                  (r: ReturnType<typeof rollup>) =>
                    r.faa
                      ? `${String(r.faa.props.kind).replace("_", " ")} ×${r.faa.props.pressure}`
                      : "normal",
                  "The one feed that covers every airport.",
                ],
                [
                  "checkpoints",
                  (r: ReturnType<typeof rollup>) =>
                    String(r.checkpoints.length),
                  "How finely the upstream publishes.",
                ],
              ] as const
            ).map(([label, get, why]) => (
              <tr
                key={label}
                className="border-b border-line-soft last:border-b-0"
              >
                <td className="px-3 py-2" title={why}>
                  <div className="text-[12px] text-fg">{label}</div>
                </td>
                {rows.map(({ iata, r }) => {
                  const v = get(r);
                  const dim =
                    label === "queue source" ||
                    label === "day shape" ||
                    label === "confidence";
                  const weak =
                    dim &&
                    (r.tier === "none" ||
                      r.grafted ||
                      (label === "day shape" && !r.curve));
                  return (
                    <td
                      key={iata}
                      className={`${td} nums font-mono text-[12px] ${weak ? "text-warn" : label === "queue source" ? (TIER_TEXT[r.tier] ?? "text-fg") : "text-fg"}`}
                    >
                      {v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-line-soft px-3 py-2 text-[10.5px] leading-relaxed text-fg-4">
        These airports all exist at once, so this is not the Mare axis — you
        cannot fork into &ldquo;the world where I departed from a different
        airport&rdquo;. What it is instead is the coverage argument stated as
        data: the confidence and the day shape are not properties of the
        airport, they are properties of{" "}
        <span className="text-fg-3">what anyone publishes about it</span>.
      </p>
    </div>
  );
}

/* ── 🐚 across time, one world ────────────────────────────────────────────── */

function Time({
  store,
  world,
  airport,
  checkpoints,
  th,
  td,
}: {
  store: Store;
  world: string;
  airport: string;
  checkpoints: { key: string; label: string }[];
  th: string;
  td: string;
}) {
  const head = headOf(store, world);
  const chain = lineage(store, head.id).reverse(); // oldest → newest
  const cols = chain.slice(-6); // the last six moments

  if (cols.length < 2) {
    return (
      <p className="px-3 py-4 text-[12px] leading-relaxed text-fg-3">
        This world has one snapshot. Advance the clock, change the staffing, or
        ingest a capture — every action appends a moment, and this table is what
        the Vongola strip below is made of.
      </p>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th
                className={`w-[150px] ${th} font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-fg-4`}
              >
                checkpoint
              </th>
              {cols.map((s) => (
                <th key={s.id} className={`min-w-[112px] border-l ${th}`}>
                  <div className="font-mono text-[11.5px] text-fg">
                    seq {s.seq}
                    {s.world !== world && (
                      <span className="ml-1 text-fg-4">↖{s.world}</span>
                    )}
                  </div>
                  <div className="mt-1 nums font-mono text-[10px] text-fg-4">
                    {fmtClock(localMinuteAt(s.state, airport))}
                  </div>
                  <div
                    className="mt-1 max-w-[16ch] truncate font-mono text-[9.5px] text-fg-3"
                    title={
                      s.cause.kind === "action"
                        ? String(s.cause.action)
                        : s.cause.kind
                    }
                  >
                    {s.cause.kind === "action"
                      ? String(s.cause.action)
                      : s.cause.kind}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {checkpoints.map((cp) => {
              const series = cols.map((s) => postedOf(s, cp.key));
              return (
                <tr
                  key={cp.key}
                  className="border-b border-line-soft last:border-b-0"
                >
                  <td className="px-3 py-2">
                    <div className="text-[12px] text-fg">{cp.label}</div>
                    <div className="font-mono text-[9.5px] text-fg-4">
                      {cp.key}
                    </div>
                  </td>
                  {series.map((v, i) => {
                    const prev = i > 0 ? series[i - 1] : null;
                    const d = v !== null && prev !== null ? v - prev : 0;
                    return (
                      <td key={i} className={td}>
                        {v === null ? (
                          <span className="font-mono text-[12px] text-fg-4">
                            —
                          </span>
                        ) : (
                          <span className="flex items-baseline gap-1.5">
                            <span className="nums font-mono text-[15px] text-fg">
                              {v}
                            </span>
                            {d !== 0 && (
                              <span
                                className={`nums font-mono text-[10.5px] ${d < 0 ? "text-ok" : "text-bad"}`}
                              >
                                {d > 0 ? "+" : ""}
                                {d}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr>
              <td className="border-t border-line px-3 py-1.5">
                <Label className="text-fg-4">address</Label>
              </td>
              {cols.map((s) => (
                <td
                  key={s.id}
                  className="border-t border-l border-line px-3 py-1.5 font-mono text-[10px] text-arcobaleno"
                >
                  {short(s.root, 10)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="border-t border-line-soft px-3 py-2 text-[10.5px] leading-relaxed text-fg-4">
        Every column is a state this world actually passed through, still
        addressable and still forkable — which is what separates Vongola from a
        chart of past readings. A column marked{" "}
        <span className="font-mono text-fg-3">↖</span> was inherited from the
        parent world above the fork point.
      </p>
    </div>
  );
}
