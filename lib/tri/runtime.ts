/**
 * Trinisette runtime, in memory.
 *
 * A faithful port of the invariants the Postgres engine enforces, minus persistence, so
 * the workbench can run in a browser. The rules that are actually load-bearing are all
 * here and all enforced in code, not in the UI:
 *
 *   I1  snapshots are content-addressed          → snapshotId() hashes the whole body
 *   I3  fork cannot affect the parent            → the child shares the parent's root
 *   I5  every object carries provenance          → makeObject() requires it
 *   I6  irreversible effects only from primary   → invoke() suppresses, and says so
 *   I7  the ontology mutates only via an Action  → there is no other write path exported
 *
 * The UI cannot bypass any of these, which is the point: the "PUBLISH" button is not
 * disabled by a conditional in a component, it is refused by the runtime.
 */
import { hash } from "./hash";

export type EffectClass = "pure" | "branchable" | "irreversible";
export type WorldKind = "primary" | "experiment";

export interface Provenance {
  originWorld: string;
  originSeq: number;
  originKind: "native" | "grafted";
  source: "official" | "community" | "modelled";
}

export interface OntoObject {
  typeId: string;
  key: string;
  props: Record<string, string | number | boolean>;
  prov: Provenance;
  hash: string;
}

export interface OntoLink {
  typeId: string;
  from: string; // "Type/key"
  to: string;
}

export interface WorldState {
  objects: Record<string, OntoObject>; // "Type/key" → object
  links: OntoLink[];
}

export interface Snapshot {
  id: string;
  world: string;
  seq: number;
  parent: string | null;
  root: string;
  cause: { kind: "genesis" | "fork" | "action"; action?: string; params?: Record<string, unknown>; suppressed?: boolean };
  state: WorldState;
}

export interface World {
  id: string;
  name: string;
  kind: WorldKind;
  hypothesis: string;
  parent: string | null;
  forkPoint: string | null;
  head: string; // snapshot id
}

export interface Invocation {
  id: number;
  world: string;
  action: string;
  params: Record<string, unknown>;
  status: "applied" | "suppressed" | "rejected";
  reason?: string;
  before: string;
  after: string | null;
}

export interface Store {
  worlds: Record<string, World>;
  snapshots: Record<string, Snapshot>;
  invocations: Invocation[];
  nextInvocation: number;
}

/* ── schema layer (global, shared by every world) ────────────────────────── */

export type ParamSpec = { type: "string" | "number"; label: string; options?: string[]; min?: number; max?: number };

export interface ObjectTypeDef {
  id: string;
  label: string;
  keyProp: string;
  display: string[];
}

export interface ActionTypeDef {
  id: string;
  label: string;
  effect: EffectClass;
  touches: string[];
  params: Record<string, ParamSpec>;
  /** Preconditions checked before the handler runs. */
  requires?: { objectType: string; keyFromParam: string }[];
  handler: (draft: WorldState, params: Record<string, never>, prov: Provenance) => void;
  note: string;
}

export interface Ontology {
  version: string;
  objects: ObjectTypeDef[];
  links: { id: string; label: string; from: string; to: string }[];
  actions: ActionTypeDef[];
}

/* ── addressing ──────────────────────────────────────────────────────────── */

export const objKey = (typeId: string, key: string) => `${typeId}/${key}`;

export function makeObject(
  typeId: string,
  key: string,
  props: OntoObject["props"],
  prov: Provenance,
): OntoObject {
  // Provenance is part of identity but NOT of the payload address — see §3.4.
  const content = hash({ typeId, key, props });
  return { typeId, key, props, prov, hash: hash({ content, prov }) };
}

/** Deterministic: the same set of objects always yields the same root. */
export function rootOf(state: WorldState): string {
  const leaves = Object.values(state.objects).map((o) => o.hash).sort();
  const edges = state.links.map((l) => `${l.typeId}:${l.from}->${l.to}`).sort();
  return hash({ kind: "tree", leaves, edges });
}

function snapshotId(s: Omit<Snapshot, "id" | "state">): string {
  // No clock, no uuid, no insertion order — anything non-reproducible here would make
  // the address unstable and the whole coordinate meaningless.
  return hash({ world: s.world, seq: s.seq, parent: s.parent, root: s.root, cause: s.cause });
}

const cloneState = (s: WorldState): WorldState => ({
  objects: { ...s.objects },
  links: [...s.links],
});

/* ── world lifecycle ─────────────────────────────────────────────────────── */

export function createStore(seed: (prov: Provenance) => WorldState): Store {
  const prov: Provenance = { originWorld: "primary", originSeq: 0, originKind: "native", source: "official" };
  const state = seed(prov);
  const root = rootOf(state);
  const body = { world: "primary", seq: 0, parent: null, root, cause: { kind: "genesis" as const } };
  const snap: Snapshot = { ...body, id: snapshotId(body), state };

  return {
    worlds: {
      primary: {
        id: "primary", name: "primary", kind: "primary",
        hypothesis: "reality", parent: null, forkPoint: null, head: snap.id,
      },
    },
    snapshots: { [snap.id]: snap },
    invocations: [],
    nextInvocation: 1,
  };
}

/** O(1): the child shares the parent's root and state. Nothing is copied (I3). */
export function fork(store: Store, fromWorld: string, name: string, hypothesis: string): Store {
  const parent = store.worlds[fromWorld];
  const at = store.snapshots[parent.head];
  const body = {
    world: name, seq: 0, parent: at.id, root: at.root,
    cause: { kind: "fork" as const },
  };
  const snap: Snapshot = { ...body, id: snapshotId(body), state: at.state };

  return {
    ...store,
    worlds: {
      ...store.worlds,
      [name]: {
        id: name, name, kind: "experiment", hypothesis,
        parent: fromWorld, forkPoint: at.id, head: snap.id,
      },
    },
    snapshots: { ...store.snapshots, [snap.id]: snap },
  };
}

export interface InvokeResult {
  store: Store;
  status: Invocation["status"];
  reason?: string;
}

/**
 * The only write path (I7). Validates parameters and preconditions against the
 * DECLARED action, decides suppression from the declared effect class and the world's
 * kind — never from anything the caller passes — then produces a new snapshot.
 */
export function invoke(
  store: Store,
  onto: Ontology,
  worldId: string,
  actionId: string,
  params: Record<string, string | number>,
): InvokeResult {
  const world = store.worlds[worldId];
  const def = onto.actions.find((a) => a.id === actionId);
  const before = store.snapshots[world.head];

  const reject = (reason: string): InvokeResult => ({
    store: {
      ...store,
      nextInvocation: store.nextInvocation + 1,
      invocations: [
        { id: store.nextInvocation, world: worldId, action: actionId, params, status: "rejected", reason, before: before.id, after: null },
        ...store.invocations,
      ],
    },
    status: "rejected",
    reason,
  });

  if (!def) return reject(`undeclared action '${actionId}' — nothing runs that nobody typed (I7)`);

  for (const [name, spec] of Object.entries(def.params)) {
    const v = params[name];
    if (v === undefined || v === "") return reject(`missing parameter '${spec.label}'`);
    if (spec.type === "number") {
      const n = Number(v);
      if (!Number.isFinite(n)) return reject(`'${spec.label}' must be a number`);
      if (spec.min !== undefined && n < spec.min) return reject(`${spec.label} < ${spec.min}`);
      if (spec.max !== undefined && n > spec.max) return reject(`${spec.label} > ${spec.max}`);
    }
    if (spec.options && !spec.options.includes(String(v))) return reject(`'${v}' is not an allowed value for ${spec.label}`);
  }

  for (const r of def.requires ?? []) {
    const k = objKey(r.objectType, String(params[r.keyFromParam]));
    if (!before.state.objects[k]) return reject(`precondition failed: ${r.objectType} '${params[r.keyFromParam]}' does not exist in this world`);
  }

  // ADR-007: read the effect class from the declaration, never from the caller.
  const suppressed = def.effect === "irreversible" && world.kind !== "primary";

  const draft = cloneState(before.state);
  const prov: Provenance = {
    originWorld: worldId, originSeq: before.seq + 1, originKind: "native",
    source: def.effect === "pure" ? "modelled" : "official",
  };
  const coerced: Record<string, string | number> = {};
  for (const [name, spec] of Object.entries(def.params)) {
    coerced[name] = spec.type === "number" ? Number(params[name]) : String(params[name]);
  }
  def.handler(draft, coerced as never, prov);

  const root = rootOf(draft);
  const cause = { kind: "action" as const, action: actionId, params: coerced, suppressed };
  const body = { world: worldId, seq: before.seq + 1, parent: before.id, root, cause };
  const snap: Snapshot = { ...body, id: snapshotId(body), state: draft };

  return {
    store: {
      ...store,
      worlds: { ...store.worlds, [worldId]: { ...world, head: snap.id } },
      snapshots: { ...store.snapshots, [snap.id]: snap },
      nextInvocation: store.nextInvocation + 1,
      invocations: [
        { id: store.nextInvocation, world: worldId, action: actionId, params: coerced, status: suppressed ? "suppressed" : "applied", before: before.id, after: snap.id },
        ...store.invocations,
      ],
    },
    status: suppressed ? "suppressed" : "applied",
  };
}

export const headOf = (store: Store, world: string) => store.snapshots[store.worlds[world].head];

export function lineage(store: Store, snapshotId: string): Snapshot[] {
  const out: Snapshot[] = [];
  let cur: Snapshot | undefined = store.snapshots[snapshotId];
  while (cur) {
    out.push(cur);
    cur = cur.parent ? store.snapshots[cur.parent] : undefined;
  }
  return out;
}
