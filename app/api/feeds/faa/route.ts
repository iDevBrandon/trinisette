/**
 * The ingestion boundary.
 *
 * This is the only place in the system where non-determinism enters: a network fetch,
 * at a wall-clock moment, against an upstream nobody here controls. Everything
 * downstream of it — the parse, the model, the snapshot address — is a pure function of
 * the bytes that came back.
 *
 * So the bytes are what gets recorded. The response carries `bodySha256` alongside the
 * parsed entries, and `IngestFaaStatus` takes the whole payload as its parameter, which
 * means the hash of the resulting snapshot depends on exactly what the FAA said at that
 * moment. That is the cassette: keep the payload, replay it into a fresh world, and you
 * get a byte-identical state back. A dashboard that fetched straight into a component
 * could not offer that, because there would be nothing to replay.
 *
 * `live: false` is returned — never hidden — when the upstream could not be reached and
 * the synthetic fixture was served instead.
 */
import { NextResponse } from "next/server";
import { FAA_FIXTURE, parseFaaStatus } from "../../../../lib/feeds/faa";
import { FAA_FEED_URL } from "../../../../lib/feeds/sources";
import { sha256Hex } from "../../../../lib/tri/hash";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const fetchedAt = new Date().toISOString();

  let xml = "";
  let live = false;
  let error: string | null = null;

  try {
    const res = await fetch(FAA_FEED_URL, {
      cache: "no-store",
      headers: { accept: "application/xml, text/xml;q=0.9, */*;q=0.8" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    xml = await res.text();
    if (!/AIRPORT_STATUS_INFORMATION|Delay_type/i.test(xml)) {
      throw new Error("upstream returned an unexpected document");
    }
    live = true;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    xml = FAA_FIXTURE;
  }

  let entries;
  try {
    entries = parseFaaStatus(xml);
  } catch (e) {
    // A parse failure against a live document must not silently degrade into the
    // fixture's numbers — say so, and let the caller decide.
    return NextResponse.json(
      { ok: false, live, error: `parse failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    feedId: "faa.nasstatus",
    url: FAA_FEED_URL,
    /** Wall clock. Recorded, never read by anything reproducible (§ADR-004). */
    fetchedAt,
    /** false = the synthetic fixture was served because the upstream was unreachable. */
    live,
    source: live ? "upstream" : "fixture",
    error,
    bytes: xml.length,
    /** The cassette key. Same bytes in, same address out. */
    bodySha256: sha256Hex(xml),
    entries,
  });
}
