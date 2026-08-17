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
