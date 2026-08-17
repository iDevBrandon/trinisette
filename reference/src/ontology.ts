import { pool } from "./store.js";
import type { ActionTypeDef, LinkTypeDef, ObjectTypeDef, WorldState } from "./types.js";

/**
 * The SCHEMA layer (§3.1): global and versioned, never per-world. Two worlds pinned to
 * different ontology versions are not silently comparable — see assertComparable below.
 */
export async function defineOntology(
  version: string,
  defs: {
    objects: ObjectTypeDef[];
    links?: LinkTypeDef[];
    actions: ActionTypeDef[];
  },
): Promise<void> {
  await pool.query(
    `insert into ontology_version (id, status) values ($1,'active') on conflict (id) do nothing`,
    [version],
  );
  for (const o of defs.objects) {
    await pool.query(
      `insert into object_type (id, ontology_version, name, key_property, properties)
       values ($1,$2,$3,$4,$5) on conflict do nothing`,
      [o.id, version, o.name, o.key_property, o.properties],
    );
  }
  for (const l of defs.links ?? []) {
    await pool.query(
      `insert into link_type (id, ontology_version, name, from_type, to_type, cardinality)
       values ($1,$2,$3,$4,$5,$6) on conflict do nothing`,
      [l.id, version, l.name, l.from_type, l.to_type, l.cardinality],
    );
  }
  for (const a of defs.actions) {
    await pool.query(
      `insert into action_type (id, ontology_version, name, parameters, touches, validation, effect_class, required_role)
       values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing`,
      [a.id, version, a.name, a.parameters, a.touches, JSON.stringify(a.validation ?? []), a.effect_class, a.required_role ?? null],
    );
  }
}

export async function getActionType(id: string, version: string): Promise<ActionTypeDef | null> {
  const r = await pool.query(
    `select id, name, parameters, touches, validation, effect_class, required_role
       from action_type where id = $1 and ontology_version = $2`,
    [id, version],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  return {
    id: row.id,
    name: row.name,
    parameters: row.parameters,
    touches: row.touches,
    validation: row.validation,
    effect_class: row.effect_class,
    required_role: row.required_role,
  };
}

export async function getObjectType(id: string, version: string): Promise<ObjectTypeDef | null> {
  const r = await pool.query(
    `select id, name, key_property, properties from object_type where id = $1 and ontology_version = $2`,
    [id, version],
  );
  return r.rowCount === 0 ? null : (r.rows[0] as ObjectTypeDef);
}

/** Reject a silent cross-version comparison rather than quietly producing a number (ADR-005). */
export function assertComparable(a: { ontology_version: string }, b: { ontology_version: string }): void {
  if (a.ontology_version !== b.ontology_version) {
    throw new Error(
      `refusing to compare snapshots across ontology versions ${a.ontology_version} and ${b.ontology_version} ` +
        `without an explicit mapping (ADR-005)`,
    );
  }
}

export function validateParams(
  def: ActionTypeDef,
  params: Record<string, unknown>,
): string | null {
  for (const [name, spec] of Object.entries(def.parameters)) {
    const v = params[name];
    if (v === undefined || v === null) {
      if (spec.required !== false) return `missing required parameter '${name}'`;
      continue;
    }
    if (typeof v !== spec.type) {
      return `parameter '${name}' must be ${spec.type}, got ${typeof v}`;
    }
  }
  for (const name of Object.keys(params)) {
    if (!(name in def.parameters)) return `undeclared parameter '${name}'`;
  }
  return null;
}

export function checkPreconditions(
  def: ActionTypeDef,
  params: Record<string, unknown>,
  state: WorldState,
): string | null {
  for (const p of def.validation ?? []) {
    if (p.kind === "object_exists") {
      const key = String(params[p.key_from_param]);
      if (!state.objects.has(`${p.object_type}/${key}`)) {
        return `precondition failed: ${p.object_type} '${key}' does not exist in this world`;
      }
    } else if (p.kind === "param_range") {
      const v = Number(params[p.param]);
      if (p.min !== undefined && v < p.min) return `precondition failed: ${p.param} < ${p.min}`;
      if (p.max !== undefined && v > p.max) return `precondition failed: ${p.param} > ${p.max}`;
    }
  }
  return null;
}
