# Trinisette — Architecture

**Status:** Proposed
**Date:** 2026-08-17 (rev. 3 — experience as lateral inheritance)

> **Trinisette is a branching state substrate that lets AI agents execute, reproduce, and transfer experience across parallel worlds and time.**

**Thesis:** Foundry is an ontology with a what-if feature attached. Trinisette is a branching substrate with an ontology on top.

---

## 1. The idea, stated as infrastructure

Three orthogonal concerns, named after the three sets in the source material:

| Component      | Source meaning                                     | Infrastructure concern                                               |
| -------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| **Mare**       | The horizontal axis across parallel worlds         | **World** — an isolated, forkable branch of reality                  |
| **Vongola**    | The vertical axis from past to future              | **Lineage** — the inheritance of state and experience over time      |
| **Arcobaleno** | A point existing at a specific place in space-time | **Agent State** — a materialized snapshot at a given `(World, Time)` |

The one-line compression:

> Mare divides worlds, Vongola carries experience through time, and Arcobaleno is the agent's state at a given point in that world and time.

That is a good metaphor. What follows is the part that makes it a system rather than a diagram: **an addressing scheme, a set of invariants, and an explicit account of what breaks.**

### 1.1 The coordinate system

Every state is uniquely addressed:

```
snapshot_id = H(world_id, seq, agent_version, ontology_version, ontology_root, cause)
```

`snapshot_id` is the canonical address — a content hash. `(world_id, seq)` is the human-readable index into it, and is unique.

```
                              seq (Vongola: time)
                     0 ──────► 1 ──────► 2 ──────► 3 ──────► 4
                     │         │         │         │         │
   World A (primary) ●─────────●─────────●─────────●─────────●
                               │
                               └── fork at (A, 1)
                                   │
   World B (experiment)            ●─────────●─────────●
                                   0         1         2
                                             │
                                   graft ────┘  objects from (A, 3)
                                                arrive tagged, not silently

   ● = Arcobaleno: one materialized state = one snapshot
```

Forking is horizontal (Mare). Advancing is vertical (Vongola). A dot is a state (Arcobaleno). Grafting is the diagonal — and it is the dangerous one, handled in ADR-003.

### 1.2 One correction to the original mapping

The concept collapses two things into "Vongola" that behave differently and must be modeled separately:

- **Step time** (`seq`) — the agent acting inside a world. Monotonic, append-only, cheap.
- **Agent version** (`agent_version`) — the code, prompt, and tool set changing underneath the state. Rare, expensive, and it can invalidate the state schema.

Vongola's actual promise is the _second_ one: **experience survives the generation change**. `Agent v1 → v2 → v3` with state running underneath is a schema-migration problem, not a timestamp problem. Treating them as one axis means the first time you change the state format, every historical snapshot becomes unreadable and the lineage guarantee silently evaporates.

So: `agent_version` is a field on the snapshot, not a third axis, and version bumps are ordinary events in the world's timeline that happen to carry a migration.

### 1.3 Positioning: what this is relative to Palantir's Ontology

Palantir's Ontology is three layers — **Objects and Links** (the semantic model), **Actions** (the governed write path), and **Scenarios** (what-if branches over the object data). Trinisette needs all three. The difference is which one is load-bearing.

Foundry Scenarios are a fork of ontology data that stores only the diff from the baseline — the same copy-on-write idea used here — but they are sized for a person clicking through an application. The documented limits are **30,000 edits, 50 Actions, and 10,000 objects loaded per scenario**. A pricing agent running a sixty-day booking curve across nine worlds exhausts the Action budget before it starts.

The priority is inverted, and the reason it matters is that **agents produce branches at machine rate.** Every choice already made here — content-addressed CoW, `O(1)` fork, a snapshot per step, recorded non-determinism — is a choice sized for machine-scale branching. That is the empty seat.

The shapes differ, not just the ordering:

```
   Palantir — a stack                Trinisette — a loop
   ─────────────────────             ────────────────────────────
   Data                                     Ontology
     ↓                                          │
   Ontology                                     ↓
     ↓                                World ──► Agent ──► Action
   Actions                              ▲                   │
     ↓                                  │                   ↓
   Scenarios                            │                Outcome
     ↓                                  │                   │
   AI Agents                            │                   ↓
                                        └──── Experience ◄──┘
                                          (cross-world transfer)

   terminates at the top             the feedback edge is the product
```

Palantir structures **the** world. Trinisette executes **possible** worlds and structures what comes back. The closing edge — Experience returning to a different World — is the part no layer stack has, and §1.4 is about what it actually is.

What this is _not_: a competitor to Foundry's integration layer (§7.1), and not a Monte Carlo engine (§1.5).

### 1.4 Experience is not a fourth primitive — it is the lateral inheritance edge

The tempting move is to promote Experience to sit beside World and Lineage: `World + Lineage + Experience`. That names the right thing but puts it in the wrong slot, because Experience is not orthogonal to the other two. It has no axis of its own; it is what _moves between_ points on the existing axes.

The accurate version is one step further. Draw the snapshot graph and there are two kinds of edge, not one:

```
              World A                        World B
                 │                              │
   seq 2         ●                              ●   seq 0
                 │  ╲                           │
        Vongola  │    ╲  Experience             │  Vongola
      (temporal) │      ╲   (lateral)           │ (temporal)
                 ↓        ╲                     ↓
   seq 3         ●          ─────────────────►  ●   seq 1
                                                     ▲
                                        two parents: temporal + lateral
```

- **Vongola** is the _vertical_ edge: a snapshot inherits from its predecessor in the same world.
- **Experience** is the _horizontal_ edge: a snapshot inherits from a snapshot in another world.

So the real primitive is **inheritance**, and it has two directions. Mare and Vongola are the axes; Arcobaleno is what inherits; Experience is inheritance pointed sideways. Arcobaleno stays as the addressed point, because addressing is what makes the whole system coherent — losing it to make room for Experience would trade the foundation for the facade.

**This has a concrete consequence, and it exposes a gap in rev. 2.** A snapshot produced by a graft genuinely has **two** ancestors: its temporal parent and its lateral source. Rev. 2 stored `parent_id` on the snapshot but left the lateral edge in the `graft` table, outside the lineage — so `ancestors(snapshot)` silently returned an incomplete answer, and any provenance audit that walked lineage would miss exactly the imports most worth auditing.

Fixed in §4 with `lateral_source_id` on `snapshot` and an `ancestry` view that walks both edges. **The snapshot graph is a DAG, not a tree.**

### 1.5 This is not Monte Carlo

`parallel worlds` invites the reading that this is a sampler. It is not, and the distinction is sharp:

|                                 | Monte Carlo                        | Trinisette                                |
| ------------------------------- | ---------------------------------- | ----------------------------------------- |
| What a world is                 | An i.i.d. draw                     | A named intervention (`world.hypothesis`) |
| Are worlds interchangeable?     | Yes — that is the point            | No — each answers a different question    |
| Output                          | A distribution                     | A decision, plus transferable knowledge   |
| One world learning from another | **A bug.** It biases the estimator | **The product.** It is why graft exists   |

That last row is the whole difference, and it explains a design choice already in the document: `world.contaminated` is the seam where the two paradigms meet. A contaminated world is excluded from _statistical_ comparison against a baseline — because there the Monte Carlo objection applies exactly — while remaining fully valuable _operationally_, because the transfer is the thing being purchased.

Sampling is a use case. Experience transfer is the thesis.

---

## 2. Invariants

These are the load-bearing claims. If an implementation violates one, the coordinate system stops meaning anything.

| #      | Invariant                                                                 | Why it matters                                                        |
| ------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **I1** | Snapshots are immutable and content-addressed                             | An address always resolves to the same bytes                          |
| **I2** | Worlds are append-only; `advance` never rewrites                          | History cannot be retconned                                           |
| **I3** | `fork(W, s)` cannot affect `W`                                            | Experiments are safe by construction                                  |
| **I4** | `materialize(sid)` is deterministic and idempotent                        | A point is reproducible, not merely recorded                          |
| **I5** | Every object and link carries provenance back to an origin `(world, seq)` | No anonymous state, so contamination is always traceable              |
| **I6** | Irreversible effects may only be applied from the primary world           | Forking the agent does not fork the outside world                     |
| **I7** | The ontology can only be mutated by a declared Action                     | An agent cannot write anything nobody typed in advance                |
| **I8** | **Every cross-world transfer is a lateral edge in the snapshot graph**    | Lineage traversal sees imports; provenance audits are complete (§1.4) |

**I4 and I7 are the two that are easy to skip and fatal to skip.** A snapshot referencing an LLM call whose response was not recorded is not a point in space-time; it is a note about one. And an agent that can write arbitrary state is not governed by anything, no matter how good the audit log is.

---

## 3. Data model

### 3.1 Two layers, scoped differently

This is the central structural decision of the ontology work.

| Layer        | Contents                               | Scope                 | Mutability                       |
| ------------ | -------------------------------------- | --------------------- | -------------------------------- |
| **Schema**   | object types, link types, action types | **Global**, versioned | Immutable per `ontology_version` |
| **Instance** | actual objects and links               | **Per world**         | Content-addressed, copy-on-write |

Schema must be global. Two worlds running different object types are not comparable — the whole point of a world is that it is a counterfactual of another one, and a counterfactual requires a shared frame. Instance data must be per-world, because that is what a fork forks.

### 3.2 Agent memory is not a separate store

With typed objects, there is no `memory` table. Agent memory is ontology objects of certain types — `Observation`, `Belief`, `Decision` — sitting in the same Merkle tree as `Flight` and `Booking`. This is a real simplification the ontology layer buys, and it means provenance, grafting, and diffing work identically for what the agent believes and for what the business owns.

### 3.3 Entities

**`world`** (Mare) — a branch. Has a parent and a fork point, except for the root. Exactly one world is `primary`: the only one permitted to emit irreversible effects.

**`snapshot`** (Arcobaleno) — one point. Immutable. Pins an `ontology_version`, an `agent_version`, and an `ontology_root`.

**`onto_node`** — the content-addressed Merkle DAG holding trees, objects, and links. Because it is content-addressed and copy-on-write, forking a world is `O(1)`: the child shares every unchanged node with the parent, and only diverging paths allocate.

**`action_type`** — a _declared_ mutation: typed parameters, validation rules, which object types it may touch, its effect class, and who may invoke it. Declared before anything runs.

**`action_invocation`** — one attempt to run one action in one world. Carries `snapshot_before` and `snapshot_after`, and can be `rejected` before it ever produces a snapshot.

**`graft`** — an audited transfer of objects from one world into another.

**`cassette`** — recorded non-deterministic I/O (LLM completions, external reads) keyed to the snapshot that made the call. This is what makes I4 true.

### 3.4 Provenance is part of identity — but not part of the payload

Two objects with identical properties but different origin worlds are **not** the same object, because where a fact came from is part of what the fact means. Storing provenance in a side table keyed by hash would silently unify them and destroy the audit trail the moment two worlds converge on the same conclusion.

Taken naively, that requirement destroys cross-world deduplication: if provenance is mixed into one hash, no two worlds can ever share a node, and ADR-002's structural sharing evaporates. **Measured on the 16-world flight grid, that is exactly what happened — 46 stored objects for 21 distinct facts, zero sharing.**

So identity is split across two levels:

```
   onto_content     content_hash = H(type, keys, properties)      ← shared by every world
        ▲
        │ referenced by
        │
   onto_node        hash = H(content_hash, provenance)            ← unique per world
```

The heavy payload lives once under `content_hash`. The per-world envelope is a pointer plus a provenance stamp. Both properties hold at once: identity is provenance-sensitive, storage is not.

**Measured effect on the same grid: 46 nodes → 21 stored payloads.** Sharing rises with the number of worlds, which is the regime this system is built for.

### 3.5 Why nodes are not foreign-keyed to types

An `onto_node` names its `type_id` but is **not** foreign-keyed to `object_type`. A node is version-agnostic — the same `Flight` object can be valid under ontology `v3` and `v4`. Type validation happens when a node is attached to a snapshot under a specific `ontology_version`, not when the node is stored. Foreign-keying it would make every schema bump rewrite the entire content-addressed store, which defeats the point of content addressing.

---

## 4. Storage schema (PostgreSQL)

```sql
-- ═════════════════════════════════════════════════════════════
-- SCHEMA LAYER — global, versioned, immutable per version
-- ═════════════════════════════════════════════════════════════

create table ontology_version (
  id          text primary key,               -- semver or content hash
  status      text not null default 'draft'
                check (status in ('draft','active','superseded')),
  notes       text,
  created_at  timestamptz not null default now()
);

create table object_type (
  id                text not null,
  ontology_version  text not null references ontology_version (id),
  name              text not null,
  key_property      text not null,            -- the stable business key
  properties        jsonb not null,           -- {prop: {type, required}}
  primary key (id, ontology_version)
);

create table link_type (
  id                text not null,
  ontology_version  text not null references ontology_version (id),
  name              text not null,
  from_type         text not null,
  to_type           text not null,
  cardinality       text not null
                      check (cardinality in ('one_to_one','one_to_many','many_to_many')),
  primary key (id, ontology_version),
  foreign key (from_type, ontology_version) references object_type (id, ontology_version),
  foreign key (to_type,   ontology_version) references object_type (id, ontology_version)
);

-- I7: the only sanctioned way to change anything
create table action_type (
  id                text not null,
  ontology_version  text not null references ontology_version (id),
  name              text not null,
  parameters        jsonb not null,           -- typed parameter schema
  touches           text[] not null,          -- object_type ids it may modify
  validation        jsonb not null default '[]',  -- declarative preconditions
  effect_class      text not null
                      check (effect_class in ('pure','branchable','irreversible')),
  required_role     text,
  primary key (id, ontology_version)
);

-- ═════════════════════════════════════════════════════════════
-- MARE — parallel worlds
-- ═════════════════════════════════════════════════════════════

create table world (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  parent_world_id  uuid references world (id),
  fork_point       text,                      -- FK to snapshot, added below
  kind             text not null check (kind in ('primary','experiment','replay','shadow')),
  hypothesis       text,                      -- the intervention that defines this world
  contaminated     boolean not null default false,
  status           text not null default 'active'
                     check (status in ('active','sealed','archived')),
  created_at       timestamptz not null default now(),

  constraint root_or_forked check (
    (parent_world_id is null and fork_point is null) or
    (parent_world_id is not null and fork_point is not null)
  )
);

create unique index world_one_primary on world (kind) where kind = 'primary';
create index world_parent_idx on world (parent_world_id);

-- ═════════════════════════════════════════════════════════════
-- INSTANCE LAYER — content-addressed Merkle DAG, copy-on-write
-- ═════════════════════════════════════════════════════════════

-- LEVEL 1 — payload, addressed by content ALONE. Provenance deliberately absent, so
-- the same fact known in twenty worlds is stored exactly once (§3.4, ADR-002).
create table onto_content (
  content_hash text primary key,         -- H(kind, type_id, keys, properties)
  kind         text not null check (kind in ('object','link')),
  type_id      text not null,            -- see §3.5, deliberately not FK'd
  object_key   text,                     -- kind='object'
  from_key     text,                     -- kind='link'
  to_key       text,                     -- kind='link'
  properties   jsonb not null,
  bytes        integer not null,

  constraint content_shape check (
    case kind
      when 'object' then object_key is not null and from_key is null and to_key is null
      when 'link'   then from_key is not null and to_key is not null and object_key is null
    end
  )
);

create index onto_content_key_idx on onto_content (type_id, object_key) where kind = 'object';

-- LEVEL 2 — the identity envelope. Thin: a pointer plus provenance. THIS is what a
-- world's Merkle tree holds, so two worlds that know the same fact still get distinct
-- nodes (identity differs) while sharing the payload (content is equal).
create table onto_node (
  hash         text primary key,         -- H(content_hash, provenance)
  kind         text not null check (kind in ('tree','object','link')),
  children     text[],                   -- kind='tree'
  content_hash text references onto_content (content_hash),
  provenance   jsonb,
  bytes        integer not null,

  constraint shape check (
    case kind
      when 'tree' then children is not null and content_hash is null and provenance is null
      else             children is null and content_hash is not null and provenance is not null
    end
  ),
  -- I5: provenance is mandatory on every leaf and is hashed into the node address.
  -- Note the explicit null guards and the coalesce: in SQL a CHECK passes when it
  -- evaluates to NULL, so `provenance ? 'k'` on a null column would silently admit
  -- an anonymous object. Every branch here must return true or false, never null.
  constraint provenance_present check (
    kind = 'tree' or (
      provenance is not null and
      provenance ? 'origin_world_id' and
      provenance ? 'origin_snapshot' and
      coalesce(provenance ->> 'origin_kind', '') in ('native','grafted','synthesized')
    )
  )
);

create index onto_node_content_idx on onto_node (content_hash);

-- ═════════════════════════════════════════════════════════════
-- VONGOLA — the timeline within a world
-- ═════════════════════════════════════════════════════════════

create table snapshot (
  id                text primary key,        -- content hash; I1
  world_id          uuid not null references world (id),
  seq               bigint not null,         -- monotonic step index within the world
  parent_id         text references snapshot (id),        -- VONGOLA: temporal edge
  lateral_source_id text references snapshot (id),        -- EXPERIENCE: cross-world edge, §1.4
  agent_version     text not null,           -- code/prompt generation, §1.2
  ontology_version  text not null references ontology_version (id),
  ontology_root     text not null references onto_node (hash),
  cause             jsonb not null,          -- the event that produced this step
  deterministic     boolean not null default false,  -- true once the cassette is complete; I4
  created_at        timestamptz not null default now(),

  unique (world_id, seq),
  -- a lateral edge must actually cross worlds, or it is just a confusing temporal edge
  constraint lateral_crosses_worlds check (lateral_source_id is null or lateral_source_id <> id)
);

create index snapshot_world_seq_idx on snapshot (world_id, seq desc);
create index snapshot_lateral_idx on snapshot (lateral_source_id) where lateral_source_id is not null;
alter table world add constraint world_fork_point_fk
  foreign key (fork_point) references snapshot (id);

-- I8: the lateral source must live in a DIFFERENT world. Enforced as a trigger because
-- the check needs a lookup, and a CHECK constraint cannot query another row.
create or replace function lateral_source_is_foreign() returns trigger
language plpgsql as $$
begin
  if new.lateral_source_id is not null
     and (select world_id from snapshot where id = new.lateral_source_id) = new.world_id then
    raise exception 'lateral source % is in the same world % — that is a temporal edge, not experience',
      new.lateral_source_id, new.world_id;
  end if;
  return new;
end $$;

create trigger lateral_source_trg
  before insert or update on snapshot
  for each row execute function lateral_source_is_foreign();

-- §1.4: lineage traversal MUST follow both edges, or provenance audits miss every import.
-- Note the single self-reference: Postgres permits the recursive term to name the view
-- exactly once, so both edge kinds are unrolled with a lateral VALUES rather than two
-- separate recursive branches. `path_kind` latches to 'lateral' once a path has crossed
-- a world, so one query answers "did this state ever come from somewhere else?"
create recursive view ancestry (snapshot_id, ancestor_id, depth, path_kind) as
    select s.id, e.ancestor, 1, e.kind
      from snapshot s
      cross join lateral (values (s.parent_id, 'temporal'), (s.lateral_source_id, 'lateral'))
        as e(ancestor, kind)
     where e.ancestor is not null
  union all
    select a.snapshot_id, e.ancestor, a.depth + 1,
           case when e.kind = 'lateral' then 'lateral' else a.path_kind end
      from ancestry a
      join snapshot s on s.id = a.ancestor_id
      cross join lateral (values (s.parent_id, 'temporal'), (s.lateral_source_id, 'lateral'))
        as e(ancestor, kind)
     where e.ancestor is not null;

-- ═════════════════════════════════════════════════════════════
-- ACTIONS — the only write path (I7)
-- ═════════════════════════════════════════════════════════════

create table action_invocation (
  id                uuid primary key default gen_random_uuid(),
  world_id          uuid not null references world (id),
  action_type_id    text not null,
  ontology_version  text not null,
  parameters        jsonb not null,
  snapshot_before   text not null references snapshot (id),
  snapshot_after    text references snapshot (id),   -- null unless applied
  status            text not null default 'proposed'
                      check (status in ('proposed','rejected','applied','suppressed','failed')),
  rejected_reason   text,
  invoked_by        text not null,                   -- agent id or human principal
  created_at        timestamptz not null default now(),

  foreign key (action_type_id, ontology_version)
    references action_type (id, ontology_version),

  -- A suppressed action still CHANGES THE WORLD — the external effect is withheld,
  -- but the simulated state change is the whole reason the counterfactual is worth
  -- running. So 'suppressed' produces a snapshot exactly like 'applied' does; only
  -- 'proposed', 'rejected' and 'failed' leave the world untouched.
  constraint result_iff_state_changed check (
    (status in ('applied','suppressed')) = (snapshot_after is not null)
  ),
  constraint rejected_has_reason check (
    status <> 'rejected' or rejected_reason is not null
  )
);

create index action_world_idx on action_invocation (world_id, created_at desc);

-- I6: effect_class is read from the DECLARATION, never from the invocation,
--     so it cannot be spoofed by the caller.
create or replace function action_guard() returns trigger
language plpgsql as $$
declare
  declared_class text;
  world_kind     text;
begin
  select effect_class into declared_class
    from action_type
   where id = new.action_type_id and ontology_version = new.ontology_version;

  select kind into world_kind from world where id = new.world_id;

  if declared_class = 'irreversible'
     and new.status = 'applied'
     and world_kind <> 'primary' then
    raise exception
      'irreversible action % cannot be applied from a non-primary world %',
      new.action_type_id, new.world_id;
  end if;
  return new;
end $$;

create trigger action_guard_trg
  before insert or update on action_invocation
  for each row execute function action_guard();

-- The snapshot an action produced must belong to the world it ran in.
create or replace function action_world_match() returns trigger
language plpgsql as $$
begin
  if new.snapshot_after is not null
     and (select world_id from snapshot where id = new.snapshot_after) <> new.world_id then
    raise exception 'action result snapshot % does not belong to world %',
      new.snapshot_after, new.world_id;
  end if;
  return new;
end $$;

create trigger action_world_match_trg
  before insert or update on action_invocation
  for each row execute function action_world_match();

-- ═════════════════════════════════════════════════════════════
-- MARE — cross-world transfer, and promotion to primary
-- ═════════════════════════════════════════════════════════════

create table graft (
  id                uuid primary key default gen_random_uuid(),
  source_snapshot   text not null references snapshot (id),
  target_world_id   uuid not null references world (id),
  result_snapshot   text not null references snapshot (id),
  selector          jsonb not null,   -- TYPED: {"object_types": ["MarketFact"]}
  mode              text not null check (mode in ('observed','assimilated')),
  approved_by       text,             -- required for 'assimilated'; ADR-003
  created_at        timestamptz not null default now(),

  constraint assimilated_needs_approval check (
    mode <> 'assimilated' or approved_by is not null
  )
);

-- ADR-003: a grafted world is contaminated, in either mode, automatically.
-- §1.4: the graft must ALSO be recorded as a lateral edge on the resulting snapshot,
-- or the transfer is invisible to lineage traversal. Refuse the graft otherwise.
create or replace function graft_contaminates() returns trigger
language plpgsql as $$
begin
  if (select lateral_source_id from snapshot where id = new.result_snapshot)
     is distinct from new.source_snapshot then
    raise exception
      'graft result % must record lateral_source_id = % (see §1.4)',
      new.result_snapshot, new.source_snapshot;
  end if;

  update world set contaminated = true where id = new.target_world_id;
  return new;
end $$;

create trigger graft_contaminates_trg
  after insert on graft
  for each row execute function graft_contaminates();

-- ADR-001 (revised): replay an experiment's ACTIONS against primary. Not a state merge.
create table promotion (
  id                uuid primary key default gen_random_uuid(),
  source_world_id   uuid not null references world (id),
  target_world_id   uuid not null references world (id),
  replayed_actions  uuid[] not null,   -- action_invocation ids, in order
  status            text not null default 'pending'
                      check (status in ('pending','applied','rejected')),
  rejected_reason   text,
  approved_by       text not null,
  created_at        timestamptz not null default now(),

  constraint promote_to_primary_only check (source_world_id <> target_world_id)
);

create or replace function promotion_target_is_primary() returns trigger
language plpgsql as $$
begin
  if (select kind from world where id = new.target_world_id) <> 'primary' then
    raise exception 'promotion target % is not the primary world', new.target_world_id;
  end if;
  return new;
end $$;

create trigger promotion_target_trg
  before insert or update on promotion
  for each row execute function promotion_target_is_primary();

-- ═════════════════════════════════════════════════════════════
-- DETERMINISM — recorded non-deterministic I/O
-- ═════════════════════════════════════════════════════════════

create table cassette (
  snapshot_id   text not null references snapshot (id),
  call_index    integer not null,
  request_hash  text not null,
  response      jsonb not null,
  recorded_at   timestamptz not null default now(),
  primary key (snapshot_id, call_index)
);
```

---

## 5. API surface

### 5.1 Mare — dividing worlds

```
POST   /worlds                       fork(parent, at_snapshot, hypothesis) -> World
POST   /worlds/:id/graft             graft(source_snapshot, typed_selector, mode) -> Snapshot
POST   /worlds/:id/promote           replay this world's actions against primary
GET    /worlds/compare?a=&b=&metric= diff two worlds on a metric
POST   /worlds/:id/seal              freeze: no further advance, snapshots retained
```

`fork` is `O(1)`. It writes one `world` row and one `snapshot` row whose `ontology_root` is the parent's — no objects are copied.

### 5.2 Vongola — carrying experience through time

```
POST   /worlds/:id/actions           invoke(action_type, params) -> Invocation -> Snapshot
POST   /worlds/:id/migrate           bump agent_version and/or ontology_version -> Snapshot
GET    /snapshots/:id/ancestors      the lineage DAG — both edge kinds; ?path_kind=lateral
                                     answers "did any of this come from another world?"
POST   /worlds/:id/replay            re-execute [from, to] against the cassette
```

There is no generic `advance`. **Every step is an action invocation** (I7). `migrate` is the exception and is itself audited: it bumps a version, runs a declared migration, and records both versions in `cause`. A migration that cannot round-trip must be rejected before it is applied, not after.

### 5.3 Arcobaleno — the point

```
GET    /snapshots/:id                materialize -> ontology state
GET    /snapshots/:id/objects        query objects by type, with link traversal
GET    /worlds/:id/head              the latest snapshot in the world
GET    /snapshots/diff?a=&b=         structural diff over the ontology DAG
POST   /snapshots/:id/restore        fork here and resume execution
```

`diff` is cheap for the same reason `fork` is: two Merkle roots that share a subtree hash are equal without descending into it.

---

## 6. Decisions

### ADR-001 (revised): Fork tree, no state merge — but Actions make promotion tractable

**Original decision:** worlds only diverge; no merge. Merging two contradictory belief sets produces an agent that is confidently incoherent, and the failure is silent. Git's merge works because text conflicts are human-resolvable at a known boundary; opaque agent state has no such boundary.

**What changed:** with I7 in place, a world is no longer only a pile of state. It is also **an ordered list of declared, validated, replayable Actions.** That makes one specific merge well-defined:

> `promote(W → primary)` replays `W`'s action invocations against primary's _current_ head, revalidating each one.

This is not a state merge. Nothing is reconciled; actions are re-run and may legitimately fail against primary's real state, which is the correct outcome. Foundry's scenario-merge works the same way, and for the same reason.

**Chosen:** fork tree, no arbitrary world↔world merge, **plus** `promote` to primary only, requiring approval, with per-action revalidation.

**Revisit when:** a case appears for promoting into a non-primary world.

### ADR-002: State persistence — content-addressed CoW

| Option                                         | Fork cost  | Diff cost  | Storage                   |
| ---------------------------------------------- | ---------- | ---------- | ------------------------- |
| A. Full snapshot per step                      | `O(state)` | `O(state)` | Terrible                  |
| B. Pure event log, replay to materialize       | `O(1)`     | `O(1)`     | Excellent                 |
| **C. Content-addressed Merkle CoW** _(chosen)_ | `O(1)`     | `O(diff)`  | Good — structural sharing |

**Chosen: C.** B is tempting and is what most event-sourcing writeups recommend, but it makes `materialize` `O(history)`, which means the most common read in the system gets slower forever. C gives `O(1)` fork, `O(diff)` comparison, and dedup across worlds — sixteen worlds that all know the same `Flight` store it once.

**That last clause was false in rev. 2 and was caught by measurement, not by review.** Folding provenance into a single node hash (§3.4) made cross-world sharing impossible by construction; the 16-world grid stored 46 objects for 21 distinct facts. Two sections of this document each looked correct alone and contradicted each other in combination. The two-level `onto_content` / `onto_node` split in §3.4 is the fix, and the same grid now stores 21.

**Consequence:** a garbage collector is mandatory, and it now runs at two levels — sweep unreferenced nodes from live world heads, then sweep content with no remaining node pointing at it.

### ADR-003: Graft semantics — typed selectors, tagged import, never silent assimilation

If World B is an experiment against baseline World A, and B's agent consumes an object formed in A, then B is no longer a clean counterfactual — its outcome is a function of both the intervention _and_ the imported knowledge, and no analysis can separate the two.

Typed objects make the selector precise, which is the real upgrade over tag-matching. In the flight pricing case:

- ✅ `MarketFact` — "corporate bookings cluster 14–21 days out." A property of the market, roughly policy-independent. Graftable.
- ❌ `PriceDecision` / `PriceOutcome` — "we still sold 95% at $620." Conditional on World A's entire price path. Assimilated untagged into a low-demand world, the agent overprices and flies the plane empty. Not merely useless — actively harmful.

**Chosen:** two modes.

- **`observed`** — the imported object stays tagged: _this happened in another world_. The agent reasons about it as second-hand evidence. Default.
- **`assimilated`** — presented as native. Storage still records the true origin (I5), but the agent cannot tell. Requires `approved_by`. For production knowledge transfer, **never** for a world under measurement.

Either mode sets `world.contaminated = true`. A contaminated world is excluded from automatic baseline comparison unless the comparison declares the graft as a covariate.

### ADR-004: Determinism — record the non-determinism, do not pretend it is absent

Real agents call LLMs, read clocks, and hit third-party APIs. None of these are reproducible. Without intervention, `materialize(sid)` returns the state as _recorded_, and `replay` returns something different every time — at which point I4 is false and a "point in space-time" is just a log line.

**Chosen:** every non-deterministic call goes through a recording proxy that writes to `cassette` before the result reaches the agent. Replay serves from the cassette, keyed on `request_hash`. A snapshot is `deterministic = true` only when its cassette is complete.

**Consequence:** cassettes are the storage cost driver, not snapshots. Objects dedup beautifully; recorded LLM responses do not. Retention policy is a day-one requirement.

**Cost of skipping this:** the system still _appears_ to work. Forks happen, snapshots accumulate, the diagram is satisfied. The failure surfaces the first time someone tries to reproduce a result and cannot — by which point the data needed was never captured.

### ADR-005: Schema global, instances per-world

| Option                                                             | Consequence                                                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| A. Schema per world                                                | Worlds become incomparable — a counterfactual with a different frame is not a counterfactual |
| B. Schema global, unversioned                                      | No safe way to evolve object types; every change is a breaking change                        |
| **C. Schema global and versioned; instances per-world** _(chosen)_ | Comparable worlds, evolvable types, and version skew is explicit on every snapshot           |

**Consequence:** two worlds pinned to different `ontology_version`s can still be compared, but only through an explicit mapping. The system should refuse a silent comparison across versions rather than quietly producing a number.

### ADR-006: Actions are the only write path

**Chosen:** no generic `advance`. The agent proposes an `action_invocation` naming a declared `action_type`; the system validates parameters, preconditions, and role; only then does a snapshot exist.

This is what makes it safe to put an LLM in the loop. Free-form mutation is impossible by construction rather than by prompt discipline, and `effect_class` is read from the declaration — never from the caller — so an agent cannot mislabel a charge as `pure`.

**Consequence:** a capability the agent needs but nobody declared simply cannot happen. This will feel like friction and is the entire point. Expect the action catalogue to be the thing that actually gates product velocity.

### ADR-007: The effect boundary — forking the agent does not fork the world

| Class          | Example                       | Behaviour outside the primary world                                                     |
| -------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| `pure`         | LLM call, computation         | Recorded to cassette, replayed freely                                                   |
| `branchable`   | Postgres, object storage, git | Fork the backing store alongside the world                                              |
| `irreversible` | Seat sale, email, payment     | **Suppressed.** Recorded with `status='suppressed'` so the counterfactual stays visible |

Enforced by `action_guard`, not by convention. A convention here fails exactly once, and the failure is a real charge to a real customer from an experiment.

### ADR-008: Naming — flavour in the docs, plain names in the code

`Mare`, `Vongola`, and `Arcobaleno` are excellent as a project identity and genuinely useful as a thinking tool. They are poor API names: a new engineer cannot infer that `vongola.advance()` appends to a timeline.

**Chosen:** `World` / `Lineage` / `AgentState` in code and schema; the Trinisette names in the README, the docs, and the project identity.

---

## 7. Where this breaks

Stated plainly, because a design doc that only lists strengths is a pitch.

1. **The integration layer is the real work, and none of it is here.** Palantir's moat is not the ontology concept — it is getting messy source data into clean objects, plus permissions and governance, plus the deployment model. The concept is perhaps 15% of the effort. Build the branching substrate beautifully with no data-in story and the result is an empty simulator.

2. **Grafting undermines the experiment it serves.** ADR-003 mitigates but does not solve this. If grafting turns out to be the primary use case rather than an occasional one, the clean-counterfactual framing has to be abandoned honestly rather than defended.

3. **Cassette storage grows without bound.** Object storage is nearly free; recorded LLM I/O is not. Retention policy will determine how far back reproducibility actually extends — usually much less far than anyone assumes.

4. **`branchable` is doing a lot of work.** Branching a Postgres database per world is tractable. Branching a vector index, a third-party CRM, or a stateful long-running integration is not. Everything outside the branchable set collapses into `irreversible`.

5. **Ontology migration is the schema-evolution problem in disguise.** It has no clean general solution. Every migration is bespoke, and one that loses information makes older snapshots un-materializable under the new version — quietly severing the lineage the system exists to preserve.

6. **The metaphor's elegance is a hazard.** Three axes look complete, so it is tempting to force every requirement into one. Access control, cost accounting, and multi-agent interaction within a single world are real and must sit outside the trinity rather than be bent into it.

---

## 8. Non-goals

- A general enterprise data-integration platform. Pick one domain, model it deeply, and let the source-mapping layer stay thin and specific.
- Arbitrary world↔world state merge (ADR-001; `promote` is the sanctioned exception)
- Multi-agent interaction within one world — orthogonal, deliberately deferred
- Distributed consensus across worlds; the primary world is authoritative by construction
- A general workflow engine. This is a state substrate, not an orchestrator.

---

## 9. Phasing

Each phase is independently useful and independently falsifiable.

| Phase | Scope                                                                           | Proves                                           |
| ----- | ------------------------------------------------------------------------------- | ------------------------------------------------ |
| **0** | One world. Object and link types, content-addressed instances, no forking.      | The ontology and CoW storage work                |
| **1** | Action types, validation, `action_invocation`. Still one world.                 | I7 — nothing writes except through a declaration |
| **2** | `fork`, `materialize`, `diff`. Irreversible actions suppressed outside primary. | Isolation holds (I3, I6)                         |
| **3** | Cassette recording, deterministic `replay`.                                     | I4 — the point in the diagram is real            |
| **4** | `graft` with typed selectors and contamination flags; `promote`.                | Cross-world transfer without silent corruption   |
| **5** | Cross-world metric comparison, GC, retention.                                   | The system survives its own storage growth       |

Two orderings are not negotiable. **Phase 1 before Phase 2:** forking a store that anything can write to gives you many worlds and no guarantees. **Phase 3 before Phase 4:** grafting into a system that cannot reproduce a state produces results nobody can check.

### 9.1 The acceptance test for Phases 0–3

The milestone is not that `fork()` returns. It is that **forking, diverging, and replaying leaves the original bit-identical.** Because snapshots are content-addressed, this is testable as hash equality rather than as a fuzzy state comparison — which is the practical dividend of ADR-002 and the reason the whole design earns its complexity.

```python
s_a  = invoke(A, SetFare, price=504)        # World A acts
B    = fork(A, at=s_a)                      # branch
s_b  = invoke(B, SetFare, price=420)        # World B acts differently

assert s_b.id != s_a.id                     # divergence is real
assert materialize(s_b) != materialize(s_a)

s_a2 = replay(A, frm=s_a.parent_id, to=s_a) # re-run World A from the cassette
assert s_a2.id == s_a.id                    # ← THE TEST: byte-identical, not merely similar
assert s_a2.ontology_root == s_a.ontology_root
```

If that last assertion holds, `(world, seq)` is a real coordinate and a snapshot is genuinely a point rather than a log line. If it fails, every downstream claim in this document — comparison, graft, promote, audit — is decoration on something that cannot reproduce itself.

Two failure modes to expect, both of which the design already names and neither of which the assertion tolerates:

- **Unrecorded non-determinism** (ADR-004) — a clock read, an unseeded shuffle, or an LLM call that bypassed the cassette proxy. Symptom: `s_a2.id` differs on every run.
- **Non-canonical encoding** — logically identical state hashing differently because of JSON key order, float formatting, or set iteration order. Symptom: `s_a2.id` is stable per run but differs from `s_a.id`. Fix the encoder, not the test.

---

## Appendix A: worked example — flight pricing

The demo domain, because it forces the effect boundary to be real: there is exactly one YYZ→LAX flight on a given date, seats are finite, and **a sold seat cannot be unsold.**

**Object types:** `Flight`, `Fare`, `Booking`, `Aircraft`, `Route`, plus agent-memory types `MarketFact` and `PriceDecision`.
**Link types:** `Flight →operated_by→ Aircraft`, `Booking →for→ Flight`, `Fare →applies_to→ Flight`.
**Action types:** `SetFare` (`branchable`), `AcceptBooking` (`irreversible`), `RecordMarketFact` (`pure`).

Two axes, not one. **Environment** (demand regime — exogenous, not the agent's choice) × **Policy** (price — the agent's choice, recorded in `world.hypothesis`). Varying only the environment and reading off revenue is confounded: price and load factor move together, which is the signature of a demand shift, not a price experiment.

Revenue at 180 seats, constant-elasticity demand (`e = 1.4`), demand held fixed within each row:

```
  regime          $280        $336        $420        $504        $620
  --------------------------------------------------------------------
  high          50,400      60,480      75,600     81,997*      75,476
                 100%        100%        100%         90%         68%
  normal        50,400      60,480     60,900*      56,617      52,115
                 100%        100%         81%         62%         47%
  low          46,926*      43,625      39,900      37,094      34,144
                  93%         72%         53%         41%         31%

  * = revenue-maximising price for that regime
```

The deliverable is not "which world earned most" — it is **which policy is robust across regimes**, a question a flat list of three worlds cannot ask. Note that the optimal price moves ($504 / $420 / $280) and that the high-demand curve is nearly flat from $420 to $620, which is the kind of finding the grid exists to surface.

`AcceptBooking` is `irreversible`, so in the eight non-primary worlds it is recorded `suppressed` and simulated. The counterfactual stays visible; the seat stays unsold.

**Honest limit:** in live operation the counterfactual is never observed. Only the primary world happened; every other number is demand-model output. Trinisette produces _bookkeeping about counterfactuals_, not ground truth — and airline revenue management is a mature field, so the demo should showcase the substrate, not claim to beat EMSRb.

## Appendix B: the seven components of a state

Optional flavour, from the seven Arcobaleno. If a state vector needs named components:

`memory` · `tools` · `policy` (prompt) · `goal` · `budget` · `permissions` · `metrics`

Naming them is useful mainly because it forces the question of which ones a `fork` copies and which it resets — `budget` and `metrics` almost certainly reset; `memory` and `policy` almost certainly carry.

---

## References

- [Ontology core concepts](https://www.palantir.com/docs/foundry/ontology/core-concepts) · [Object and link types](https://www.palantir.com/docs/foundry/object-link-types/link-types-overview) · [Action types](https://www.palantir.com/docs/foundry/action-types/overview)
- [Scenarios: core concepts](https://www.palantir.com/docs/foundry/workshop/scenarios-concepts) (fork-of-ontology model and the 30k edit / 50 action / 10k object limits) · [Merge scenarios](https://www.palantir.com/docs/foundry/ontology/merge-scenario)
