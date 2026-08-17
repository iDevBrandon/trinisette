# Trinisette

**A branching state substrate that lets AI agents execute, reproduce, and transfer
experience across parallel worlds and time.**

> Foundry is an ontology with a what-if feature attached.
> Trinisette is a branching substrate with an ontology on top.

|                | Source meaning                             | Here                                        |
| -------------- | ------------------------------------------ | ------------------------------------------- |
| **Mare**       | The horizontal axis across parallel worlds | `World` — an isolated, forkable branch      |
| **Vongola**    | The vertical axis from past to future      | `Lineage` — inheritance through time        |
| **Arcobaleno** | A point at a specific place in space-time  | `AgentState` — a snapshot at `(World, seq)` |

Experience is not a fourth primitive: it is inheritance pointed sideways, and it makes
the snapshot graph a DAG rather than a tree. See `docs/architecture.md` §1.4.

## Status

Phases 0–3 implemented and passing. Phase 4 (`graft`, `promote`) is enforced at the
schema level but not yet wired into the TypeScript engine.

## Run it

```bash
npm install
createdb trinisette && psql -d trinisette -f schema.sql
npm test     # 21 engine tests, incl. the §9.1 determinism acceptance test
npm run grid # 16 real forked worlds → the Environment × Policy grid
psql -d trinisette_fresh -f test/invariants.sql   # 24 schema-level invariant tests
```

## The acceptance test

The milestone is not that `fork()` returns. It is that forking, diverging, and
replaying leaves the original **bit-identical** — checkable as hash equality, because
snapshots are content-addressed.

```
s_a  = invoke(A, SetFare, price=504)
B    = fork(A, at=s_a)
s_b  = invoke(B, SetFare, price=420)   →  s_b.id ≠ s_a.id
s_a2 = replay(A, ..., to=s_a)          →  s_a2.id == s_a.id
```

## Layout

```
schema.sql            the whole storage model, extracted from the architecture doc
src/canonical.ts      deterministic encoding — the foundation of every hash
src/store.ts          two-level content addressing (payload shared, identity per-world)
src/ontology.ts       object / link / action type registry and validation
src/engine.ts         worlds, actions, snapshots, replay
src/cassette.ts       recorded non-determinism, so replay is reproducible
demo/flight.ts        the flight-pricing ontology
demo/grid.ts          Environment × Policy across 16 forked worlds
docs/architecture.md  the design, with ADRs and an explicit list of what breaks
```
