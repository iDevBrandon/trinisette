export type EffectClass = "pure" | "branchable" | "irreversible";
export type WorldKind = "primary" | "experiment" | "replay" | "shadow";
export type OriginKind = "native" | "grafted" | "synthesized";

export interface Provenance {
  origin_world_id: string;
  origin_snapshot: string;
  origin_kind: OriginKind;
}

export interface ObjectTypeDef {
  id: string;
  name: string;
  key_property: string;
  properties: Record<string, { type: "string" | "number" | "boolean"; required?: boolean }>;
}

export interface LinkTypeDef {
  id: string;
  name: string;
  from_type: string;
  to_type: string;
  cardinality: "one_to_one" | "one_to_many" | "many_to_many";
}

export interface ActionTypeDef {
  id: string;
  name: string;
  parameters: Record<string, { type: "string" | "number" | "boolean"; required?: boolean }>;
  touches: string[];
  /** Declarative preconditions, evaluated against the world state before the handler runs. */
  validation?: Precondition[];
  effect_class: EffectClass;
  required_role?: string | null;
}

export type Precondition =
  | { kind: "object_exists"; object_type: string; key_from_param: string }
  | { kind: "param_range"; param: string; min?: number; max?: number };

/** A materialized object instance inside a world. */
export interface OntoObject {
  hash: string;    // H(content, provenance) — identity, unique per world
  content: string; // H(type, key, properties) — payload, shared across worlds
  type_id: string;
  object_key: string;
  properties: Record<string, unknown>;
  provenance: Provenance;
}

export interface OntoLink {
  hash: string;
  content: string;
  type_id: string;
  from_key: string;
  to_key: string;
  properties: Record<string, unknown>;
  provenance: Provenance;
}

export interface WorldState {
  objects: Map<string, OntoObject>; // key: `${type_id}/${object_key}`
  links: Map<string, OntoLink>; // key: link hash
}

export interface Snapshot {
  id: string;
  world_id: string;
  seq: number;
  parent_id: string | null;
  lateral_source_id: string | null;
  agent_version: string;
  ontology_version: string;
  ontology_root: string;
  cause: unknown;
  deterministic: boolean;
}

export interface InvokeResult {
  invocation_id: string;
  status: "applied" | "suppressed" | "rejected";
  snapshot: Snapshot | null;
  rejected_reason?: string;
}
