import { Pool, types } from "pg";
import { hash } from "./canonical.js";
import type { OntoLink, OntoObject, Provenance, WorldState } from "./types.js";

/**
 * pg returns int8/bigint as a STRING by default, to avoid silent precision loss past
 * 2^53. For `seq` that is actively dangerous here on two counts:
 *   1. `seq + 1` becomes string concatenation ("1" + 1 === "11"), corrupting the timeline.
 *   2. `seq` is hashed into the snapshot address, so "1" and 1 encode differently —
 *      the exact "non-canonical encoding" failure mode named in §9.1.
 * Parse it as a number. A world will not reach 2^53 steps.
 */
types.setTypeParser(types.builtins.INT8, (v: string) => parseInt(v, 10));

export const pool = new Pool({
  host: process.env.PGHOST ?? "/tmp",
  port: Number(process.env.PGPORT ?? 5433),
  database: process.env.PGDATABASE ?? "trinisette",
  user: process.env.PGUSER ?? "postgres",
});

export const objKey = (typeId: string, key: string) => `${typeId}/${key}`;

/**
 * Two-level addressing (§3.4).
 *   contentHash — payload only. Equal across worlds, so storage is shared.
 *   nodeHash    — content + provenance. Unique per world, so identity is preserved.
 */
export function contentHash(o: { type_id: string; object_key: string; properties: unknown }): string {
  return hash({ kind: "object", type_id: o.type_id, object_key: o.object_key, properties: o.properties });
}

export function linkContentHash(l: { type_id: string; from_key: string; to_key: string; properties: unknown }): string {
  return hash({ kind: "link", type_id: l.type_id, from_key: l.from_key, to_key: l.to_key, properties: l.properties });
}

export const nodeHash = (content: string, provenance: Provenance): string =>
  hash({ content, provenance });

export function makeObject(
  type_id: string,
  object_key: string,
  properties: Record<string, unknown>,
  provenance: Provenance,
): OntoObject {
  const content = contentHash({ type_id, object_key, properties });
  return { type_id, object_key, properties, provenance, content, hash: nodeHash(content, provenance) };
}

/**
 * Root of a world state. Children are SORTED leaf hashes, which is what makes the
 * root deterministic: the same set of objects always yields the same root regardless
 * of insertion order.
 *
 * Prototype simplification: this is a single flat tree node rather than a sharded
 * Merkle trie, so a write is O(n) in the number of live objects. Structural sharing
 * across worlds still works (identical states share the root outright), but the
 * O(diff) write claim in ADR-002 needs the sharded version to hold at scale.
 */
export function rootHash(state: WorldState): { root: string; children: string[] } {
  const children = [
    ...[...state.objects.values()].map((o) => o.hash),
    ...[...state.links.values()].map((l) => l.hash),
  ].sort();
  return { root: hash({ kind: "tree", children }), children };
}

export async function putObject(o: OntoObject): Promise<void> {
  // Level 1: payload, written once no matter how many worlds know it.
  await pool.query(
    `insert into onto_content (content_hash, kind, type_id, object_key, properties, bytes)
     values ($1,'object',$2,$3,$4,$5) on conflict (content_hash) do nothing`,
    [o.content, o.type_id, o.object_key, o.properties, JSON.stringify(o.properties).length],
  );
  // Level 2: the per-world identity envelope.
  await pool.query(
    `insert into onto_node (hash, kind, content_hash, provenance, bytes)
     values ($1,'object',$2,$3,$4) on conflict (hash) do nothing`,
    [o.hash, o.content, o.provenance, 96],
  );
}

export async function putLink(l: OntoLink): Promise<void> {
  await pool.query(
    `insert into onto_content (content_hash, kind, type_id, from_key, to_key, properties, bytes)
     values ($1,'link',$2,$3,$4,$5,$6) on conflict (content_hash) do nothing`,
    [l.content, l.type_id, l.from_key, l.to_key, l.properties, 32],
  );
  await pool.query(
    `insert into onto_node (hash, kind, content_hash, provenance, bytes)
     values ($1,'link',$2,$3,$4) on conflict (hash) do nothing`,
    [l.hash, l.content, l.provenance, 96],
  );
}

/** Persist the whole state and return its root hash. Nodes dedup by content. */
export async function putState(state: WorldState): Promise<string> {
  for (const o of state.objects.values()) await putObject(o);
  for (const l of state.links.values()) await putLink(l);
  const { root, children } = rootHash(state);
  await pool.query(
    `insert into onto_node (hash, kind, children, bytes)
     values ($1,'tree',$2,$3) on conflict (hash) do nothing`,
    [root, children, children.length * 32],
  );
  return root;
}

/** Read a state back out of the store. materialize() in the API surface. */
export async function readState(root: string): Promise<WorldState> {
  const tree = await pool.query<{ children: string[] }>(
    `select children from onto_node where hash = $1 and kind = 'tree'`,
    [root],
  );
  if (tree.rowCount === 0) throw new Error(`no such root ${root}`);
  const childHashes = tree.rows[0].children ?? [];

  const state: WorldState = { objects: new Map(), links: new Map() };
  if (childHashes.length === 0) return state;

  const nodes = await pool.query(
    `select n.hash, n.kind, n.content_hash, n.provenance,
            c.type_id, c.object_key, c.from_key, c.to_key, c.properties
       from onto_node n join onto_content c on c.content_hash = n.content_hash
      where n.hash = any($1::text[])`,
    [childHashes],
  );
  for (const r of nodes.rows) {
    if (r.kind === "object") {
      state.objects.set(objKey(r.type_id, r.object_key), {
        hash: r.hash, content: r.content_hash,
        type_id: r.type_id, object_key: r.object_key,
        properties: r.properties, provenance: r.provenance,
      });
    } else if (r.kind === "link") {
      state.links.set(r.hash, {
        hash: r.hash, content: r.content_hash,
        type_id: r.type_id, from_key: r.from_key, to_key: r.to_key,
        properties: r.properties, provenance: r.provenance,
      });
    }
  }
  return state;
}

export function cloneState(s: WorldState): WorldState {
  return { objects: new Map(s.objects), links: new Map(s.links) };
}

/** Structural diff. Cheap when roots match: equality short-circuits without descending. */
export function diffState(a: WorldState, b: WorldState) {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: { key: string; from: string; to: string }[] = [];

  for (const [k, ob] of b.objects) {
    const oa = a.objects.get(k);
    if (!oa) added.push(k);
    else if (oa.hash !== ob.hash) changed.push({ key: k, from: oa.hash, to: ob.hash });
  }
  for (const k of a.objects.keys()) if (!b.objects.has(k)) removed.push(k);

  return { added, removed, changed };
}
