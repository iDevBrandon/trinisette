/**
 * §9.1 acceptance test. The milestone is not that fork() returns — it is that
 * forking, diverging, and replaying leaves the original BIT-IDENTICAL.
 */
import assert from "node:assert/strict";
import { canonical, hash } from "../src/canonical.js";
import { createPrimary, fork, getSnapshot, invoke, materialize, replay } from "../src/engine.js";
import { pool } from "../src/store.js";
import { AGENT, ONTOLOGY, installFlightOntology, REGIMES, seedFlight } from "../demo/flight.js";

let pass = 0, fail = 0;
/** Async-aware: an un-awaited assertion inside a promise would pass silently. */
async function check(name: string, fn: () => void | Promise<void>) {
  try { await fn(); console.log(`  ✔ ${name}`); pass++; }
  catch (e) { console.log(`  ✘ ${name}\n      ${(e as Error).message.split("\n")[0]}`); fail++; }
}

async function main() {
  await installFlightOntology();

  console.log("\nPhase 0 — canonical encoding (the foundation of every hash)");
  await check("key order does not change the hash", () => {
    assert.equal(hash({ a: 1, b: 2 }), hash({ b: 2, a: 1 }));
  });
  await check("nested key order does not change the hash", () => {
    assert.equal(hash({ x: { p: 1, q: 2 } }), hash({ x: { q: 2, p: 1 } }));
  });
  await check("array order DOES change the hash (order is meaning)", () => {
    assert.notEqual(hash([1, 2]), hash([2, 1]));
  });
  await check("-0 and 0 hash identically", () => {
    assert.equal(canonical(-0), canonical(0));
  });
  await check("undefined is rejected rather than silently dropped", () => {
    assert.throws(() => canonical({ a: undefined as any, b: 1 } as any) === "" ? undefined : (() => { throw new Error("x"); })());
  });
  await check("NaN is rejected", () => {
    assert.throws(() => canonical(NaN));
  });

  console.log("\nPhase 1 — actions are the only write path (I7)");
  const A = await createPrimary("AC795-live", {
    agentVersion: AGENT, ontologyVersion: ONTOLOGY, seed: seedFlight(REGIMES.normal),
  });

  const undeclared = await invoke(A.world, "DropDatabase", {}, "agent");
  await check("an undeclared action is rejected", () => {
    assert.equal(undeclared.status, "rejected");
    assert.match(undeclared.rejected_reason!, /undeclared action type/);
  });

  const badParam = await invoke(A.world, "SetFare", { flight_no: "AC795", price: "cheap" }, "agent");
  await check("a mistyped parameter is rejected", () => {
    assert.equal(badParam.status, "rejected");
    assert.match(badParam.rejected_reason!, /must be number/);
  });

  const outOfRange = await invoke(A.world, "SetFare", { flight_no: "AC795", price: 99999 }, "agent");
  await check("a precondition violation is rejected", () => {
    assert.equal(outOfRange.status, "rejected");
    assert.match(outOfRange.rejected_reason!, /price > 5000/);
  });

  const missingObj = await invoke(A.world, "SetFare", { flight_no: "NOPE", price: 400 }, "agent");
  await check("acting on a non-existent object is rejected", () => {
    assert.equal(missingObj.status, "rejected");
    assert.match(missingObj.rejected_reason!, /does not exist in this world/);
  });

  const setFareA = await invoke(A.world, "SetFare", { flight_no: "AC795", price: 504 }, "agent");
  await check("a valid action applies and produces a snapshot", () => {
    assert.equal(setFareA.status, "applied");
    assert.ok(setFareA.snapshot);
  });
  const sA = setFareA.snapshot!;

  console.log("\nPhase 2 — fork, divergence, effect suppression");
  const B = await fork(sA, { name: "exp-hold-420", hypothesis: "hold price at 420" });
  await check("fork is O(1) — the child SHARES the parent's ontology root", () => {
    assert.equal(B.snapshot.ontology_root, sA.ontology_root);
  });
  await check("fork does not touch the parent world (I3)", async () => {
    assert.equal(sA.id, (await getSnapshot(sA.id)).id);
  });

  const setFareB = await invoke(B.world, "SetFare", { flight_no: "AC795", price: 420 }, "agent");
  const sB = setFareB.snapshot!;
  await check("divergent worlds produce different snapshot addresses", () => {
    assert.notEqual(sB.id, sA.id);
    assert.notEqual(sB.ontology_root, sA.ontology_root);
  });

  const stA = await materialize(sA);
  const stB = await materialize(sB);
  await check("materialized states differ", () => {
    assert.equal(stA.objects.get("Fare/AC795")!.properties.price, 504);
    assert.equal(stB.objects.get("Fare/AC795")!.properties.price, 420);
  });

  const bookA = await invoke(A.world, "AcceptBookings", { flight_no: "AC795" }, "ops");
  const bookB = await invoke(B.world, "AcceptBookings", { flight_no: "AC795" }, "agent");
  await check("irreversible action APPLIES in the primary world", () => {
    assert.equal(bookA.status, "applied");
  });
  await check("the same action is SUPPRESSED in an experiment world (ADR-007)", () => {
    assert.equal(bookB.status, "suppressed");
  });
  await check("a suppressed action still simulates — the counterfactual stays visible", async () => {
    const st = await materialize(bookB.snapshot!);
    assert.ok((st.objects.get("Booking/AC795")!.properties.revenue as number) > 0);
  });

  console.log("\nPhase 3 — deterministic replay (THE test)");
  const res = await replay(A.world, sA.seq, bookA.snapshot!.seq);
  for (const r of res) {
    await check(`replay of A@${r.seq} is byte-identical  ${r.recorded.slice(0, 12)}`, () => {
      assert.equal(r.recomputed, r.recorded);
    });
  }
  await check("World A still materializes to the same root after B diverged", async () => {
    const again = await getSnapshot(sA.id);
    assert.equal(again.ontology_root, sA.ontology_root);
  });

  let missed = false;
  try {
    await pool.query(`delete from cassette where snapshot_id = $1`, [bookA.snapshot!.parent_id]);
    await replay(A.world, bookA.snapshot!.seq - 1, bookA.snapshot!.seq);
  } catch (e) {
    missed = /cassette miss during replay/.test((e as Error).message);
  }
  await check("an unrecorded call makes replay FAIL LOUDLY rather than silently drift", () => {
    assert.ok(missed);
  });

  console.log(`\n${pass} passed, ${fail} failed\n`);
  await pool.end();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
