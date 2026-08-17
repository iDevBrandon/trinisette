/**
 * The airport-now ontology.
 *
 * Object, link and action types are declared here and nowhere else. The parameter
 * forms, the validation messages, the suppression and the primary-only refusal are all
 * consequences of this file — change an action's `effect` and the UI behaviour changes
 * with no component edit.
 *
 * The shape comes from the project's own live source survey (lib/feeds/sources.ts).
 * Two feeds cover this network at different widths:
 *
 *   FAA NAS Status   all 46 airports · free · no key · genuinely live
 *   queue feeds      30 airports · 24 direct, 6 published estimates
 *
 * Sixteen airports — ORD, SFO, SEA, SJC, BOS, LAS among them — sit on the board with
 * operational status and no queue signal at all. That gap is permanent, not a launch
 * problem, and it is the whole reason for the lateral edge: `GraftCurve` borrows the
 * SHAPE of a covered airport's departure bank and never its level, marking everything
 * downstream second-hand with confidence docked.
 *
 * Community reports do not expire. The reference product drops a traveller report
 * after two hours, which is right for a cache and wrong for a world: I2 says a world is
 * append-only. A report here ages out of the EVIDENCE WINDOW — it stops counting toward
 * the posted number — and stays in lineage forever. "Not current" and "never happened"
 * are different claims and the substrate refuses to conflate them.
 */
import type { FaaEntry } from "../feeds/faa";
import { delayPressure, worstByAirport } from "../feeds/faa";
import { SOURCES, byIata, type SourceRow } from "../feeds/sources";
import {
  makeObject, objKey,
  type OntoObject, type Ontology, type Provenance, type WorldState,
} from "./runtime";
import { short } from "./hash";
import { GENESIS_EPOCH_MIN, epochMinFromIso, fmtClock, fmtUtc, localMinuteOfDay } from "./time";

export { fmtClock, fmtOffset, localMinuteOfDay, tzOffsetMin } from "./time";

/** A traveller report counts toward the posted wait for this long. Then it is history, not evidence. */
export const EVIDENCE_WINDOW_MIN = 120;

export const DEMAND: Record<string, number> = { light: 0.7, normal: 1.0, heavy: 1.45 };

/**
 * The world clock is ONE INSTANT in epoch minutes, not a time of day.
 *
 * Forty-six airports across four zones cannot share a wall clock: a departure bank
 * peaks in local time, so 06:40 at ATL and 06:40 at LAX are three hours apart. The
 * world holds the instant; each airport projects it through its own zone. That is also
 * the only way `AdvanceClock` means anything across the network at once.
 *
 * Genesis is a fixed constant so a freshly opened world always has the same root.
 * Real time enters the same way FAA delays do — through the ingestion boundary, as a
 * field in a captured payload — which keeps the address honest: replay the payload,
 * get the state back.
 */
export const clockOf = (state: WorldState): number =>
  Number(state.objects[objKey("Clock", "world")].props.epochMin);

/** Minute-of-day at this airport, for the instant this world is at. */
export function localMinuteAt(state: WorldState, iata: string): number {
  return localMinuteOfDay(clockOf(state), byIata(iata)?.tz ?? "UTC");
}

/* ── the deterministic model ─────────────────────────────────────────────────
   Nothing below reads a clock, a random number or an insertion order. The world's
   own Clock object is the only time that exists, which is what lets a snapshot
   address mean something (§ADR-004).                                           */

/** A departure bank: a gaussian bump in demand around a peak minute-of-day. */
function bankFactor(curve: OntoObject | undefined, nowMin: number): number {
  if (!curve) return 1;
  const z = (nowMin - Number(curve.props.peakMin)) / Number(curve.props.spread);
  return 1 + Number(curve.props.amp) * Math.exp(-(z * z));
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : Math.round((s[i - 1] + s[i]) / 2);
};

const ofType = (state: WorldState, typeId: string) =>
  Object.values(state.objects).filter((o) => o.typeId === typeId);

/** Confidence floor by how the number was come by. The tier does the talking. */
const FLOOR: Record<string, number> = {
  official: 0.9,
  official_estimate: 0.7,
  grafted: 0.6,
  none: 0.4,
};

/* ── derivation ──────────────────────────────────────────────────────────────
   ONE code path. `recompute` stores what `derivePosted` returns, and the trace panel
   renders the same object. An explanation written as a second implementation drifts
   from the model and eventually lies about it; this one cannot, because it IS the
   model. Every step carries where its input came from, so a posted number can be
   walked back to the sha256 of the bytes the FAA returned.                        */

export type Tone = "official" | "official_estimate" | "community" | "modelled" | "grafted" | "none";

export interface DeriveStep {
  label: string;
  value: string;
  /** Where this input came from — the provenance sentence, in one line. */
  from: string;
  tone: Tone;
  /** Content address, capture sha, or the action that set it. */
  address?: string;
}

export interface Derivation {
  checkpoint: string;
  airport: string;
  steps: DeriveStep[];
  modelFormula: string;
  modelMin: number;
  communityMin: number;
  reportsUsed: number;
  crowdWeightPct: number;
  postedFormula: string;
  postedMin: number;
  basis: string;
  confidencePct: number;
  confidenceWhy: string;
}

/**
 * Derive one checkpoint's posted wait, and say how.
 *
 * Pure over the world state — no clock read, no ambient anything. Given the same
 * snapshot it returns the same numbers and the same explanation, which is what lets the
 * trace panel be trusted as evidence rather than as a caption.
 */
export function derivePosted(state: WorldState, checkpointKey: string): Derivation | null {
  const c = state.objects[objKey("Checkpoint", checkpointKey)];
  if (!c) return null;

  const iata = String(c.props.airport);
  const airport = state.objects[objKey("Airport", iata)];
  const curve = state.objects[objKey("Curve", iata)];
  const status = state.objects[objKey("FaaStatus", iata)];
  const clock = state.objects[objKey("Clock", "world")];
  const capture = status ? state.objects[objKey("Capture", String(status.props.capture))] : undefined;

  const at = Number(clock.props.epochMin);
  const tz = String(airport.props.tz);
  const localMin = localMinuteOfDay(at, tz);

  const grafted = curve?.prov.originKind === "grafted";
  const tier = String(airport.props.tier);
  const basis = grafted ? "grafted" : curve ? tier : "none";

  const baseLoad = Number(c.props.baseLoad);
  const lanes = Math.max(1, Number(c.props.lanes));
  const demandName = String(airport.props.demand);
  const demandFactor = DEMAND[demandName] ?? 1;
  const bank = bankFactor(curve, localMin);
  const pressure = status ? Number(status.props.pressure) : 1;

  const modelMin = Math.round((baseLoad * demandFactor * bank * pressure) / lanes);

  const mine = ofType(state, "Report")
    .filter((r) => r.props.checkpoint === checkpointKey && r.props.current === true);
  const communityMin = mine.length ? median(mine.map((r) => Number(r.props.waitMin))) : 0;
  const wc = mine.length ? Math.min(0.6, 0.2 * mine.length) : 0;
  const postedMin = Math.round(modelMin * (1 - wc) + communityMin * wc);
  const confidencePct = Math.round(100 * Math.min(0.95, (FLOOR[basis] ?? 0.4) + 0.05 * mine.length));

  const clockSource = String(clock.props.source);
  const steps: DeriveStep[] = [
    {
      label: "baseLoad", value: String(baseLoad),
      from: "seed — modelled, not measured. No per-airport queue parser is wired yet.",
      tone: "modelled", address: short(c.hash, 12),
    },
    {
      label: "lanes", value: String(lanes),
      from: `${c.prov.originWorld} @ seq ${c.prov.originSeq}${c.prov.originSeq > 0 ? " — SetStaffedLanes" : " — seed"}`,
      tone: "modelled", address: short(c.hash, 12),
    },
    {
      label: "demand", value: `${demandName} ×${demandFactor}`,
      from: `declared assumption — AssumeDemand, ${airport.prov.originWorld} @ seq ${airport.prov.originSeq}`,
      tone: "modelled", address: short(airport.hash, 12),
    },
    {
      label: "clock", value: `${fmtClock(localMin)} local (${tz})`,
      from: clockSource === "genesis"
        ? "genesis — a fixed constant, so a fresh world always has the same root"
        : clockSource.startsWith("capture")
          ? `captured instant ${String(clock.props.utc)} — time arrived as a payload field, never read`
          : `advanced by AdvanceClock — ${String(clock.props.utc)}`,
      tone: clockSource.startsWith("capture") ? "official" : "modelled",
      address: short(clock.hash, 12),
    },
    {
      label: "bank", value: `×${bank.toFixed(3)}`,
      from: curve
        ? grafted
          ? `shape grafted from ${curve.prov.via} — peak ${String(curve.props.peak)}, spread ${String(curve.props.spread)}. The shape transferred; the level did not.`
          : `${String(curve.props.pattern)} — peak ${String(curve.props.peak)} local, ${tier === "official" ? "direct feed" : "published forecast"}`
        : "no shape — this airport has no queue feed, so time of day does nothing",
      tone: grafted ? "grafted" : curve ? (tier as Tone) : "none",
      address: curve ? short(curve.hash, 12) : undefined,
    },
    {
      label: "faaPressure", value: `×${pressure}`,
      from: status
        ? `FAA ${String(status.props.kind).replace("_", " ")} — ${String(status.props.reason)}${Number(status.props.avgMin) > 0 ? `, avg ${String(status.props.avgMin)}m` : ""}`
        : capture ? "no delay programme at this airport in the last capture" : "no capture ingested in this world",
      tone: status ? (capture?.props.live ? "official" : "modelled") : "none",
      address: capture ? `sha ${short(String(capture.props.bodySha256), 12)}` : undefined,
    },
  ];

  if (mine.length) {
    steps.push({
      label: "crowd", value: `${communityMin} min from ${mine.length}`,
      from: `median of traveller reports inside the ${EVIDENCE_WINDOW_MIN}-minute evidence window (${mine.map((r) => r.key).join(", ")})`,
      tone: "community",
    });
  }

  return {
    checkpoint: checkpointKey, airport: iata, steps,
    modelFormula: `${baseLoad} × ${demandFactor} × ${bank.toFixed(3)} × ${pressure} ÷ ${lanes} = ${modelMin}`,
    modelMin, communityMin, reportsUsed: mine.length,
    crowdWeightPct: Math.round(wc * 100),
    postedFormula: mine.length
      ? `${modelMin} × ${(1 - wc).toFixed(2)} + ${communityMin} × ${wc.toFixed(2)} = ${postedMin}`
      : `no reports in window → posted = model = ${postedMin}`,
    postedMin, basis, confidencePct,
    confidenceWhy: `${basis} floor ${Math.round((FLOOR[basis] ?? 0.4) * 100)}%${mine.length ? ` + ${mine.length} corroborating report${mine.length === 1 ? "" : "s"} × 5` : ""}, capped at 95%`,
  };
}

export function recompute(draft: WorldState) {
  const at = clockOf(draft);

  // 1. Report freshness. Nothing is removed; `current` is the only thing that moves.
  //    Age is an interval between two instants, so it needs no zone.
  for (const r of ofType(draft, "Report")) {
    const ageMin = Math.max(0, at - Number(r.props.observedAtEpochMin));
    draft.objects[objKey("Report", r.key)] = makeObject(
      "Report", r.key, { ...r.props, ageMin, current: ageMin <= EVIDENCE_WINDOW_MIN }, r.prov,
    );
  }

  // 2. Checkpoint waits — stored straight from the derivation, so the trace panel and
  //    the board can never disagree.
  for (const c of ofType(draft, "Checkpoint")) {
    const d = derivePosted(draft, c.key);
    if (!d) continue;
    const props: OntoObject["props"] = {
      ...c.props,
      basis: d.basis, modelMin: d.modelMin, communityMin: d.communityMin,
      reportsUsed: d.reportsUsed, crowdWeightPct: d.crowdWeightPct,
      postedMin: d.postedMin, confidencePct: d.confidencePct,
    };
    const curve = draft.objects[objKey("Curve", String(c.props.airport))];
    if (d.basis === "grafted") props.shapeFrom = String(curve?.prov.via ?? "");
    else delete props.shapeFrom;

    draft.objects[objKey("Checkpoint", c.key)] = makeObject("Checkpoint", c.key, props, c.prov);
  }
}

/* ── the ontology ────────────────────────────────────────────────────────── */

const ALL = SOURCES.map((s) => s.iata);
/** Only airports that already have a shape can lend one. */
const DONORS = SOURCES.filter((s) => s.tier === "official" || s.forecast).map((s) => s.iata);
/** The sixteen with no queue feed — the real graft targets. */
const UNCOVERED = SOURCES.filter((s) => s.tier === "none").map((s) => s.iata);

export const AIRPORT_ONTOLOGY: Ontology = {
  version: "airport-now-v3",

  objects: [
    { id: "Clock", label: "World clock", keyProp: "id", display: ["utc", "source"] },
    { id: "Airport", label: "Airport", keyProp: "iata", display: ["city", "tz", "tier"] },
    { id: "Capture", label: "Feed capture", keyProp: "id", display: ["feedId", "entries", "live"] },
    { id: "FaaStatus", label: "FAA status", keyProp: "airport", display: ["kind", "reason", "pressure"] },
    { id: "Curve", label: "Departure bank", keyProp: "airport", display: ["pattern", "peak"] },
    { id: "Terminal", label: "Terminal", keyProp: "code", display: ["airport", "name"] },
    { id: "Checkpoint", label: "Checkpoint", keyProp: "code", display: ["terminal", "lanes", "postedMin"] },
    { id: "Report", label: "Traveller report", keyProp: "id", display: ["checkpoint", "waitMin", "ageMin"] },
    { id: "Alert", label: "Alert", keyProp: "id", display: ["airport", "message"] },
  ],

  links: [
    { id: "in_airport", label: "is in", from: "Terminal", to: "Airport" },
    { id: "in_terminal", label: "is in", from: "Checkpoint", to: "Terminal" },
    { id: "shapes", label: "shapes", from: "Curve", to: "Airport" },
    { id: "status_of", label: "status of", from: "FaaStatus", to: "Airport" },
    { id: "captured_by", label: "captured by", from: "FaaStatus", to: "Capture" },
    { id: "reports_on", label: "reports on", from: "Report", to: "Checkpoint" },
    { id: "posted_to", label: "posted to", from: "Alert", to: "Airport" },
  ],

  actions: [
    {
      id: "IngestFaaStatus",
      label: "Ingest FAA status",
      effect: "pure",
      primaryOnly: true,
      touches: ["Capture", "FaaStatus", "Checkpoint"],
      note:
        "Pull the live FAA NAS Status feed through the ingestion boundary. The whole response payload is the parameter — including the instant it was fetched, which becomes this world's clock. That is the distinction the substrate actually needs: reading a wall clock inside the model would make the address a lie, but receiving a timestamp as a captured field is just an input. Keep the payload and you can replay this world byte for byte, clock included. Primary-only: a true reading of reality dropped into a counterfactual is not a counterfactual.",
      params: {
        payload: { type: "string", label: "Capture payload (JSON)", multiline: true },
      },
      handler: (draft, p, prov) => {
        const raw = JSON.parse(String(p.payload)) as {
          feedId: string; url: string; fetchedAt: string; live: boolean;
          bodySha256: string; entries: FaaEntry[];
        };
        const id = `C${ofType(draft, "Capture").length + 1}`;
        draft.objects[objKey("Capture", id)] = makeObject(
          "Capture", id,
          {
            id, feedId: raw.feedId, url: raw.url, fetchedAt: raw.fetchedAt,
            live: raw.live, bodySha256: raw.bodySha256, entries: raw.entries.length,
          },
          { ...prov, source: raw.live ? "official" : "modelled", confidence: raw.live ? 0.95 : 0.3 },
        );

        // The clock the capture was taken at becomes the clock this world is at. Time
        // arrives as data, exactly like the delay entries beside it — never read.
        const at = epochMinFromIso(raw.fetchedAt);
        if (at !== null) {
          const ck = objKey("Clock", "world");
          draft.objects[ck] = makeObject(
            "Clock", "world",
            { id: "world", epochMin: at, utc: fmtUtc(at), source: raw.live ? "capture" : "capture:fixture" },
            { ...prov, source: raw.live ? "official" : "modelled", confidence: raw.live ? 0.95 : 0.3 },
          );
        }

        const worst = worstByAirport(raw.entries);
        for (const iata of ALL) {
          const e = worst[iata];
          const k = objKey("FaaStatus", iata);
          if (!e) { delete draft.objects[k]; continue; }
          draft.objects[k] = makeObject(
            "FaaStatus", iata,
            {
              airport: iata, kind: e.kind, reason: e.reason,
              avgMin: e.avgMin ?? 0, maxMin: e.maxMin ?? 0, trend: e.trend ?? "",
              pressure: Math.round(delayPressure(e) * 100) / 100,
              capture: id,
            },
            { ...prov, source: raw.live ? "official" : "modelled", confidence: raw.live ? 0.95 : 0.3 },
          );
          draft.links.push({ typeId: "status_of", from: k, to: objKey("Airport", iata) });
          draft.links.push({ typeId: "captured_by", from: k, to: objKey("Capture", id) });
        }
        recompute(draft);
      },
    },
    {
      id: "AdvanceClock",
      label: "Advance the world clock",
      effect: "branchable",
      touches: ["Clock", "Checkpoint", "Report"],
      note:
        "Move this world forward. Waits ride the departure bank, and reports age — a report past the 120-minute evidence window stops counting toward the posted number and stays in lineage anyway. Branchable: the future is exactly the thing worth forking.",
      params: { minutes: { type: "number", label: "Minutes", min: 5, max: 360 } },
      handler: (draft, p) => {
        const k = objKey("Clock", "world");
        const c = draft.objects[k];
        const epochMin = Number(c.props.epochMin) + Number(p.minutes);
        draft.objects[k] = makeObject(
          "Clock", "world",
          { ...c.props, epochMin, utc: fmtUtc(epochMin), source: "advanced" },
          c.prov,
        );
        recompute(draft);
      },
    },
    {
      id: "SetStaffedLanes",
      label: "Set staffed lanes",
      effect: "branchable",
      touches: ["Checkpoint"],
      note:
        "The operational counterfactual: what if this checkpoint ran more lanes into the bank? Branchable, so the roster forks alongside the world instead of overwriting the one actually staffed.",
      params: {
        checkpoint: { type: "string", label: "Checkpoint", options: [] },
        lanes: { type: "number", label: "Lanes", min: 1, max: 24 },
      },
      requires: [{ objectType: "Checkpoint", keyFromParam: "checkpoint" }],
      handler: (draft, p, prov) => {
        const k = objKey("Checkpoint", p.checkpoint);
        const c = draft.objects[k];
        draft.objects[k] = makeObject("Checkpoint", c.key, { ...c.props, lanes: Number(p.lanes) }, prov);
        recompute(draft);
      },
    },
    {
      id: "AssumeDemand",
      label: "Assume a demand regime",
      effect: "pure",
      touches: ["Airport"],
      note:
        "An assumption about the day, applied to one airport. Pure — it moves modelled figures and touches nothing outside. Recording it as an action is the point: the assumption lands in the lineage instead of being smuggled in as setup.",
      params: {
        airport: { type: "string", label: "Airport", options: ALL },
        demand: { type: "string", label: "Demand", options: ["light", "normal", "heavy"] },
      },
      requires: [{ objectType: "Airport", keyFromParam: "airport" }],
      handler: (draft, p, prov) => {
        const k = objKey("Airport", p.airport);
        const a = draft.objects[k];
        draft.objects[k] = makeObject("Airport", a.key, { ...a.props, demand: String(p.demand) }, prov);
        recompute(draft);
      },
    },
    {
      id: "RecordReport",
      label: "Record a traveller report",
      effect: "pure",
      touches: ["Report"],
      note:
        "A queue observation from someone standing in it, stamped with the world clock. It counts toward the posted wait for 120 minutes, then ages out of the window — and is never deleted (I2).",
      params: {
        checkpoint: { type: "string", label: "Checkpoint", options: [] },
        waitMin: { type: "number", label: "Observed wait", min: 0, max: 240 },
        photos: { type: "number", label: "Photos attached", min: 0, max: 6 },
      },
      requires: [{ objectType: "Checkpoint", keyFromParam: "checkpoint" }],
      handler: (draft, p, prov) => {
        const at = clockOf(draft);
        const id = `R${ofType(draft, "Report").length + 1}`;
        const cp = draft.objects[objKey("Checkpoint", String(p.checkpoint))];
        draft.objects[objKey("Report", id)] = makeObject(
          "Report", id,
          {
            id, airport: String(cp.props.airport), checkpoint: String(p.checkpoint),
            waitMin: Number(p.waitMin), photos: Number(p.photos),
            observedAtEpochMin: at,
            observedAtLocal: fmtUtc(at),
            ageMin: 0, current: true,
          },
          { ...prov, source: "community", confidence: 0.5 + 0.1 * Number(p.photos) },
        );
        draft.links.push({ typeId: "reports_on", from: objKey("Report", id), to: objKey("Checkpoint", String(p.checkpoint)) });
        recompute(draft);
      },
    },
    {
      id: "GraftCurve",
      label: "Graft a departure bank",
      effect: "pure",
      touches: ["Curve"],
      note:
        "The cold-start answer for the sixteen airports with no queue feed. Borrow a covered airport's time-of-day SHAPE — when the bank peaks and how wide it is. What does not transfer is the level: this airport's own lanes and load stay its own. Everything downstream is stamped grafted with a `via`, and its confidence is docked to 60%.",
      params: {
        to: { type: "string", label: "Airport with no shape", options: UNCOVERED },
        from: { type: "string", label: "Borrow the shape from", options: DONORS },
      },
      requires: [
        { objectType: "Airport", keyFromParam: "to" },
        { objectType: "Curve", keyFromParam: "from" },
      ],
      handler: (draft, p, prov) => {
        const src = draft.objects[objKey("Curve", String(p.from))];
        const to = String(p.to);
        draft.objects[objKey("Curve", to)] = makeObject(
          "Curve", to,
          {
            airport: to,
            pattern: String(src.props.pattern),
            peakMin: Number(src.props.peakMin),
            peak: String(src.props.peak),
            spread: Number(src.props.spread),
            amp: Number(src.props.amp),
          },
          { ...prov, originKind: "grafted", source: "modelled", via: String(p.from), confidence: 0.6 },
        );
        draft.links.push({ typeId: "shapes", from: objKey("Curve", to), to: objKey("Airport", to) });
        recompute(draft);
      },
    },
    {
      id: "PublishAlert",
      label: "Publish a departure alert",
      effect: "irreversible",
      touches: ["Alert"],
      note:
        "This pushes a notification to real travellers. It cannot be unsent, so outside primary the runtime refuses to emit it and records the attempt as suppressed: the counterfactual is computed, nobody's phone buzzes.",
      params: {
        airport: { type: "string", label: "Airport", options: ALL },
        message: { type: "string", label: "Message" },
      },
      requires: [{ objectType: "Airport", keyFromParam: "airport" }],
      handler: (draft, p, prov) => {
        const id = `A${ofType(draft, "Alert").length + 1}`;
        draft.objects[objKey("Alert", id)] = makeObject(
          "Alert", id, { id, airport: String(p.airport), message: String(p.message) }, prov,
        );
        draft.links.push({ typeId: "posted_to", from: objKey("Alert", id), to: objKey("Airport", String(p.airport)) });
      },
    },
  ],
};

/* ── seed ────────────────────────────────────────────────────────────────────
   The inventory is real: tier, granularity and upstream URL come from the survey.
   The wait FIGURES are modelled — no queue parser is wired in this build, and the
   page says so rather than dressing a simulation up as telemetry. Wiring one
   airport replaces its row here and changes nothing else.                       */

/** Departure-bank shapes, by rough airport archetype. Only shapes, never levels. */
const SHAPES: Record<string, { pattern: string; peakMin: number; spread: number; amp: number }> = {
  megahub: { pattern: "morning connecting bank", peakMin: 400, spread: 90, amp: 1.0 },
  origin: { pattern: "early origin-market bank", peakMin: 350, spread: 75, amp: 1.05 },
  coastal: { pattern: "wide, flat bank", peakMin: 455, spread: 115, amp: 0.9 },
  leisure: { pattern: "late-morning leisure bank", peakMin: 500, spread: 105, amp: 0.85 },
};

const ARCHETYPE: Record<string, keyof typeof SHAPES> = {
  ATL: "megahub", DFW: "megahub", CLT: "megahub", IAH: "megahub", PHL: "megahub",
  DTW: "megahub", MSP: "megahub", CVG: "megahub", JFK: "coastal", EWR: "coastal",
  LAX: "coastal", MIA: "coastal", DCA: "origin", IAD: "coastal", DEN: "origin",
  SLC: "origin", PDX: "origin", SEA: "origin", BNA: "origin", BWI: "origin",
  CLE: "origin", PIT: "origin", PHX: "leisure", MCO: "leisure", HOU: "origin",
  STL: "origin", CMH: "origin", CHS: "leisure", JAX: "leisure", OMA: "origin",
  SAT: "origin",
};

/** Rough size class → how many checkpoints and how much load. Modelled, not measured. */
const SIZE: Record<string, "xl" | "l" | "m" | "s"> = {
  ATL: "xl", DFW: "xl", DEN: "xl", ORD: "xl", LAX: "xl", JFK: "xl", LAS: "xl",
  MCO: "xl", CLT: "l", MIA: "l", PHX: "l", SEA: "l", EWR: "l", SFO: "l", IAH: "l",
  BOS: "l", MSP: "l", DTW: "l", PHL: "l", SLC: "l", BWI: "m", DCA: "m", IAD: "m",
  SAN: "m", TPA: "m", MDW: "m", BNA: "m", AUS: "m", STL: "m", PDX: "m", HOU: "m",
  CLE: "m", PIT: "m", SAT: "m", RDU: "m", IND: "m", CMH: "m", MCI: "m", OAK: "m",
  FLL: "l", CVG: "m", JAX: "s", OMA: "s", CHS: "s", ABQ: "s", SJC: "s",
};

const LOAD: Record<string, { lanes: number; base: number; count: number }> = {
  xl: { lanes: 12, base: 640, count: 3 },
  l: { lanes: 9, base: 470, count: 2 },
  m: { lanes: 6, base: 300, count: 2 },
  s: { lanes: 3, base: 110, count: 1 },
};

/** How the upstream publishes → how many nodes it is honest to show. */
function nodeCount(s: SourceRow): number {
  const size = LOAD[SIZE[s.iata] ?? "m"];
  if (s.granularity === "airport") return 1;
  if (s.granularity === "terminal" || s.granularity === "concourse") return Math.min(2, size.count);
  return size.count;
}

export function seedAirport(prov: Provenance): WorldState {
  const state: WorldState = { objects: {}, links: [] };

  state.objects[objKey("Clock", "world")] = makeObject(
    "Clock", "world",
    { id: "world", epochMin: GENESIS_EPOCH_MIN, utc: fmtUtc(GENESIS_EPOCH_MIN), source: "genesis" },
    prov,
  );

  for (const s of SOURCES) {
    const covered = s.tier === "official" || s.tier === "official_estimate";
    state.objects[objKey("Airport", s.iata)] = makeObject(
      "Airport", s.iata,
      {
        iata: s.iata, city: s.city, tz: s.tz, tier: s.tier, granularity: s.granularity,
        source: s.url ?? "", forecast: s.forecast, demand: "normal",
      },
      {
        ...prov,
        source: s.tier === "official" ? "official" : covered ? "official" : "modelled",
        confidence: FLOOR[s.tier] ?? 0.4,
      },
    );

    // A shape exists only where the upstream could actually reveal one: a direct feed,
    // or a published forecast. The other sixteen are flat until something is grafted.
    if (s.tier === "official" || s.forecast) {
      const shape = SHAPES[ARCHETYPE[s.iata] ?? "origin"];
      state.objects[objKey("Curve", s.iata)] = makeObject(
        "Curve", s.iata,
        { airport: s.iata, pattern: shape.pattern, peakMin: shape.peakMin, peak: fmtClock(shape.peakMin), spread: shape.spread, amp: shape.amp },
        { ...prov, source: "official", confidence: s.forecast && s.tier !== "official" ? 0.7 : 0.9 },
      );
      state.links.push({ typeId: "shapes", from: objKey("Curve", s.iata), to: objKey("Airport", s.iata) });
    }

    const size = LOAD[SIZE[s.iata] ?? "m"];
    const n = nodeCount(s);
    const tCode = `${s.iata}-T`;
    state.objects[objKey("Terminal", tCode)] = makeObject(
      "Terminal", tCode,
      { code: tCode, airport: s.iata, name: n === 1 ? "All checkpoints" : "Main terminal" },
      prov,
    );
    state.links.push({ typeId: "in_airport", from: objKey("Terminal", tCode), to: objKey("Airport", s.iata) });

    for (let i = 0; i < n; i++) {
      const suffix = n === 1 ? "ALL" : String.fromCharCode(65 + i);
      const code = `${s.iata}-${suffix}`;
      // Later checkpoints are smaller — a plausible, declared taper, not a measurement.
      const scale = 1 - i * 0.28;
      state.objects[objKey("Checkpoint", code)] = makeObject(
        "Checkpoint", code,
        {
          code,
          label: n === 1 ? "All checkpoints" : `Checkpoint ${suffix}`,
          airport: s.iata, terminal: tCode,
          lanes: Math.max(1, Math.round(size.lanes * scale / (n === 1 ? 1 : 1))),
          baseLoad: Math.round((size.base * scale) / (n === 1 ? 1 : 1)),
          basis: "none", modelMin: 0, communityMin: 0, reportsUsed: 0,
          crowdWeightPct: 0, postedMin: 0, confidencePct: 0,
        },
        { ...prov, source: covered ? "official" : "modelled" },
      );
      state.links.push({ typeId: "in_terminal", from: objKey("Checkpoint", code), to: objKey("Terminal", tCode) });
    }
  }

  recompute(state);
  return state;
}

/** Checkpoint keys, for the declared param options. Derived so they cannot drift. */
export const ALL_CHECKPOINTS = (() => {
  const seed = seedAirport({ originWorld: "primary", originSeq: 0, originKind: "native", source: "official" });
  return Object.values(seed.objects).filter((o) => o.typeId === "Checkpoint").map((o) => o.key).sort();
})();

for (const a of AIRPORT_ONTOLOGY.actions) {
  if (a.params.checkpoint) a.params.checkpoint.options = ALL_CHECKPOINTS;
}
