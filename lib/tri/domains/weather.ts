/**
 * Weather — a sketch, on the same runtime.
 *
 * Provisional in its figures, not in its structure. Of the three sketch domains this is
 * the one whose real feed is genuinely free and keyless (the US National Weather Service
 * publishes `api.weather.gov` with no registration), so it is the most obvious next one
 * to wire through the same ingestion boundary the FAA feed already uses.
 *
 * This domain is the cleanest fit for Mare of anything in the project, and worth saying
 * why. A forecast is not a prediction of one future — it is an ensemble of runs that
 * disagree, and exactly one of them will turn out to have been the world. Every other
 * domain here has to argue that its alternatives are mutually exclusive; weather does
 * not have to argue it, because meteorology already models it that way.
 *
 *   🌊 Mare        ensemble members. Only one becomes the weather that happened.
 *   🐚 Vongola     this station's chain of observations, forkable at any point.
 *   🌈 Arcobaleno  one member at one instant, addressed by its contents.
 *
 * The irreversible action is a public warning. Nothing in this project is heavier: a
 * tornado warning that goes out and should not have costs credibility that the next
 * real one depends on, and it cannot be unsent. It fires from primary and nowhere else.
 *
 * The coverage gap is spatial rather than temporal. A dense network measures; a sparse
 * one interpolates. Grafting a diurnal shape from a climatologically similar station is
 * the same move as borrowing a departure bank, with the same rule — the shape of the day
 * transfers, the level does not.
 */
import { makeObject, objKey, type Ontology, type Provenance, type WorldState } from "../runtime";
import { GENESIS_EPOCH_MIN, fmtUtc, localMinuteOfDay } from "../time";

const clockOf = (s: WorldState) => Number(s.objects[objKey("Clock", "world")].props.epochMin);
const ofType = (s: WorldState, t: string) => Object.values(s.objects).filter((o) => o.typeId === t);

export const NETWORK = {
  dense: { label: "dense", floor: 0.9, blurb: "measured — stations within ~20km" },
  sparse: { label: "sparse", floor: 0.6, blurb: "interpolated — nearest station is far" },
  grafted: { label: "grafted", floor: 0.6, blurb: "diurnal shape borrowed from a similar station" },
  none: { label: "no station", floor: 0.4, blurb: "no observation — model output only" },
} as const;

const STATIONS: {
  id: string; name: string; tz: string; network: keyof typeof NETWORK;
  baseTempC: number; diurnalC: number; peakHour: number;
}[] = [
  { id: "KJFK", name: "New York Kennedy", tz: "America/New_York", network: "dense", baseTempC: 24, diurnalC: 6, peakHour: 15 },
  { id: "KSEA", name: "Seattle–Tacoma", tz: "America/Los_Angeles", network: "dense", baseTempC: 19, diurnalC: 8, peakHour: 16 },
  { id: "KDEN", name: "Denver", tz: "America/Denver", network: "dense", baseTempC: 21, diurnalC: 13, peakHour: 15 },
  { id: "KMCG", name: "McGrath, AK", tz: "America/Anchorage", network: "sparse", baseTempC: 12, diurnalC: 9, peakHour: 16 },
  { id: "KP60", name: "Yellowstone Lake", tz: "America/Denver", network: "none", baseTempC: 11, diurnalC: 0, peakHour: 15 },
  { id: "K1V4", name: "St. Johnsbury, VT", tz: "America/New_York", network: "none", baseTempC: 18, diurnalC: 0, peakHour: 15 },
];

/** A cosine day: warmest a few hours after solar noon, coldest before dawn. */
function diurnal(minuteOfDay: number, peakHour: number, amplitudeC: number): number {
  const phase = ((minuteOfDay / 60 - peakHour) / 24) * 2 * Math.PI;
  return (amplitudeC / 2) * Math.cos(phase);
}

export function recompute(draft: WorldState) {
  const at = clockOf(draft);

  for (const st of ofType(draft, "Station")) {
    const network = String(st.props.network);
    const local = localMinuteOfDay(at, String(st.props.tz));
    // A station with no diurnal shape reports its base and says the shape is missing —
    // it does not invent a curve and it does not pretend the day is flat.
    const amp = Number(st.props.diurnalC);
    const swing = amp > 0 ? diurnal(local, Number(st.props.peakHour), amp) : 0;
    const tempC = Math.round((Number(st.props.baseTempC) + swing) * 10) / 10;

    const members = ofType(draft, "Member").filter((m) => m.props.station === st.key);
    const spread = members.length
      ? Math.round((Math.max(...members.map((m) => Number(m.props.deltaC))) -
                    Math.min(...members.map((m) => Number(m.props.deltaC)))) * 10) / 10
      : 0;

    draft.objects[objKey("Station", st.key)] = makeObject(
      "Station", st.key,
      {
        ...st.props,
        localMin: local,
        tempC,
        hasShape: amp > 0,
        ensembleSpreadC: spread,
        confidencePct: Math.round(100 * (NETWORK[network as keyof typeof NETWORK]?.floor ?? 0.4)),
      },
      st.prov,
    );
  }
}

export const WEATHER_ONTOLOGY: Ontology = {
  version: "weather-v1-sketch",

  objects: [
    { id: "Clock", label: "World clock", keyProp: "id", display: ["utc", "source"] },
    { id: "Station", label: "Station", keyProp: "id", display: ["name", "network", "tempC"] },
    { id: "Member", label: "Ensemble member", keyProp: "id", display: ["station", "deltaC"] },
    { id: "Warning", label: "Public warning", keyProp: "id", display: ["station", "kind"] },
  ],

  links: [
    { id: "member_of", label: "perturbs", from: "Member", to: "Station" },
    { id: "warns_for", label: "warns for", from: "Warning", to: "Station" },
  ],

  actions: [
    {
      id: "AdvanceClock",
      label: "Advance the world clock",
      effect: "branchable",
      touches: ["Clock", "Station"],
      note:
        "Walk the day. Temperature rides the diurnal curve in each station's own zone, so one instant reads as six different local times — the same reason the airport's departure bank runs on local time and not UTC.",
      params: { minutes: { type: "number", label: "Minutes", min: 15, max: 1440 } },
      handler: (draft, p) => {
        const k = objKey("Clock", "world");
        const c = draft.objects[k];
        const epochMin = Number(c.props.epochMin) + Number(p.minutes);
        draft.objects[k] = makeObject("Clock", "world", { ...c.props, epochMin, utc: fmtUtc(epochMin), source: "advanced" }, c.prov);
        recompute(draft);
      },
    },
    {
      id: "AddEnsembleMember",
      label: "Add an ensemble member",
      effect: "pure",
      touches: ["Member"],
      note:
        "A perturbed run. Members disagree on purpose — the spread IS the forecast, and a single number that hides it is the thing this domain exists to argue against. Fork a world per member and exactly one of them turns out to have been the weather.",
      params: {
        station: { type: "string", label: "Station", options: STATIONS.map((s) => s.id) },
        deltaC: { type: "number", label: "Perturbation °C", min: -12, max: 12 },
      },
      requires: [{ objectType: "Station", keyFromParam: "station" }],
      handler: (draft, p, prov) => {
        const id = `M${ofType(draft, "Member").length + 1}`;
        draft.objects[objKey("Member", id)] = makeObject(
          "Member", id,
          { id, station: String(p.station), deltaC: Number(p.deltaC) },
          { ...prov, source: "modelled" },
        );
        draft.links.push({ typeId: "member_of", from: objKey("Member", id), to: objKey("Station", String(p.station)) });
        recompute(draft);
      },
    },
    {
      id: "GraftDiurnal",
      label: "Graft a diurnal shape",
      effect: "pure",
      touches: ["Station"],
      note:
        "A site with no station has no shape of its own. Borrow the daily swing from a climatologically similar station — the amplitude and when it peaks transfer, the base temperature stays this site's own. Stamped grafted, docked to 60%.",
      params: {
        to: { type: "string", label: "Site with no station", options: STATIONS.filter((s) => s.network === "none").map((s) => s.id) },
        from: { type: "string", label: "Borrow the shape from", options: STATIONS.filter((s) => s.network === "dense").map((s) => s.id) },
      },
      requires: [
        { objectType: "Station", keyFromParam: "to" },
        { objectType: "Station", keyFromParam: "from" },
      ],
      handler: (draft, p, prov) => {
        const src = draft.objects[objKey("Station", String(p.from))];
        const k = objKey("Station", String(p.to));
        const st = draft.objects[k];
        draft.objects[k] = makeObject(
          "Station", st.key,
          {
            ...st.props,
            network: "grafted",
            diurnalC: Number(src.props.diurnalC),
            peakHour: Number(src.props.peakHour),
            shapeFrom: String(p.from),
          },
          { ...prov, originKind: "grafted", source: "modelled", via: String(p.from), confidence: 0.6 },
        );
        recompute(draft);
      },
    },
    {
      id: "IssueWarning",
      label: "Issue a public warning",
      effect: "irreversible",
      touches: ["Warning"],
      note:
        "This reaches the public. A warning that goes out and should not have spends credibility the next real one depends on, and it cannot be unsent. Outside primary the runtime computes it and refuses to emit — which is the whole reason to explore a scary ensemble member in a fork rather than in reality.",
      params: {
        station: { type: "string", label: "Station", options: STATIONS.map((s) => s.id) },
        kind: { type: "string", label: "Kind", options: ["heat", "wind", "flood", "winter storm"] },
      },
      requires: [{ objectType: "Station", keyFromParam: "station" }],
      handler: (draft, p, prov) => {
        const id = `W${ofType(draft, "Warning").length + 1}`;
        draft.objects[objKey("Warning", id)] = makeObject(
          "Warning", id,
          { id, station: String(p.station), kind: String(p.kind), atEpochMin: clockOf(draft) },
          prov,
        );
        draft.links.push({ typeId: "warns_for", from: objKey("Warning", id), to: objKey("Station", String(p.station)) });
      },
    },
  ],
};

export function seedWeather(prov: Provenance): WorldState {
  const state: WorldState = { objects: {}, links: [] };

  state.objects[objKey("Clock", "world")] = makeObject(
    "Clock", "world",
    { id: "world", epochMin: GENESIS_EPOCH_MIN, utc: fmtUtc(GENESIS_EPOCH_MIN), source: "genesis" },
    prov,
  );

  for (const s of STATIONS) {
    state.objects[objKey("Station", s.id)] = makeObject(
      "Station", s.id,
      {
        id: s.id, name: s.name, tz: s.tz, network: s.network,
        baseTempC: s.baseTempC, diurnalC: s.diurnalC, peakHour: s.peakHour,
        localMin: 0, tempC: 0, hasShape: s.diurnalC > 0, ensembleSpreadC: 0, confidencePct: 0,
      },
      {
        ...prov,
        source: s.network === "dense" ? "official" : "modelled",
        confidence: NETWORK[s.network].floor,
      },
    );
  }

  recompute(state);
  return state;
}

export const WEATHER_META = {
  slug: "weather",
  name: "Forecast ensemble",
  blurb: "Members that disagree, and one of them becomes the weather. The cleanest fit for Mare in the project — and the only sketch whose real feed is free and keyless.",
  irreversible: "IssueWarning — a public warning cannot be unsent",
  gap: "sparse network: sites with no station have no daily shape",
  status: "sketch",
} as const;
