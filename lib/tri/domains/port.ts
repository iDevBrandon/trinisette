/**
 * Container terminal — a sketch, on the same runtime.
 *
 * Provisional in its figures, not in its structure. This domain is here because it is
 * the one where the branching is least optional: berth allocation is a scheduling
 * problem where every plan excludes every other plan, and the thing an operator actually
 * wants is to hold four of them side by side and read the same berth down the column.
 *
 *   🌊 Mare        berth plans. Two vessels cannot have the same window.
 *   🐚 Vongola     the chain this plan came through, forkable at any point.
 *   🌈 Arcobaleno  one plan at one instant, addressed by its contents.
 *
 * The irreversible action is confirming a berth window. Once a window is confirmed the
 * vessel's agent schedules pilots, tugs, gangs and trucking against it — undoing it does
 * not put those back. That is a heavier class than the airport's alert and it is
 * declared, not assumed.
 *
 * The coverage gap here is arrival information. Large terminals get live AIS and a
 * berth-window feed; smaller ones publish a schedule and nothing else, so their arrival
 * time is a plan rather than an observation. A terminal with no live arrivals has no
 * shape to its day, and grafting a peer's arrival pattern is the same move as borrowing
 * a departure bank.
 */
import { makeObject, objKey, type Ontology, type Provenance, type WorldState } from "../runtime";
import { GENESIS_EPOCH_MIN, fmtClock, fmtUtc, localMinuteOfDay } from "../time";

const clockOf = (s: WorldState) => Number(s.objects[objKey("Clock", "world")].props.epochMin);
const ofType = (s: WorldState, t: string) => Object.values(s.objects).filter((o) => o.typeId === t);

export const ARRIVALS = {
  live: { label: "live AIS", floor: 0.9, blurb: "position-reported, minute by minute" },
  scheduled: { label: "schedule only", floor: 0.65, blurb: "a published plan, not an observation" },
  grafted: { label: "grafted", floor: 0.6, blurb: "arrival pattern borrowed from a peer terminal" },
  none: { label: "no feed", floor: 0.4, blurb: "agent phone calls" },
} as const;

const TERMINALS: {
  code: string; name: string; tz: string; arrivals: keyof typeof ARRIVALS;
  berths: number; cranesPerBerth: number; movesPerCraneHour: number;
}[] = [
  { code: "LAX-P400", name: "Los Angeles · Pier 400", tz: "America/Los_Angeles", arrivals: "live", berths: 4, cranesPerBerth: 4, movesPerCraneHour: 30 },
  { code: "RTM-MV2", name: "Rotterdam · Maasvlakte II", tz: "Europe/Amsterdam", arrivals: "live", berths: 4, cranesPerBerth: 5, movesPerCraneHour: 33 },
  { code: "SIN-PPT", name: "Singapore · Pasir Panjang", tz: "Asia/Singapore", arrivals: "live", berths: 5, cranesPerBerth: 4, movesPerCraneHour: 34 },
  { code: "SAV-GCT", name: "Savannah · Garden City", tz: "America/New_York", arrivals: "scheduled", berths: 3, cranesPerBerth: 3, movesPerCraneHour: 27 },
  { code: "MIT-BLB", name: "Manzanillo · Balboa", tz: "America/Panama", arrivals: "none", berths: 2, cranesPerBerth: 3, movesPerCraneHour: 24 },
  { code: "DKR-DPW", name: "Dakar · DP World", tz: "Africa/Dakar", arrivals: "none", berths: 2, cranesPerBerth: 2, movesPerCraneHour: 22 },
];

/**
 * Berth occupancy, and whether the plan is physically possible.
 *
 * The conflict check is the interesting part: two calls assigned the same berth with
 * overlapping windows is not a warning, it is a plan that cannot happen. It is surfaced
 * as state rather than blocked at input, because the whole point of a fork is to be able
 * to hold an impossible arrangement long enough to see what it would cost.
 */
export function recompute(draft: WorldState) {
  const at = clockOf(draft);

  const calls = ofType(draft, "Call");
  const byBerth = new Map<string, { key: string; start: number; end: number }[]>();

  for (const c of calls) {
    const terminal = draft.objects[objKey("Terminal", String(c.props.terminal))];
    if (!terminal) continue;

    const cranes = Math.max(1, Number(c.props.cranes));
    const rate = Number(terminal.props.movesPerCraneHour) * cranes;
    const workHours = rate > 0 ? Number(c.props.moves) / rate : 0;
    const start = Number(c.props.etaEpochMin);
    const end = Math.round(start + workHours * 60);

    const berth = String(c.props.berth);
    if (!byBerth.has(berth)) byBerth.set(berth, []);
    byBerth.get(berth)!.push({ key: c.key, start, end });

    draft.objects[objKey("Call", c.key)] = makeObject(
      "Call", c.key,
      {
        ...c.props,
        workHours: Math.round(workHours * 10) / 10,
        etdEpochMin: end,
        etaLocal: fmtClock(localMinuteOfDay(start, String(terminal.props.tz))),
        etdLocal: fmtClock(localMinuteOfDay(end, String(terminal.props.tz))),
        waitingHours: Math.max(0, Math.round(((start - at) / 60) * 10) / 10),
        conflict: false,
        confidencePct: Math.round(100 * (ARRIVALS[String(terminal.props.arrivals) as keyof typeof ARRIVALS]?.floor ?? 0.4)),
      },
      c.prov,
    );
  }

  // Two vessels, one berth, overlapping windows — recorded, never silently resolved.
  for (const windows of byBerth.values()) {
    windows.sort((a, b) => a.start - b.start);
    for (let i = 1; i < windows.length; i++) {
      if (windows[i].start < windows[i - 1].end) {
        for (const w of [windows[i], windows[i - 1]]) {
          const k = objKey("Call", w.key);
          const o = draft.objects[k];
          draft.objects[k] = makeObject("Call", o.key, { ...o.props, conflict: true }, o.prov);
        }
      }
    }
  }
}

const CALL_IDS = ["V-101", "V-102", "V-103", "V-104"];
const BERTHS = ["B1", "B2", "B3", "B4", "B5"];

export const PORT_ONTOLOGY: Ontology = {
  version: "port-v1-sketch",

  objects: [
    { id: "Clock", label: "World clock", keyProp: "id", display: ["utc", "source"] },
    { id: "Terminal", label: "Terminal", keyProp: "code", display: ["name", "arrivals", "berths"] },
    { id: "Vessel", label: "Vessel", keyProp: "imo", display: ["name", "teuCapacity"] },
    { id: "Call", label: "Port call", keyProp: "id", display: ["vessel", "berth", "etaLocal"] },
    { id: "Window", label: "Confirmed window", keyProp: "id", display: ["call", "berth"] },
  ],

  links: [
    { id: "calls_at", label: "calls at", from: "Call", to: "Terminal" },
    { id: "of_vessel", label: "is", from: "Call", to: "Vessel" },
    { id: "confirms", label: "confirms", from: "Window", to: "Call" },
  ],

  actions: [
    {
      id: "AdvanceClock",
      label: "Advance the world clock",
      effect: "branchable",
      touches: ["Clock", "Call"],
      note:
        "Move the plan forward. Waiting hours fall as the clock reaches each ETA, and each terminal reads the same instant in its own zone — Rotterdam and Singapore are seven hours apart and a berth plan that ignores that is a berth plan for nowhere.",
      params: { minutes: { type: "number", label: "Minutes", min: 30, max: 2880 } },
      handler: (draft, p) => {
        const k = objKey("Clock", "world");
        const c = draft.objects[k];
        const epochMin = Number(c.props.epochMin) + Number(p.minutes);
        draft.objects[k] = makeObject("Clock", "world", { ...c.props, epochMin, utc: fmtUtc(epochMin), source: "advanced" }, c.prov);
        recompute(draft);
      },
    },
    {
      id: "AssignBerth",
      label: "Assign a berth",
      effect: "branchable",
      touches: ["Call"],
      note:
        "Move a call to another berth. Two vessels in one berth with overlapping windows is recorded as a conflict rather than refused — an impossible plan you can look at is worth more than an input you cannot make, and the fork is where you look at it.",
      params: {
        call: { type: "string", label: "Call", options: CALL_IDS },
        berth: { type: "string", label: "Berth", options: BERTHS },
      },
      requires: [{ objectType: "Call", keyFromParam: "call" }],
      handler: (draft, p, prov) => {
        const k = objKey("Call", p.call);
        const c = draft.objects[k];
        draft.objects[k] = makeObject("Call", c.key, { ...c.props, berth: String(p.berth) }, prov);
        recompute(draft);
      },
    },
    {
      id: "SetCranes",
      label: "Set crane allocation",
      effect: "branchable",
      touches: ["Call"],
      note:
        "More cranes finish sooner and take gangs from another berth. The trade is the whole job, and holding both allocations at once is the reason to fork rather than to overwrite.",
      params: {
        call: { type: "string", label: "Call", options: CALL_IDS },
        cranes: { type: "number", label: "Cranes", min: 1, max: 6 },
      },
      requires: [{ objectType: "Call", keyFromParam: "call" }],
      handler: (draft, p, prov) => {
        const k = objKey("Call", p.call);
        const c = draft.objects[k];
        draft.objects[k] = makeObject("Call", c.key, { ...c.props, cranes: Number(p.cranes) }, prov);
        recompute(draft);
      },
    },
    {
      id: "GraftArrivalPattern",
      label: "Graft an arrival pattern",
      effect: "pure",
      touches: ["Terminal"],
      note:
        "A terminal with no arrival feed knows when a vessel is due only because someone said so. Borrow a peer's arrival pattern — how much a call typically slips and when the day bunches — never its volumes. Stamped grafted and docked to 60%.",
      params: {
        to: { type: "string", label: "Terminal with no feed", options: TERMINALS.filter((t) => t.arrivals === "none").map((t) => t.code) },
        from: { type: "string", label: "Borrow the pattern from", options: TERMINALS.filter((t) => t.arrivals === "live").map((t) => t.code) },
      },
      requires: [
        { objectType: "Terminal", keyFromParam: "to" },
        { objectType: "Terminal", keyFromParam: "from" },
      ],
      handler: (draft, p, prov) => {
        const src = draft.objects[objKey("Terminal", String(p.from))];
        const k = objKey("Terminal", String(p.to));
        const t = draft.objects[k];
        draft.objects[k] = makeObject(
          "Terminal", t.key,
          { ...t.props, arrivals: "grafted", shapeFrom: String(p.from), patternRef: String(src.props.code) },
          { ...prov, originKind: "grafted", source: "modelled", via: String(p.from), confidence: 0.6 },
        );
        recompute(draft);
      },
    },
    {
      id: "ConfirmWindow",
      label: "Confirm a berth window",
      effect: "irreversible",
      touches: ["Window"],
      note:
        "Confirming a window sends the agent to book pilots, tugs, gangs and trucking against it. Withdrawing the window does not put those back. Outside primary the runtime computes the confirmation and refuses to emit it — the heaviest effect in the project, and the one most worth rehearsing in a world that is not real.",
      params: {
        call: { type: "string", label: "Call", options: CALL_IDS },
        agent: { type: "string", label: "Agent notified" },
      },
      requires: [{ objectType: "Call", keyFromParam: "call" }],
      handler: (draft, p, prov) => {
        const id = `W${ofType(draft, "Window").length + 1}`;
        const call = draft.objects[objKey("Call", String(p.call))];
        draft.objects[objKey("Window", id)] = makeObject(
          "Window", id,
          {
            id, call: String(p.call), berth: String(call.props.berth),
            agent: String(p.agent), atEpochMin: clockOf(draft),
          },
          prov,
        );
        draft.links.push({ typeId: "confirms", from: objKey("Window", id), to: objKey("Call", String(p.call)) });
      },
    },
  ],
};

export function seedPort(prov: Provenance): WorldState {
  const state: WorldState = { objects: {}, links: [] };

  state.objects[objKey("Clock", "world")] = makeObject(
    "Clock", "world",
    { id: "world", epochMin: GENESIS_EPOCH_MIN, utc: fmtUtc(GENESIS_EPOCH_MIN), source: "genesis" },
    prov,
  );

  for (const t of TERMINALS) {
    state.objects[objKey("Terminal", t.code)] = makeObject(
      "Terminal", t.code,
      {
        code: t.code, name: t.name, tz: t.tz, arrivals: t.arrivals,
        berths: t.berths, cranesPerBerth: t.cranesPerBerth, movesPerCraneHour: t.movesPerCraneHour,
      },
      { ...prov, source: t.arrivals === "live" ? "official" : "modelled", confidence: ARRIVALS[t.arrivals].floor },
    );
  }

  const vessels: [string, string, number][] = [
    ["9839430", "Ever Ace", 23992],
    ["9776418", "MSC Gülsün", 23756],
    ["9619907", "Maersk Mc-Kinney Møller", 18270],
    ["9461118", "CMA CGM Marco Polo", 16022],
  ];
  for (const [imo, name, teu] of vessels) {
    state.objects[objKey("Vessel", imo)] = makeObject("Vessel", imo, { imo, name, teuCapacity: teu }, prov);
  }

  // Two of these share berth B1 with overlapping windows on purpose — the conflict is
  // the first thing worth looking at, and resolving it is the first thing worth forking.
  const calls: [string, string, string, string, number, number, number][] = [
    ["V-101", "9839430", "LAX-P400", "B1", 0, 4200, 4],
    ["V-102", "9776418", "LAX-P400", "B1", 180, 3800, 3],
    ["V-103", "9619907", "RTM-MV2", "B2", 600, 5200, 5],
    ["V-104", "9461118", "MIT-BLB", "B1", 900, 2600, 3],
  ];
  for (const [id, imo, terminal, berth, etaOffsetMin, moves, cranes] of calls) {
    state.objects[objKey("Call", id)] = makeObject(
      "Call", id,
      {
        id, vessel: imo, terminal, berth,
        etaEpochMin: GENESIS_EPOCH_MIN + etaOffsetMin,
        moves, cranes,
        workHours: 0, etdEpochMin: 0, etaLocal: "", etdLocal: "",
        waitingHours: 0, conflict: false, confidencePct: 0,
      },
      prov,
    );
    state.links.push({ typeId: "calls_at", from: objKey("Call", id), to: objKey("Terminal", terminal) });
    state.links.push({ typeId: "of_vessel", from: objKey("Call", id), to: objKey("Vessel", imo) });
  }

  recompute(state);
  return state;
}

export const PORT_META = {
  slug: "port",
  name: "Berth plan",
  blurb: "Vessels, berths and crane gangs. Two calls start in the same berth on purpose — resolve the conflict in a fork, and find out that confirming a window will not fire from a world that is not real.",
  irreversible: "ConfirmWindow — pilots, tugs and gangs get booked against it",
  gap: "terminals with no arrival feed have no shape to their day",
  status: "sketch",
} as const;
