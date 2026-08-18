/**
 * One airport's queue feed, through the same ingestion boundary as FAA.
 *
 * Same contract: the bytes are hashed, the instant is recorded, and everything the world
 * does downstream is a pure function of what came back. What differs is that there is no
 * shared schema across thirty airports, so the response also carries `via` — whether the
 * records were found at a pinned path or inferred by shape. An inferred parse is a guess
 * that says it is a guess.
 *
 * `?raw=1` returns the body and a key-tree summary. That is the tool for wiring a new
 * airport: hit it once against the real upstream, read the shape, pin `path` and `fields`
 * in `lib/feeds/queue.ts`, and the guessing stops for that airport forever.
 */
import { NextResponse } from "next/server";
import { adapterFor, normalizeQueue, shapeOf } from "../../../../../lib/feeds/queue";
import { byIata } from "../../../../../lib/feeds/sources";
import { sha256Hex } from "../../../../../lib/tri/hash";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_RAW = 200_000;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ iata: string }> },
) {
  const { iata: rawIata } = await params;
  const iata = rawIata.toUpperCase();
  const fetchedAt = new Date().toISOString();
  const wantRaw = new URL(req.url).searchParams.get("raw") === "1";

  const source = byIata(iata);
  if (!source) {
    return NextResponse.json({ ok: false, iata, error: "not in the source survey" }, { status: 404 });
  }
  if (source.tier === "none") {
    return NextResponse.json({
      ok: false, iata, tier: source.tier,
      error: "no queue feed for this airport — it is on the board through FAA status alone. Graft a bank shape instead.",
    }, { status: 409 });
  }

  const adapter = adapterFor(iata);
  if (!adapter) {
    return NextResponse.json({
      ok: false, iata, error: `no adapter yet for ${iata} — ${source.url ?? "no upstream recorded"}`,
    }, { status: 501 });
  }
  if (adapter.blocked) {
    return NextResponse.json({ ok: false, iata, url: adapter.url, error: adapter.blocked }, { status: 501 });
  }

  let text = "";
  let httpStatus = 0;
  try {
    const res = await fetch(adapter.url, {
      cache: "no-store",
      method: adapter.transport === "graphql" ? "POST" : "GET",
      headers: adapter.headers ?? { accept: "application/json, text/plain, */*" },
      body: adapter.transport === "graphql" ? adapter.body : undefined,
      signal: AbortSignal.timeout(9000),
    });
    httpStatus = res.status;
    text = await res.text();
    if (!res.ok) throw new Error(`upstream ${res.status}`);
  } catch (e) {
    return NextResponse.json({
      ok: false, iata, url: adapter.url, transport: adapter.transport,
      httpStatus, fetchedAt,
      error: e instanceof Error ? e.message : String(e),
      hint: "This container has no outbound network. Run it locally to reach the upstream.",
    }, { status: 502 });
  }

  const bodySha256 = sha256Hex(text);

  if (adapter.transport === "html") {
    // No generic HTML extractor. Writing one blind produces a scraper that looks like it
    // works and silently returns nothing the first time the markup shifts.
    return NextResponse.json({
      ok: false, iata, url: adapter.url, transport: "html", fetchedAt, bodySha256,
      bytes: text.length,
      error: "HTML upstream — needs a per-airport extractor pinned from a real page",
      ...(wantRaw ? { raw: text.slice(0, MAX_RAW) } : {}),
    }, { status: 501 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json({
      ok: false, iata, url: adapter.url, fetchedAt, bodySha256, bytes: text.length,
      error: "upstream did not return JSON",
      ...(wantRaw ? { raw: text.slice(0, MAX_RAW) } : {}),
    }, { status: 502 });
  }

  const { readings, via, hourly, userReported, level } = normalizeQueue(parsed, adapter);

  return NextResponse.json({
    ok: readings.length > 0,
    feedId: `queue.${iata.toLowerCase()}`,
    iata,
    url: adapter.url,
    tier: source.tier,
    fetchedAt,
    live: true,
    /** "pinned-path" is wired; "inferred" is a shape guess and should be pinned. */
    via,
    bytes: text.length,
    bodySha256,
    readings,
    /** A published 24-hour forecast, when the upstream has one. Real shape beats a model. */
    ...(hourly ? { hourly } : {}),
    ...(userReported != null ? { userReported } : {}),
    ...(level ? { level } : {}),
    ...(readings.length === 0
      ? { error: "no checkpoint-shaped records found — pin `path` and `fields` for this adapter" }
      : {}),
    ...(wantRaw ? { shape: shapeOf(parsed), raw: text.slice(0, MAX_RAW) } : {}),
  });
}
