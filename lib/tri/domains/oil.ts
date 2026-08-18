/**
 * Crude oil trading — a sketch, on the same runtime.
 *
 * Provisional: the figures are modelled and no price feed is wired. What is not
 * provisional is the structure, because it is declared against the same `Ontology` type
 * the airport uses and runs through the same `invoke()`. That is the claim this domain
 * exists to test — if the substrate were an airport app with a general-sounding name,
 * this file would not work.
 *
 * What each axis lands on here:
 *
 *   🌊 Mare        a routing or hedging decision. Rotterdam or Houston, hedged or not.
 *                  Mutually exclusive: the cargo sails to one of them.
 *   🐚 Vongola     the chain of states this book passed through, forkable at any point.
 *   🌈 Arcobaleno  one book at one instant, addressed by its contents.
 *
 * The irreversible action is different from the airport's, deliberately. Publishing an
 * alert is a message; nominating a cargo is a contract. A nomination that has been sent
 * to a counterparty cannot be recalled by deleting a row, which is exactly the class of
 * effect the primary world exists to protect.
 *
 * The coverage gap is different too, and real: some benchmarks trade on an exchange and
 * print continuously, others are assessed once a day by a price reporting agency. A
 * thinly assessed grade has no intraday shape at all — the same hole `GraftCurve` fills
 * at an airport with no queue feed.
 */
import { makeObject, objKey, type OntoObject, type Ontology, type Provenance, type WorldState } from "../runtime";
import { GENESIS_EPOCH_MIN, fmtUtc } from "../time";

const clockOf = (s: WorldState) => Number(s.objects[objKey("Clock", "world")].props.epochMin);
const ofType = (s: WorldState, t: string) => Object.values(s.objects).filter((o) => o.typeId === t);

/** How a price came to exist. The tier does the talking, as with airport queue feeds. */
const PRICING = {
  exchange: { label: "exchange", floor: 0.95, blurb: "continuous, screen-traded" },
  assessed: { label: "assessed", floor: 0.7, blurb: "published once a day by a reporting agency" },
  grafted: { label: "grafted", floor: 0.6, blurb: "shape borrowed from a correlated benchmark" },
  none: { label: "no print", floor: 0.4, blurb: "no public price — netback only" },
} as const;

const GRADES: {
  code: string; name: string; hub: string;
  pricing: keyof typeof PRICING; base: number; apiGravity: number; sulphurPct: number;
}[] = [
  { code: "BRENT", name: "Brent Blend", hub: "North Sea", pricing: "exchange", base: 78.4, apiGravity: 38.3, sulphurPct: 0.37 },
  { code: "WTI", name: "West Texas Intermediate", hub: "Cushing", pricing: "exchange", base: 74.9, apiGravity: 39.6, sulphurPct: 0.24 },
  { code: "DUBAI", name: "Dubai Crude", hub: "Dubai", pricing: "assessed", base: 76.1, apiGravity: 31.0, sulphurPct: 2.0 },
  { code: "URALS", name: "Urals", hub: "Primorsk", pricing: "assessed", base: 63.2, apiGravity: 31.7, sulphurPct: 1.35 },
  { code: "BONNY", name: "Bonny Light", hub: "Bonny", pricing: "none", base: 79.0, apiGravity: 33.4, sulphurPct: 0.16 },
  { code: "TAPIS", name: "Tapis", hub: "Terengganu", pricing: "none", base: 82.5, apiGravity: 45.2, sulphurPct: 0.03 },
];

const ROUTES: { id: string; from: string; to: string; days: number; freightUsdBbl: number }[] = [
  { id: "NS-ROT", from: "North Sea", to: "Rotterdam", days: 3, freightUsdBbl: 0.9 },
  { id: "NS-HOU", from: "North Sea", to: "Houston", days: 16, freightUsdBbl: 2.8 },
  { id: "DXB-SIN", from: "Dubai", to: "Singapore", days: 7, freightUsdBbl: 1.4 },
  { id: "DXB-ROT", from: "Dubai", to: "Rotterdam", days: 21, freightUsdBbl: 3.6 },
];

/**
 * Netback: what the cargo is actually worth delivered, which is the only number a
 * trader acts on. Quality adjustments are declared here rather than folded into a
 * single opaque "fair value" — a differential nobody can see is a differential nobody
 * can argue with.
 */
export function recompute(draft: WorldState) {
  const at = clockOf(draft);

  for (const cargo of ofType(draft, "Cargo")) {
    const grade = draft.objects[objKey("Grade", String(cargo.props.grade))];
    const route = draft.objects[objKey("Route", String(cargo.props.route))];
    if (!grade || !route) continue;

    const price = Number(grade.props.priceUsdBbl);
    // Sweet and light lifts the value; sour and heavy discounts it. Declared coefficients.
    const qualityAdj =
      (Number(grade.props.apiGravity) - 34) * 0.18 - (Number(grade.props.sulphurPct) - 0.5) * 1.6;
    const freight = Number(route.props.freightUsdBbl);
    const netbackUsdBbl = Math.round((price + qualityAdj - freight) * 100) / 100;

    const bbl = Number(cargo.props.barrels);
    const hedged = cargo.props.hedgedAtUsdBbl !== undefined;
    const markUsd = Math.round(netbackUsdBbl * bbl);
    const pnlUsd = hedged
      ? Math.round((Number(cargo.props.hedgedAtUsdBbl) - netbackUsdBbl) * bbl)
      : 0;

    draft.objects[objKey("Cargo", cargo.key)] = makeObject(
      "Cargo", cargo.key,
      {
        ...cargo.props,
        qualityAdjUsdBbl: Math.round(qualityAdj * 100) / 100,
        freightUsdBbl: freight,
        netbackUsdBbl,
        markUsd,
        pnlUsd,
        etaEpochMin: at + Number(route.props.days) * 1440,
        confidencePct: Math.round(100 * PRICING[String(grade.props.pricing) as keyof typeof PRICING].floor),
      },
      cargo.prov,
    );
  }
}

export const OIL_ONTOLOGY: Ontology = {
  version: "oil-v1-sketch",

  objects: [
    { id: "Clock", label: "World clock", keyProp: "id", display: ["utc", "source"] },
    { id: "Grade", label: "Crude grade", keyProp: "code", display: ["hub", "pricing", "priceUsdBbl"] },
    { id: "Route", label: "Voyage route", keyProp: "id", display: ["to", "days", "freightUsdBbl"] },
    { id: "Cargo", label: "Cargo", keyProp: "id", display: ["grade", "route", "netbackUsdBbl"] },
    { id: "Nomination", label: "Nomination", keyProp: "id", display: ["cargo", "counterparty"] },
  ],

  links: [
    { id: "priced_as", label: "priced as", from: "Cargo", to: "Grade" },
    { id: "sails", label: "sails", from: "Cargo", to: "Route" },
    { id: "nominates", label: "nominates", from: "Nomination", to: "Cargo" },
  ],

  actions: [
    {
      id: "MarkPrice",
      label: "Mark a grade",
      effect: "pure",
      touches: ["Grade"],
      note:
        "Move a benchmark and every cargo priced off it re-marks. Pure: it changes the book's view, not the world. An exchange grade prints continuously; an assessed grade is one number a day, and the confidence on anything downstream says which it was.",
      params: {
        grade: { type: "string", label: "Grade", options: GRADES.map((g) => g.code) },
        priceUsdBbl: { type: "number", label: "Price USD/bbl", min: 1, max: 400 },
      },
      requires: [{ objectType: "Grade", keyFromParam: "grade" }],
      handler: (draft, p, prov) => {
        const k = objKey("Grade", p.grade);
        const g = draft.objects[k];
        draft.objects[k] = makeObject("Grade", g.key, { ...g.props, priceUsdBbl: Number(p.priceUsdBbl) }, prov);
        recompute(draft);
      },
    },
    {
      id: "Reroute",
      label: "Reroute a cargo",
      effect: "branchable",
      touches: ["Cargo"],
      note:
        "Rotterdam or Houston. Freight and voyage days change, so the netback changes — and only one of them can actually happen, which is what makes this Mare rather than two rows in a table.",
      params: {
        cargo: { type: "string", label: "Cargo", options: ["C-001", "C-002", "C-003"] },
        route: { type: "string", label: "Route", options: ROUTES.map((r) => r.id) },
      },
      requires: [
        { objectType: "Cargo", keyFromParam: "cargo" },
        { objectType: "Route", keyFromParam: "route" },
      ],
      handler: (draft, p, prov) => {
        const k = objKey("Cargo", p.cargo);
        const c = draft.objects[k];
        draft.objects[k] = makeObject("Cargo", c.key, { ...c.props, route: String(p.route) }, prov);
        draft.links = draft.links.filter((l) => !(l.typeId === "sails" && l.from === k));
        draft.links.push({ typeId: "sails", from: k, to: objKey("Route", String(p.route)) });
        recompute(draft);
      },
    },
    {
      id: "HedgeCargo",
      label: "Hedge a cargo",
      effect: "branchable",
      touches: ["Cargo"],
      note:
        "Lock a price against the cargo. Branchable: a hedge you are considering and a hedge you have put on are different states of the same book, and the point of forking is to hold both.",
      params: {
        cargo: { type: "string", label: "Cargo", options: ["C-001", "C-002", "C-003"] },
        atUsdBbl: { type: "number", label: "Hedge at USD/bbl", min: 1, max: 400 },
      },
      requires: [{ objectType: "Cargo", keyFromParam: "cargo" }],
      handler: (draft, p, prov) => {
        const k = objKey("Cargo", p.cargo);
        const c = draft.objects[k];
        draft.objects[k] = makeObject("Cargo", c.key, { ...c.props, hedgedAtUsdBbl: Number(p.atUsdBbl) }, prov);
        recompute(draft);
      },
    },
    {
      id: "GraftPriceShape",
      label: "Graft a price shape",
      effect: "pure",
      touches: ["Grade"],
      note:
        "A grade with no public print has no shape of its own. Borrow one from a correlated benchmark — what transfers is how the grade moves relative to itself, never the level, and the differential stays this grade's own. Everything downstream is stamped grafted and docked to 60%.",
      params: {
        to: { type: "string", label: "Grade with no print", options: GRADES.filter((g) => g.pricing === "none").map((g) => g.code) },
        from: { type: "string", label: "Borrow the shape from", options: GRADES.filter((g) => g.pricing === "exchange").map((g) => g.code) },
      },
      requires: [
        { objectType: "Grade", keyFromParam: "to" },
        { objectType: "Grade", keyFromParam: "from" },
      ],
      handler: (draft, p, prov) => {
        const src = draft.objects[objKey("Grade", String(p.from))];
        const k = objKey("Grade", String(p.to));
        const g = draft.objects[k];
        draft.objects[k] = makeObject(
          "Grade", g.key,
          { ...g.props, pricing: "grafted", shapeFrom: String(p.from), volatilityRef: String(src.props.code) },
          { ...prov, originKind: "grafted", source: "modelled", via: String(p.from), confidence: 0.6 },
        );
        recompute(draft);
      },
    },
    {
      id: "NominateCargo",
      label: "Nominate a cargo",
      effect: "irreversible",
      touches: ["Nomination"],
      note:
        "A nomination goes to a counterparty and binds. It cannot be recalled by deleting a row, so outside the primary world the runtime computes it and refuses to emit it. This is the same rule as the airport's alert and a heavier consequence — which is the point of the effect class being declared per action rather than assumed per app.",
      params: {
        cargo: { type: "string", label: "Cargo", options: ["C-001", "C-002", "C-003"] },
        counterparty: { type: "string", label: "Counterparty" },
      },
      requires: [{ objectType: "Cargo", keyFromParam: "cargo" }],
      handler: (draft, p, prov) => {
        const id = `N${ofType(draft, "Nomination").length + 1}`;
        draft.objects[objKey("Nomination", id)] = makeObject(
          "Nomination", id,
          { id, cargo: String(p.cargo), counterparty: String(p.counterparty), atEpochMin: clockOf(draft) },
          prov,
        );
        draft.links.push({ typeId: "nominates", from: objKey("Nomination", id), to: objKey("Cargo", String(p.cargo)) });
      },
    },
  ],
};

export function seedOil(prov: Provenance): WorldState {
  const state: WorldState = { objects: {}, links: [] };

  state.objects[objKey("Clock", "world")] = makeObject(
    "Clock", "world",
    { id: "world", epochMin: GENESIS_EPOCH_MIN, utc: fmtUtc(GENESIS_EPOCH_MIN), source: "genesis" },
    prov,
  );

  for (const g of GRADES) {
    state.objects[objKey("Grade", g.code)] = makeObject(
      "Grade", g.code,
      {
        code: g.code, name: g.name, hub: g.hub, pricing: g.pricing,
        priceUsdBbl: g.base, apiGravity: g.apiGravity, sulphurPct: g.sulphurPct,
      },
      { ...prov, source: g.pricing === "exchange" ? "official" : "modelled", confidence: PRICING[g.pricing].floor },
    );
  }

  for (const r of ROUTES) {
    state.objects[objKey("Route", r.id)] = makeObject(
      "Route", r.id, { id: r.id, from: r.from, to: r.to, days: r.days, freightUsdBbl: r.freightUsdBbl }, prov,
    );
  }

  const cargoes: [string, string, string, number][] = [
    ["C-001", "BRENT", "NS-ROT", 600_000],
    ["C-002", "DUBAI", "DXB-SIN", 500_000],
    ["C-003", "BONNY", "NS-HOU", 950_000],
  ];
  for (const [id, grade, route, barrels] of cargoes) {
    state.objects[objKey("Cargo", id)] = makeObject(
      "Cargo", id,
      {
        id, grade, route, barrels,
        qualityAdjUsdBbl: 0, freightUsdBbl: 0, netbackUsdBbl: 0,
        markUsd: 0, pnlUsd: 0, etaEpochMin: 0, confidencePct: 0,
      },
      prov,
    );
    state.links.push({ typeId: "priced_as", from: objKey("Cargo", id), to: objKey("Grade", grade) });
    state.links.push({ typeId: "sails", from: objKey("Cargo", id), to: objKey("Route", route) });
  }

  recompute(state);
  return state;
}

export const OIL_META = {
  slug: "oil",
  name: "Crude book",
  blurb: "Cargoes, benchmarks and voyage routes. Fork the book to price a reroute, and find out that a nomination will not go out from a world that is not real.",
  irreversible: "NominateCargo — a nomination binds a counterparty",
  gap: "assessed and unpriced grades have no intraday shape",
  status: "sketch",
} as const;

export type OilObject = OntoObject;
