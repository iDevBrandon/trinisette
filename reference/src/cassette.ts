import { hash } from "./canonical.js";
import { pool } from "./store.js";

/**
 * Recording proxy for non-deterministic I/O (ADR-004).
 *
 * Every call that is not a pure function of the current state — an LLM completion,
 * a clock read, a demand draw, a third-party GET — goes through `nd`. In RECORD mode
 * the real function runs and its result is written to the cassette before the caller
 * sees it. In REPLAY mode the function is never called; the recorded response is
 * returned. That is what makes `materialize` reproducible (I4).
 *
 * Two implementation details that the schema in the doc did not pin down:
 *
 *  1. The cassette is scoped by `snapshot_before` — the state the call was made FROM,
 *     which is known at call time. The resulting snapshot id is a content hash and does
 *     not exist yet, so it cannot be the key.
 *  2. The lookup key folds in an OCCURRENCE counter, so a step that deliberately makes
 *     the same request twice (two samples from one prompt) records two distinct rows
 *     and replays them in the same order.
 */
export type Mode = "record" | "replay";

export class Cassette {
  private occurrences = new Map<string, number>();
  private callIndex = 0;

  constructor(
    readonly snapshotBefore: string,
    readonly mode: Mode,
  ) {}

  private keyFor(request: unknown): string {
    const base = hash(request);
    const n = this.occurrences.get(base) ?? 0;
    this.occurrences.set(base, n + 1);
    return hash({ request: base, occurrence: n });
  }

  async nd<T>(request: unknown, fn: () => Promise<T> | T): Promise<T> {
    const requestHash = this.keyFor(request);

    const found = await pool.query<{ response: { v: T } }>(
      `select response from cassette where snapshot_id = $1 and request_hash = $2`,
      [this.snapshotBefore, requestHash],
    );

    if (found.rowCount && found.rowCount > 0) {
      return found.rows[0].response.v;
    }

    if (this.mode === "replay") {
      throw new Error(
        `cassette miss during replay: snapshot=${this.snapshotBefore} request=${requestHash.slice(0, 10)} ` +
          `— this call was never recorded, so this step is not reproducible`,
      );
    }

    const value = await fn();
    await pool.query(
      `insert into cassette (snapshot_id, call_index, request_hash, response)
       values ($1,$2,$3,$4) on conflict do nothing`,
      [this.snapshotBefore, this.callIndex++, requestHash, { v: value }],
    );
    return value;
  }
}
