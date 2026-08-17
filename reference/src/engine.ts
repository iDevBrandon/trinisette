import { randomUUID } from "node:crypto";
import { hash } from "./canonical.js";
import { Cassette, type Mode } from "./cassette.js";
import { checkPreconditions, getActionType, validateParams } from "./ontology.js";
import { cloneState, pool, putState, readState } from "./store.js";
import type { InvokeResult, Provenance, Snapshot, WorldKind, WorldState } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Action handlers. The DECLARATION lives in the database (action_type); the
// executable body lives here, keyed by the same id. Nothing can run without both.
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionCtx {
  worldId: string;
  seq: number;
  /** Provenance stamp for anything this action creates (I5). */
  prov: (snapshotBefore: string) => Provenance;
  /** Non-determinism goes through here or replay breaks (ADR-004). */
  nd: <T>(request: unknown, fn: () => Promise<T> | T) => Promise<T>;
}

export type Handler = (
  ctx: ActionCtx,
  params: Record<string, any>,
  state: WorldState,
) => Promise<void> | void;

const handlers = new Map<string, Handler>();
export function registerHandler(actionTypeId: string, h: Handler): void {
  handlers.set(actionTypeId, h);
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshots
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The snapshot address (I1). Note what is ABSENT: no timestamp, no uuid, no
 * insertion order. Anything non-reproducible in here would make the acceptance
 * test in §9.1 fail by construction.
 */
export function snapshotId(s: Omit<Snapshot, "id" | "deterministic">): string {
  return hash({
    world_id: s.world_id,
    seq: s.seq,
    parent_id: s.parent_id,
    lateral_source_id: s.lateral_source_id,
    agent_version: s.agent_version,
    ontology_version: s.ontology_version,
    ontology_root: s.ontology_root,
    cause: s.cause,
  });
}

async function insertSnapshot(s: Snapshot): Promise<Snapshot> {
  await pool.query(
    `insert into snapshot (id, world_id, seq, parent_id, lateral_source_id, agent_version,
                           ontology_version, ontology_root, cause, deterministic)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (id) do nothing`,
    [s.id, s.world_id, s.seq, s.parent_id, s.lateral_source_id, s.agent_version,
     s.ontology_version, s.ontology_root, s.cause, s.deterministic],
  );
  return s;
}

export async function head(worldId: string): Promise<Snapshot> {
  const r = await pool.query<Snapshot>(
    `select * from snapshot where world_id = $1 order by seq desc limit 1`,
    [worldId],
  );
  if (r.rowCount === 0) throw new Error(`world ${worldId} has no snapshots`);
  return r.rows[0];
}

export async function getSnapshot(id: string): Promise<Snapshot> {
  const r = await pool.query<Snapshot>(`select * from snapshot where id = $1`, [id]);
  if (r.rowCount === 0) throw new Error(`no such snapshot ${id}`);
  return r.rows[0];
}

export const materialize = async (s: Snapshot): Promise<WorldState> => readState(s.ontology_root);

// ─────────────────────────────────────────────────────────────────────────────
// Mare — worlds
// ─────────────────────────────────────────────────────────────────────────────

export async function createPrimary(
  name: string,
  opts: { agentVersion: string; ontologyVersion: string; seed?: (worldId: string) => WorldState },
): Promise<{ world: string; snapshot: Snapshot }> {
  const worldId = randomUUID();
  await pool.query(`insert into world (id, name, kind) values ($1,$2,'primary')`, [worldId, name]);

  const state = opts.seed ? opts.seed(worldId) : { objects: new Map(), links: new Map() };
  const root = await putState(state);
  const body = {
    world_id: worldId, seq: 0, parent_id: null, lateral_source_id: null,
    agent_version: opts.agentVersion, ontology_version: opts.ontologyVersion,
    ontology_root: root, cause: { kind: "genesis" },
  };
  const snap = await insertSnapshot({ ...body, id: snapshotId(body), deterministic: true });
  return { world: worldId, snapshot: snap };
}

/**
 * O(1) fork (I3). One world row and one snapshot row; the child's ontology_root IS
 * the parent's, so no objects are copied and every unchanged node is shared.
 */
export async function fork(
  at: Snapshot,
  opts: { name: string; hypothesis: string; kind?: WorldKind },
): Promise<{ world: string; snapshot: Snapshot }> {
  const worldId = randomUUID();
  await pool.query(
    `insert into world (id, name, kind, parent_world_id, fork_point, hypothesis)
     values ($1,$2,$3,$4,$5,$6)`,
    [worldId, opts.name, opts.kind ?? "experiment", at.world_id, at.id, opts.hypothesis],
  );
  const body = {
    world_id: worldId, seq: 0, parent_id: at.id, lateral_source_id: null,
    agent_version: at.agent_version, ontology_version: at.ontology_version,
    ontology_root: at.ontology_root,               // ← shared, not copied
    cause: { kind: "fork", from: at.id },
  };
  const snap = await insertSnapshot({ ...body, id: snapshotId(body), deterministic: true });
  return { world: worldId, snapshot: snap };
}

async function worldKind(worldId: string): Promise<WorldKind> {
  const r = await pool.query<{ kind: WorldKind }>(`select kind from world where id = $1`, [worldId]);
  return r.rows[0].kind;
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions — the only write path (I7)
// ─────────────────────────────────────────────────────────────────────────────

export async function invoke(
  worldId: string,
  actionTypeId: string,
  params: Record<string, unknown>,
  invokedBy: string,
): Promise<InvokeResult> {
  const before = await head(worldId);
  const def = await getActionType(actionTypeId, before.ontology_version);

  const reject = async (reason: string): Promise<InvokeResult> => {
    const id = randomUUID();
    if (def) {
      await pool.query(
        `insert into action_invocation (id, world_id, action_type_id, ontology_version, parameters,
                                        snapshot_before, status, rejected_reason, invoked_by)
         values ($1,$2,$3,$4,$5,$6,'rejected',$7,$8)`,
        [id, worldId, actionTypeId, before.ontology_version, params, before.id, reason, invokedBy],
      );
    }
    return { invocation_id: id, status: "rejected", snapshot: null, rejected_reason: reason };
  };

  if (!def) return reject(`undeclared action type '${actionTypeId}' — nothing may run that nobody typed (I7)`);

  const paramErr = validateParams(def, params);
  if (paramErr) return reject(paramErr);

  const handler = handlers.get(actionTypeId);
  if (!handler) return reject(`action type '${actionTypeId}' is declared but has no handler bound`);

  const state = cloneState(await readState(before.ontology_root));
  const preErr = checkPreconditions(def, params, state);
  if (preErr) return reject(preErr);

  // ADR-007: effect_class comes from the DECLARATION, never from the caller.
  const kind = await worldKind(worldId);
  const suppressed = def.effect_class === "irreversible" && kind !== "primary";

  const cassette = new Cassette(before.id, "record");
  const ctx: ActionCtx = {
    worldId,
    seq: before.seq + 1,
    prov: (snapBefore) => ({ origin_world_id: worldId, origin_snapshot: snapBefore, origin_kind: "native" }),
    nd: (req, fn) => cassette.nd(req, fn),
  };

  await handler(ctx, params, state);

  const root = await putState(state);
  const body = {
    world_id: worldId, seq: before.seq + 1, parent_id: before.id, lateral_source_id: null,
    agent_version: before.agent_version, ontology_version: before.ontology_version,
    ontology_root: root,
    // `cause` must be reproducible: action id + params only. No clock, no uuid.
    cause: { kind: "action", action_type_id: actionTypeId, parameters: params, suppressed },
  };
  const snap = await insertSnapshot({ ...body, id: snapshotId(body), deterministic: true });

  const invocationId = randomUUID();
  await pool.query(
    `insert into action_invocation (id, world_id, action_type_id, ontology_version, parameters,
                                    snapshot_before, snapshot_after, status, invoked_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [invocationId, worldId, actionTypeId, before.ontology_version, params,
     before.id, snap.id, suppressed ? "suppressed" : "applied", invokedBy],
  );

  return { invocation_id: invocationId, status: suppressed ? "suppressed" : "applied", snapshot: snap };
}

// ─────────────────────────────────────────────────────────────────────────────
// Replay — the acceptance test (§9.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Re-executes a range of a world's history against the cassette and RECOMPUTES each
 * snapshot address. Nothing is persisted: the whole point is to compare the recomputed
 * id with the recorded one. If they differ, the world is not reproducible.
 */
export async function replay(
  worldId: string,
  fromSeq: number,
  toSeq: number,
  mode: Mode = "replay",
): Promise<{ seq: number; recorded: string; recomputed: string; ok: boolean }[]> {
  const out: { seq: number; recorded: string; recomputed: string; ok: boolean }[] = [];

  const startRow = await pool.query<Snapshot>(
    `select * from snapshot where world_id = $1 and seq = $2`, [worldId, fromSeq]);
  if (startRow.rowCount === 0) throw new Error(`world ${worldId} has no seq ${fromSeq}`);

  let cursor = startRow.rows[0];
  let state = cloneState(await readState(cursor.ontology_root));

  for (let seq = fromSeq + 1; seq <= toSeq; seq++) {
    const snapRow = await pool.query<Snapshot>(
      `select * from snapshot where world_id = $1 and seq = $2`, [worldId, seq]);
    if (snapRow.rowCount === 0) throw new Error(`world ${worldId} has no seq ${seq}`);
    const recorded = snapRow.rows[0];

    const inv = await pool.query(
      `select * from action_invocation
        where world_id = $1 and snapshot_after = $2 and status in ('applied','suppressed')`,
      [worldId, recorded.id]);
    if (inv.rowCount === 0) throw new Error(`no invocation produced ${worldId}@${seq}`);
    const { action_type_id, parameters } = inv.rows[0];

    const def = await getActionType(action_type_id, recorded.ontology_version);
    const handler = handlers.get(action_type_id);
    if (!def || !handler) throw new Error(`cannot replay '${action_type_id}': missing declaration or handler`);

    const cassette = new Cassette(cursor.id, mode);
    const ctx: ActionCtx = {
      worldId, seq,
      prov: (snapBefore) => ({ origin_world_id: worldId, origin_snapshot: snapBefore, origin_kind: "native" }),
      nd: (req, fn) => cassette.nd(req, fn),
    };

    await handler(ctx, parameters, state);

    const { rootHash } = await import("./store.js");
    const root = rootHash(state).root;
    const suppressed = (recorded.cause as any)?.suppressed ?? false;
    const recomputed = snapshotId({
      world_id: worldId, seq, parent_id: cursor.id, lateral_source_id: null,
      agent_version: recorded.agent_version, ontology_version: recorded.ontology_version,
      ontology_root: root,
      cause: { kind: "action", action_type_id, parameters, suppressed },
    });

    out.push({ seq, recorded: recorded.id, recomputed, ok: recomputed === recorded.id });
    cursor = recorded;
  }
  return out;
}
