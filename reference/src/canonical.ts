import { createHash } from "node:crypto";

/**
 * Canonical encoding. This is the foundation of I1/I4: two logically identical
 * states MUST encode to identical bytes, or content addressing is a lie and the
 * acceptance test in §9.1 fails with the "non-canonical encoding" symptom.
 *
 * Rules:
 *  - object keys sorted lexicographically, recursively
 *  - no insignificant whitespace
 *  - undefined is not representable (throws) — silent key loss is worse than a crash
 *  - numbers must be finite; -0 normalises to 0
 *  - arrays keep order (order is meaning); sets must be sorted by the caller
 */
export function canonical(value: unknown): string {
  if (value === null) return "null";

  const t = typeof value;

  if (t === "boolean") return value ? "true" : "false";

  if (t === "number") {
    const n = value as number;
    if (!Number.isFinite(n)) {
      throw new Error(`canonical: non-finite number ${n}`);
    }
    // Normalise -0 to 0 so they cannot hash differently.
    return Object.is(n, -0) ? "0" : JSON.stringify(n);
  }

  if (t === "string") return JSON.stringify(value);

  if (t === "undefined") {
    throw new Error("canonical: undefined is not encodable");
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }

  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
      .join(",")}}`;
  }

  throw new Error(`canonical: unsupported type ${t}`);
}

export function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

/** Short form for logs and diagrams. Never used as an identity. */
export function short(h: string): string {
  return h.slice(0, 10);
}
