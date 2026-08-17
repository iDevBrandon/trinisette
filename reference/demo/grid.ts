/**
 * The Environment × Policy grid, generated from REAL forked worlds — not a spreadsheet.
 * Demand regime is exogenous (set by a declared scenario action); price is the agent's
 * choice (world.hypothesis). Every AcceptBookings is irreversible and therefore
 * suppressed outside the primary world: the counterfactual is computed, the seat is
 * never sold.
 */
import { createPrimary, fork, head, invoke, materialize } from "../src/engine.js";
import { pool } from "../src/store.js";
import { AGENT, ONTOLOGY, PRICES, REGIMES, installFlightOntology, seedFlight } from "./flight.js";

async function main() {
  await installFlightOntology();
  const primary = await createPrimary("AC795-live", {
    agentVersion: AGENT, ontologyVersion: ONTOLOGY, seed: seedFlight(REGIMES.normal),
  });
  const base = await head(primary.world);

  const results: Record<string, Record<number, { revenue: number; load: number; suppressed: boolean }>> = {};

  for (const [regime, demand] of Object.entries(REGIMES)) {
    results[regime] = {} as any;
    for (const price of PRICES) {
      const w = await fork(base, {
        name: `${regime}@${price}`,
        hypothesis: `demand=${regime}, price=$${price}`,
      });
      await invoke(w.world, "AssumeDemandRegime", { flight_no: "AC795", regime_demand: demand }, "experimenter");
      await invoke(w.world, "SetFare", { flight_no: "AC795", price }, "agent");
      const booked = await invoke(w.world, "AcceptBookings", { flight_no: "AC795" }, "agent");

      const st = await materialize(booked.snapshot!);
      const b = st.objects.get("Booking/AC795")!.properties as { sold: number; revenue: number };
      results[regime][price] = {
        revenue: b.revenue, load: b.sold / 180, suppressed: booked.status === "suppressed",
      };
    }
  }

  console.log("\n  Environment × Policy — each cell is a real forked world\n");
  console.log("  regime  " + PRICES.map((p) => `$${p}`.padStart(12)).join(""));
  console.log("  " + "-".repeat(8 + PRICES.length * 12));
  for (const regime of Object.keys(REGIMES)) {
    const best = PRICES.reduce((a, b) => (results[regime][b].revenue > results[regime][a].revenue ? b : a));
    console.log("  " + regime.padEnd(8) +
      PRICES.map((p) => {
        const r = results[regime][p];
        return (r.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 }) + (p === best ? "*" : " ")).padStart(12);
      }).join(""));
    console.log("  " + " ".repeat(8) +
      PRICES.map((p) => `${(results[regime][p].load * 100).toFixed(0)}%`.padStart(12)).join(""));
  }
  console.log("\n  * = revenue-maximising price for that regime");

  const counts = await pool.query(`
    select (select count(*) from world)                                   as worlds,
           (select count(*) from snapshot)                                as snapshots,
           (select count(*) from onto_node where kind='object')           as nodes,
           (select count(*) from onto_content where kind='object')        as payloads,
           (select count(*) from action_invocation)                       as invocations,
           (select count(*) from action_invocation where status='suppressed') as suppressed,
           (select count(*) from cassette)                                as cassette_rows`);
  const c = counts.rows[0];

  console.log(`
  worlds .................. ${c.worlds}   (1 primary + ${Number(c.worlds) - 1} experiments)
  snapshots ............... ${c.snapshots}
  object identity nodes ... ${c.nodes}
  stored payloads ......... ${c.payloads}   ← two-level addressing: ${(100 - Number(c.payloads)/Number(c.nodes)*100).toFixed(0)}% of payloads shared across worlds
  action invocations ...... ${c.invocations}
    of which suppressed ... ${c.suppressed}   ← irreversible AcceptBookings outside primary
  cassette recordings ..... ${c.cassette_rows}

  Every seat sale in the ${Number(c.worlds) - 1} experiment worlds was suppressed by the
  schema trigger, not by convention. No seat was sold to compute this grid.
`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
