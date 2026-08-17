import { defineOntology } from "../src/ontology.js";
import { makeObject } from "../src/store.js";
import { registerHandler } from "../src/engine.js";
import type { WorldState } from "../src/types.js";

export const ONTOLOGY = "flight-v1";
export const AGENT = "pricer-v1";

/** Demand regimes are EXOGENOUS — the environment axis, not the agent's choice. */
export const REGIMES = { high: 210, normal: 145, low: 95 } as const;
export const PRICES = [280, 336, 420, 504, 620];
export const SEATS = 180;
const REF_PRICE = 420;
const ELASTICITY = 1.4;

/** Constant-elasticity demand. Deterministic given (regime, price) — but routed
 *  through the cassette anyway, because in production this is a model call. */
export function demandFor(regimeDemand: number, price: number): number {
  return Math.min(regimeDemand * Math.pow(price / REF_PRICE, -ELASTICITY), SEATS);
}

export async function installFlightOntology(): Promise<void> {
  await defineOntology(ONTOLOGY, {
    objects: [
      { id: "Flight", name: "Flight", key_property: "flight_no",
        properties: { flight_no: { type: "string" }, regime_demand: { type: "number" }, seats: { type: "number" } } },
      { id: "Fare", name: "Fare", key_property: "flight_no",
        properties: { flight_no: { type: "string" }, price: { type: "number" } } },
      { id: "Booking", name: "Booking", key_property: "flight_no",
        properties: { flight_no: { type: "string" }, sold: { type: "number" }, revenue: { type: "number" } } },
      { id: "MarketFact", name: "MarketFact", key_property: "fact_id",
        properties: { fact_id: { type: "string" }, text: { type: "string" } } },
    ],
    links: [
      { id: "fare_for", name: "Fare for Flight", from_type: "Fare", to_type: "Flight", cardinality: "one_to_many" },
    ],
    actions: [
      { id: "SetFare", name: "Set fare", effect_class: "branchable",
        parameters: { flight_no: { type: "string" }, price: { type: "number" } },
        touches: ["Fare"],
        validation: [
          { kind: "object_exists", object_type: "Flight", key_from_param: "flight_no" },
          { kind: "param_range", param: "price", min: 50, max: 5000 },
        ] },
      // Selling a seat cannot be undone. In every non-primary world this is suppressed.
      { id: "AcceptBookings", name: "Accept bookings", effect_class: "irreversible",
        parameters: { flight_no: { type: "string" } },
        touches: ["Booking"],
        validation: [{ kind: "object_exists", object_type: "Fare", key_from_param: "flight_no" }] },
      { id: "RecordMarketFact", name: "Record market fact", effect_class: "pure",
        parameters: { fact_id: { type: "string" }, text: { type: "string" } },
        touches: ["MarketFact"] },
      // Setting the ENVIRONMENT is itself a declared action, so the exogenous axis is
      // audited and visible in lineage rather than being smuggled in as setup.
      { id: "AssumeDemandRegime", name: "Assume demand regime", effect_class: "pure",
        parameters: { flight_no: { type: "string" }, regime_demand: { type: "number" } },
        touches: ["Flight"],
        validation: [{ kind: "object_exists", object_type: "Flight", key_from_param: "flight_no" }] },
    ],
  });

  registerHandler("AssumeDemandRegime", (ctx, p, state: WorldState) => {
    const f = state.objects.get(`Flight/${p.flight_no}`)!;
    state.objects.set(`Flight/${p.flight_no}`,
      makeObject("Flight", p.flight_no,
        { ...f.properties, regime_demand: p.regime_demand }, ctx.prov(ctx.worldId)));
  });

  registerHandler("SetFare", (ctx, p, state: WorldState) => {
    state.objects.set(`Fare/${p.flight_no}`,
      makeObject("Fare", p.flight_no, { flight_no: p.flight_no, price: p.price }, ctx.prov(ctx.worldId)));
  });

  registerHandler("AcceptBookings", async (ctx, p, state: WorldState) => {
    const flight = state.objects.get(`Flight/${p.flight_no}`)!;
    const fare = state.objects.get(`Fare/${p.flight_no}`)!;
    const price = fare.properties.price as number;
    const regime = flight.properties.regime_demand as number;

    // Non-deterministic in production (a demand model / market call), so it goes
    // through the cassette. Replay must NOT re-run it.
    const sold = await ctx.nd({ call: "demand_model", flight: p.flight_no, price, regime },
      () => demandFor(regime, price));

    state.objects.set(`Booking/${p.flight_no}`,
      makeObject("Booking", p.flight_no,
        { flight_no: p.flight_no, sold: Math.round(sold * 100) / 100, revenue: Math.round(price * sold * 100) / 100 },
        ctx.prov(ctx.worldId)));
  });

  registerHandler("RecordMarketFact", (ctx, p, state: WorldState) => {
    state.objects.set(`MarketFact/${p.fact_id}`,
      makeObject("MarketFact", p.fact_id, { fact_id: p.fact_id, text: p.text }, ctx.prov(ctx.worldId)));
  });
}

export function seedFlight(regimeDemand: number) {
  return (worldId: string): WorldState => {
    const objects = new Map();
    objects.set("Flight/AC795", makeObject("Flight", "AC795",
      { flight_no: "AC795", regime_demand: regimeDemand, seats: SEATS },
      { origin_world_id: worldId, origin_snapshot: "genesis", origin_kind: "native" }));
    return { objects, links: new Map() };
  };
}
