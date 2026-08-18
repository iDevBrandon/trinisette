/**
 * Queue feeds — the 30 wired airports.
 *
 * FAA NAS Status is one endpoint for the whole network. Checkpoint waits are not: every
 * airport publishes its own way, and the survey in `sources.ts` lists thirty different
 * upstreams — open JSON, a GraphQL endpoint, an .ashx proxy, a keyed raw endpoint, and
 * several HTML pages. There is no shared schema to code against.
 *
 * So this is an adapter layer with three parts:
 *
 *   1. A per-airport ADAPTER: the URL, the transport, and any headers the public page
 *      itself sends. Nothing here impersonates a browser — an endpoint that only answers
 *      to a spoofed user agent is one to leave alone, not one to work around.
 *
 *   2. A tolerant NORMALIZER that walks an unknown JSON body looking for records that
 *      have a name-ish field and a wait-ish number. Roughly half of these shapes will
 *      fall out of that with no per-airport code at all.
 *
 *   3. A per-airport PIN for the rest: once a real response has been seen, name the path
 *      and the fields and the guessing stops.
 *
 * The pins are empty on purpose. Writing a parser for a response nobody has looked at is
 * guessing dressed as work — and this sandbox has no outbound network, so none of these
 * endpoints can be checked from here. `/api/feeds/queue/<iata>?raw=1` returns the body
 * and a shape summary so a real response can be read once and pinned exactly.
 */
import { SOURCES } from "./sources";

/* ── the normalized reading ──────────────────────────────────────────────── */

export interface QueueReading {
  /** The upstream's own name for the checkpoint, verbatim. */
  checkpoint: string;
  /** Minutes. null when the upstream says closed, or publishes a level instead. */
  waitMin: number | null;
  /** Qualitative level where that is all the upstream gives (CLE publishes lane levels). */
  level?: string;
  open?: boolean;
  terminal?: string;
}

/** An upstream's published 24-hour forecast. Real shape beats a modelled gaussian. */
export interface HourlyPoint { hour: number; waitMin: number }

export interface QueueSnapshot {
  readings: QueueReading[];
  /** Present when the upstream publishes a forward curve. */
  hourly?: HourlyPoint[];
  /** Some upstreams carry their own crowd signal alongside the official number. */
  userReported?: number | null;
  /** Qualitative summary the upstream puts next to the number. */
  level?: string;
}

/* ── adapters ────────────────────────────────────────────────────────────── */

export type Transport = "json" | "html" | "graphql";

export interface QueueAdapter {
  iata: string;
  url: string;
  transport: Transport;
  /**
   * Headers the airport's own public page sends when it calls this endpoint. A Referer
   * is ordinary client behaviour, not circumvention; if an endpoint needs more than this
   * to answer, treat that as a decline rather than a puzzle.
   */
  headers?: Record<string, string>;
  /** POST body, for GraphQL upstreams. */
  body?: string;
  /** Dotted path to the array of checkpoint records. Set this once a real body is seen. */
  path?: string;
  /** Field-name pins, once a real body is seen. */
  fields?: { name?: string; wait?: string; level?: string; open?: string; terminal?: string };
  /**
   * The escape hatch. Some shapes are not an array of records at all — SLC publishes one
   * airport-wide number plus a nested map — and no declarative pin covers that. A small
   * pure function from parsed body to readings is the honest answer; pretending a path
   * expression can express every upstream is not.
   */
  extract?: (body: unknown) => QueueSnapshot;
  /** Why this one is not wired yet, if it is not. */
  blocked?: string;
}

const UA = "airport-now/0.1 (+https://github.com/mylee04/airport-now)";
const page = (referer: string): Record<string, string> => ({
  accept: "application/json, text/plain, */*",
  referer,
  "user-agent": UA,
});

/**
 * Transport and headers come from the survey's own notes. Paths and fields are unset —
 * they get pinned from a real response, not from a guess.
 */
export const ADAPTERS: QueueAdapter[] = [
  // ── open JSON, no special headers ────────────────────────────────────────
  { iata: "SLC", url: "https://slcairport.com/ajaxtsa/waittimes", transport: "json", extract: extractSlcFamily },
  { iata: "PDX", url: "https://www.pdx.com/TSAWaitTimesRefresh", transport: "json", extract: extractPdx },
  // DTW is a flat [{Name, WaitTime}] — the generic pass already reads it, pinned so a
  // renamed field fails loudly instead of returning an empty board.
  { iata: "DTW", url: "https://proxy.metroairport.com/SkyFiiTSAProxy.ashx", transport: "json", fields: { name: "Name", wait: "WaitTime" } },
  { iata: "CLE", url: "https://www.clevelandairport.com/tsa-wait-times-api", transport: "json", extract: extractCle },
  { iata: "PHX", url: "https://api.phx.aero/avn-wait-times/raw?Key=4f85fe2ef5a240d59809b63de94ef536", transport: "json", extract: extractPhx },
  { iata: "DCA", url: "https://www.flyreagan.com/security-wait-times", transport: "json", extract: extractMwaa },
  { iata: "IAD", url: "https://www.flydulles.com/security-wait-times", transport: "json", extract: extractMwaa },

  // ── page-backed APIs: the public page sends a Referer, so we send the same ──
  { iata: "CVG", url: "https://api.cvgairport.mobi/checkpoints/CVG", transport: "json", headers: page("https://www.cvgairport.com/"), blocked: "returns 401 with the public page's Referer — this endpoint needs a credential the page holds. Lifting a key out of a page script is the line this project does not cross; if the operator wants it read, they can issue one." },
  { iata: "IAH", url: "https://api.houstonairports.mobi/wait-times/checkpoint/iah", transport: "json", headers: page("https://www.fly2houston.com/"), blocked: "returns 401 with the public page's Referer — this endpoint needs a credential the page holds. Lifting a key out of a page script is the line this project does not cross; if the operator wants it read, they can issue one." },
  { iata: "HOU", url: "https://api.houstonairports.mobi/wait-times/checkpoint/hou", transport: "json", headers: page("https://www.fly2houston.com/"), blocked: "returns 401 with the public page's Referer — this endpoint needs a credential the page holds. Lifting a key out of a page script is the line this project does not cross; if the operator wants it read, they can issue one." },
  { iata: "MCO", url: "https://api.goaa.aero/wait-times/checkpoint/MCO", transport: "json", headers: page("https://orlandoairports.net/"), blocked: "returns 401 with the public page's Referer — this endpoint needs a credential the page holds. Lifting a key out of a page script is the line this project does not cross; if the operator wants it read, they can issue one." },
  { iata: "EWR", url: "https://avi-prod-mpp-webapp-api.azurewebsites.net/api/v1/SecurityWaitTimesPoints/EWR", transport: "json", headers: page("https://www.newarkairport.com/"), extract: extractEwr },
  { iata: "MIA", url: "https://www.miami-airport.com/tsa-waittimes.asp", transport: "json", headers: page("https://www.miami-airport.com/"), blocked: "the survey recorded the public page, not the endpoint it calls — this URL returns HTML. The real API is named in the page's own script and needs to be read out once, then pinned here." },
  { iata: "DFW", url: "https://www.dfwairport.com/security/", transport: "json", headers: page("https://www.dfwairport.com/"), blocked: "the survey recorded the public page, not the endpoint it calls — this URL returns HTML. The real API is named in the page's own script and needs to be read out once, then pinned here." },
  { iata: "CLT", url: "https://www.cltairport.com/airport-info/security/", transport: "json", headers: page("https://www.cltairport.com/"), blocked: "the survey recorded the public page, not the endpoint it calls — this URL returns HTML. The real API is named in the page's own script and needs to be read out once, then pinned here." },
  { iata: "PHL", url: "https://www.phl.org/flights/security-information/checkpoint-hours", transport: "json", headers: page("https://www.phl.org/"), blocked: "the survey recorded the public page, not the endpoint it calls — this URL returns HTML. The real API is named in the page's own script and needs to be read out once, then pinned here." },

  // ── GraphQL ──────────────────────────────────────────────────────────────
  {
    iata: "JFK", url: "https://api.jfkairport.com/graphql", transport: "graphql",
    headers: { "content-type": "application/json", accept: "application/json", "user-agent": UA },
    blocked: "query not pinned yet — needs the operation the public homepage sends",
  },

  // ── HTML: a per-airport extractor, once a real page has been read ────────
  { iata: "ATL", url: "https://dev.atl.com/atlsync/security-wait-times/", transport: "html" },
  { iata: "BNA", url: "https://flynashville.com/", transport: "html" },
  { iata: "BWI", url: "https://bwiairport.com/", transport: "html" },
  { iata: "DEN", url: "https://www.flydenver.com/security/", transport: "html" },
  { iata: "LAX", url: "https://www.flylax.com/wait-times", transport: "html" },
  { iata: "MSP", url: "https://www.mspairport.com/airport/security-screening/security-wait-times", transport: "html" },
  { iata: "CHS", url: "https://iflychs.com/passengers/security-checkpoint/", transport: "html" },
  { iata: "CMH", url: "https://flycolumbus.com/passengers/security/", transport: "html" },
  { iata: "JAX", url: "https://flyjacksonville.com/jaa/content.aspx?id=3583", transport: "html" },
  { iata: "OMA", url: "https://www.flyoma.com/passenger-services/security-checkpoint-wait-times/", transport: "html" },
  { iata: "SAT", url: "https://flysanantonio.com/home/flights/security-checkpoints-wait-time/", transport: "html" },
  { iata: "STL", url: "https://www.flystl.com/tsa-security/", transport: "html" },
  {
    iata: "PIT", url: "https://flypittsburgh.com/pittsburgh-international-airport/security/", transport: "html",
    blocked: "endpoint and subscription key live in the public page script — read them from the page rather than hardcoding a key",
  },
];

export const adapterFor = (iata: string) => ADAPTERS.find((a) => a.iata === iata.toUpperCase());

/** Airports the survey lists as wired but that have no adapter row yet. */
export const missingAdapters = () =>
  SOURCES.filter((s) => s.url && !ADAPTERS.some((a) => a.iata === s.iata)).map((s) => s.iata);


/* ── pinned extractors ───────────────────────────────────────────────────── */

const isRecordEarly = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : toMinutes(v);

/**
 * SLC — pinned against a real response (2026-08-17).
 *
 *   { code, name, city, state, latitude, longitude, utc,
 *     rightnow, rightnow_description, user_reported, precheck,
 *     faa_alerts: { ground_stops, ground_delays, general_delays },
 *     estimated_hourly_times: [24 × { timeslot, waittime, hour }],
 *     precheck_checkpoints: { "Terminal 1": { "Checkpoint 1": "…" } } }
 *
 * There is no array of checkpoints: the upstream publishes one airport-wide number and
 * a PreCheck number, so that is what gets reported rather than an invented breakdown.
 * `precheck_checkpoints` maps terminal → checkpoint → a string whose units are not yet
 * known from the shape alone, so it is carried as a `level` and not read as minutes —
 * guessing at units is how a wrong number gets posted with a confident face.
 *
 * NOTE: this payload matches the format tsawaittimes.com documents for its own API. If
 * the airport is re-serving a third-party estimate rather than measuring, the survey's
 * tier for SLC is `official_estimate`, not `official`. Worth confirming at the source.
 */
function extractSlcFamily(body: unknown): QueueSnapshot {
  if (!isRecordEarly(body)) return { readings: [] };

  const readings: QueueReading[] = [];
  const general = num(body.rightnow);
  if (general !== null) {
    readings.push({
      checkpoint: "All checkpoints",
      waitMin: general,
      level: typeof body.rightnow_description === "string" ? body.rightnow_description : undefined,
    });
  }
  const pre = num(body.precheck);
  if (pre !== null) readings.push({ checkpoint: "PreCheck", waitMin: pre });

  // terminal → checkpoint → status. Carried as a level; the units are not established.
  const pcc = body.precheck_checkpoints;
  if (isRecordEarly(pcc)) {
    for (const [terminal, lanes] of Object.entries(pcc)) {
      if (!isRecordEarly(lanes)) continue;
      for (const [lane, raw] of Object.entries(lanes)) {
        const mins = toMinutes(raw);
        readings.push({
          checkpoint: `${terminal} · ${lane}`,
          waitMin: mins,
          level: mins === null && typeof raw === "string" ? raw : undefined,
          terminal,
        });
      }
    }
  }

  const hourly: HourlyPoint[] = [];
  if (Array.isArray(body.estimated_hourly_times)) {
    for (const row of body.estimated_hourly_times) {
      if (!isRecordEarly(row)) continue;
      const hour = typeof row.hour === "number" ? row.hour : Number(row.hour);
      const waitMin = num(row.waittime);
      if (Number.isFinite(hour) && waitMin !== null) hourly.push({ hour: ((hour % 24) + 24) % 24, waitMin });
    }
    hourly.sort((a, b) => a.hour - b.hour);
  }

  return {
    readings,
    hourly: hourly.length ? hourly : undefined,
    userReported: num(body.user_reported),
    level: typeof body.rightnow_description === "string" ? body.rightnow_description : undefined,
  };
}


/**
 * PDX — pinned 2026-08-18 against a real response.
 *
 *   { WaitTimes: [4 × { CounterId, CounterName, PredictedDwell, EstimatedDwell,
 *                       Occupancy, DisplayText }],
 *     NorthCheckpointClosed: bool, SouthCheckpointClosed: bool, … }
 *
 * `DisplayText` is the posted wait in minutes. `EstimatedDwell` is NOT that, and is not
 * read here at all. The measured response settles it:
 *
 *     NorthGeneral   dwell 224  display 8
 *     NorthPrecheck  dwell  32  display 4
 *     SouthGeneral   dwell 337  display 9
 *     SouthPrecheck  dwell 382  display 6
 *
 * The ratios are 28, 8, 37, 64 — not a constant, so dwell is not the same quantity in
 * another unit. The rank order disagrees too: dwell puts SouthPrecheck highest, which no
 * real queue does relative to its own general lane. Display's order (general above
 * precheck, south above north) is the one that describes a checkpoint.
 *
 * An earlier version of this guessed dwell was seconds and divided anything over 240.
 * That would have posted a 3h44m wait for NorthGeneral and 32 minutes for a 4-minute
 * PreCheck line. It was worse than having no adapter: without it the parse failed loudly
 * and returned nothing, and with it the failure came back wearing a plausible number.
 */
function extractPdx(body: unknown): QueueSnapshot {
  if (!isRecordEarly(body) || !Array.isArray(body.WaitTimes)) return { readings: [] };

  const closed = (name: string): boolean | undefined => {
    const n = name.toLowerCase();
    if (n.includes("north") && typeof body.NorthCheckpointClosed === "boolean") return !body.NorthCheckpointClosed;
    if (n.includes("south") && typeof body.SouthCheckpointClosed === "boolean") return !body.SouthCheckpointClosed;
    return undefined;
  };

  const readings: QueueReading[] = [];
  for (const row of body.WaitTimes) {
    if (!isRecordEarly(row)) continue;
    const name = typeof row.CounterName === "string" ? row.CounterName.trim() : "";
    if (!name) continue;
    const display = row.DisplayText;
    const waitMin = toMinutes(display);
    readings.push({
      // "NorthGeneral" → "North · General", which is what the signage says.
      checkpoint: name.replace(/([a-z])([A-Z])/g, "$1 · $2").replace(/Precheck/i, "PreCheck"),
      waitMin,
      // Only when the upstream said something that is not a number — "Closed", "<5".
      level: waitMin === null && typeof display === "string" && display.trim() ? display.trim() : undefined,
      open: closed(name),
    });
  }
  return { readings };
}

/**
 * CLE — pinned 2026-08-18. Qualitative lane levels, exactly as the survey noted.
 *
 *   [ { field_json: { a, b, c, apre, bpre, cpre } } ]
 *
 * a/b/c are checkpoints A/B/C and their values are levels, not minutes. The `*pre` flags
 * are PreCheck availability. Nothing here is a number and nothing is invented into one:
 * a level with no minutes is reported as a level, and the model supplies the figure.
 */
function extractCle(body: unknown): QueueSnapshot {
  const row = Array.isArray(body) ? body[0] : body;
  const f = isRecordEarly(row) ? row.field_json : undefined;
  if (!isRecordEarly(f)) return { readings: [] };

  const readings: QueueReading[] = [];
  for (const lane of ["a", "b", "c"]) {
    const raw = f[lane];
    if (raw === undefined || raw === null || raw === "") continue;
    const mins = toMinutes(raw);
    readings.push({
      checkpoint: `Checkpoint ${lane.toUpperCase()}`,
      waitMin: mins,
      level: mins === null ? String(raw) : undefined,
    });
    if (f[`${lane}pre`] === true) {
      readings.push({ checkpoint: `Checkpoint ${lane.toUpperCase()} PreCheck`, waitMin: null, level: "available" });
    }
  }
  return { readings };
}

/**
 * PHX — pinned 2026-08-18.
 *
 *   { success, current: [5 × { queueName, projectedWaitTime,
 *                             projectedMinWaitMinutes, projectedMaxWaitMinutes, … }] }
 *
 * The generic pass already found this one, but it is pinned anyway: an inferred parse
 * survives only until the upstream renames a field, and then it returns nothing quietly.
 *
 * Two fields carry an explicit `Minutes` suffix and one does not, so the unsuffixed one
 * is checked against the range rather than trusted. If it falls outside, the upper bound
 * wins — a posted wait that under-promises is the worse error.
 */
function extractPhx(body: unknown): QueueSnapshot {
  if (!isRecordEarly(body) || !Array.isArray(body.current)) return { readings: [] };

  const readings: QueueReading[] = [];
  for (const row of body.current) {
    if (!isRecordEarly(row)) continue;
    const name = typeof row.queueName === "string" ? row.queueName.trim() : "";
    if (!name) continue;

    const lo = num(row.projectedMinWaitMinutes);
    const hi = num(row.projectedMaxWaitMinutes);
    const point = num(row.projectedWaitTime);
    const consistent = point !== null && lo !== null && hi !== null && point >= lo - 1 && point <= hi + 1;
    const waitMin = consistent ? point : (hi ?? point ?? lo);

    readings.push({
      checkpoint: name,
      waitMin,
      level: lo !== null && hi !== null ? `${lo}–${hi} min` : undefined,
    });
  }
  return { readings };
}

/**
 * DCA and IAD — pinned 2026-08-18. One shape, two airports (same authority).
 *
 *   { response: { res: { A: { location, waittime, gates, isDisabled, pre, pre_disabled },
 *                        B: {…}, D: {…} } } }
 *
 * `res` is keyed by concourse letter, so the generic pass lifts it and names the rows
 * A/B/D. `location` is the better name and is pinned here. PreCheck is a second wait on
 * the same row and becomes its own reading rather than being averaged into the main one.
 */
function extractMwaa(body: unknown): QueueSnapshot {
  const res = isRecordEarly(body) && isRecordEarly(body.response) ? body.response.res : undefined;
  if (!isRecordEarly(res)) return { readings: [] };

  const readings: QueueReading[] = [];
  for (const [letter, raw] of Object.entries(res)) {
    if (!isRecordEarly(raw)) continue;
    const loc = typeof raw.location === "string" && raw.location.trim() ? raw.location.trim() : letter;
    const disabled = Number(raw.isDisabled) === 1;
    readings.push({
      checkpoint: loc,
      waitMin: disabled ? null : toMinutes(raw.waittime),
      level: typeof raw.gates === "string" && raw.gates.trim() ? `gates ${raw.gates.trim()}` : undefined,
      open: disabled ? false : undefined,
    });
    if (raw.pre !== undefined && Number(raw.pre_disabled) !== 1) {
      const pre = toMinutes(raw.pre);
      if (pre !== null) readings.push({ checkpoint: `${loc} PreCheck`, waitMin: pre });
    }
  }
  return { readings };
}


/**
 * EWR — pinned 2026-08-18. The richest shape in the survey, and the only page-backed
 * API of the four that answered without a credential.
 *
 *   [10 × { pointID, timeInSeconds, timeInMinutes, title, passengerCount,
 *           area, gate, terminal, checkPoint, queueType, queueOpen,
 *           updateTime, isWaitTimeAvailable, status, … }]
 *
 * Two fields carry the same quantity in different units, so they check each other: if
 * `timeInSeconds` does not agree with `timeInMinutes` the reading is dropped rather than
 * posted. `isWaitTimeAvailable` is the upstream saying it does not know — which is a
 * different claim from a zero-minute wait, and is kept different here.
 */
function extractEwr(body: unknown): QueueSnapshot {
  const rows = Array.isArray(body) ? body : isRecordEarly(body) && Array.isArray(body.data) ? body.data : null;
  if (!rows) return { readings: [] };

  const readings: QueueReading[] = [];
  for (const r of rows) {
    if (!isRecordEarly(r)) continue;

    const base = looksTextual(r.title) ? String(r.title).trim()
      : looksTextual(r.checkPoint) ? String(r.checkPoint).trim() : "";
    if (!base) continue;
    const qType = looksTextual(r.queueType) ? String(r.queueType).trim() : "";
    const checkpoint = qType && !base.toLowerCase().includes(qType.toLowerCase())
      ? `${base} · ${qType}` : base;

    const open = typeof r.queueOpen === "boolean" ? r.queueOpen : undefined;
    const known = r.isWaitTimeAvailable !== false;

    let waitMin: number | null = null;
    if (open !== false && known) {
      const mins = num(r.timeInMinutes);
      const secs = num(r.timeInSeconds);
      // Agree within a minute of rounding, or the pair is not what it looks like.
      if (mins !== null && secs !== null) {
        waitMin = Math.abs(secs / 60 - mins) <= 1.5 ? mins : null;
      } else {
        waitMin = mins ?? (secs !== null ? Math.round(secs / 60) : null);
      }
    }

    readings.push({
      checkpoint,
      waitMin,
      level: waitMin === null
        ? (!known ? "wait time unavailable" : open === false ? "closed" : looksTextual(r.status) ? String(r.status).trim() : undefined)
        : undefined,
      open,
      terminal: looksTextual(r.terminal) ? String(r.terminal).trim() : undefined,
    });
  }
  return { readings };
}

/* ── the tolerant normalizer ─────────────────────────────────────────────── */

const NAME_KEYS = [
  "checkpoint", "checkpointname", "name", "location", "title", "label",
  "securitycheckpoint", "gate", "lane", "concourse", "displayname", "description",
];
const WAIT_KEYS = [
  "waitminutes", "waittimeinminutes", "estimatedwaitminutes", "waittime", "wait",
  "currentwait", "queuetime", "estimatedwait", "avgwait", "averagewait", "minutes", "duration",
];
const LEVEL_KEYS = ["level", "waitlevel", "congestion", "severity", "band", "category"];
const OPEN_KEYS = ["isopen", "open", "isactive", "active", "status", "state"];
const TERMINAL_KEYS = ["terminal", "terminalname", "terminalcode", "building"];

const norm = (k: string) => k.toLowerCase().replace(/[^a-z]/g, "");

/**
 * Find a field by name — and by whether its VALUE is the kind of thing being asked for.
 *
 * Without the validator this mis-picks. EWR publishes both `timeInMinutes` (the answer)
 * and `isWaitTimeAvailable` (a boolean), and a substring pass for "wait" reaches the
 * boolean first, coerces it to null, and concludes the record has no wait time at all —
 * on a response that is full of wait times. Name similarity alone is not enough evidence
 * that a field is the one wanted.
 */
function pick(
  rec: Record<string, unknown>,
  keys: string[],
  ok: (v: unknown) => boolean = () => true,
): unknown {
  for (const want of keys) {
    for (const k of Object.keys(rec)) if (norm(k) === want && ok(rec[k])) return rec[k];
  }
  // Second pass: substring match, so `securityWaitTimeMinutes` still lands.
  for (const want of keys) {
    for (const k of Object.keys(rec)) if (norm(k).includes(want) && ok(rec[k])) return rec[k];
  }
  return undefined;
}

const looksNumeric = (v: unknown) => toMinutes(v) !== null;
const looksTextual = (v: unknown) => typeof v === "string" && v.trim() !== "";

/**
 * "12" · 12 · "12 min" · "00:12:00" · "12-20" → minutes. Anything else → null.
 * A range takes its upper bound: a posted wait that under-promises is the wrong error.
 */
export function toMinutes(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;

  const hms = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (hms) return Number(hms[1]) * 60 + Number(hms[2]);

  const range = /(\d+)\s*[-–—to]+\s*(\d+)/i.exec(s);
  if (range) return Number(range[2]);

  const hm = /(\d+)\s*h(?:ou)?rs?\b/i.exec(s);
  const mm = /(\d+)\s*m(?:in)?/i.exec(s);
  if (hm || mm) return (hm ? Number(hm[1]) * 60 : 0) + (mm ? Number(mm[1]) : 0);

  // "<5", "≤5", "5+", "under 5" — a bound is still a number, and the bound is the answer.
  const bound = /^(?:<|≤|under\s+|over\s+|>)?\s*(\d+(?:\.\d+)?)\s*\+?$/i.exec(s);
  return bound ? Math.round(Number(bound[1])) : null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Does this object look like a checkpoint reading? */
function scores(rec: unknown): boolean {
  if (!isRecord(rec)) return false;
  const hasName = typeof pick(rec, NAME_KEYS, looksTextual) === "string";
  const hasWait =
    pick(rec, WAIT_KEYS, looksNumeric) !== undefined ||
    pick(rec, LEVEL_KEYS, looksTextual) !== undefined;
  return hasName && hasWait;
}

function atPath(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, seg) => {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) return cur[Number(seg)];
    return isRecord(cur) ? cur[seg] : undefined;
  }, root);
}

/**
 * Breadth-first for the first collection where most elements look like readings.
 *
 * Handles object maps as well as arrays, because several upstreams key checkpoints by
 * name rather than listing them — `{"Terminal 1": {"Checkpoint 1": …}}` is a checkpoint
 * collection even though it is not an array, and an extractor that only knows about
 * arrays reports "no data" on a response that is full of data.
 */
function findRecordArray(root: unknown): unknown[] | null {
  const queue: unknown[] = [root];
  let guard = 0;
  while (queue.length && guard++ < 5000) {
    const cur = queue.shift();
    if (Array.isArray(cur) && cur.length) {
      if (cur.filter(scores).length / cur.length >= 0.6) return cur;
      queue.push(...cur);
    } else if (isRecord(cur)) {
      const vals = Object.values(cur);
      // A map of name → record, lifted into records that carry their own key as a name.
      if (vals.length && vals.every(isRecord)) {
        const lifted = Object.entries(cur).map(([k, v]) => ({ name: k, ...(v as object) }));
        if (lifted.filter(scores).length / lifted.length >= 0.6) return lifted;
      }
      queue.push(...vals);
    }
  }
  return null;
}

export interface NormalizeResult extends QueueSnapshot {
  /** How the records were located — worth surfacing, because a guess should say so. */
  via: "extractor" | "pinned-path" | "pinned-fields" | "inferred" | "none";
}

export function normalizeQueue(body: unknown, adapter?: QueueAdapter): NormalizeResult {
  // A pinned extractor is the ground truth for this upstream. Nothing is inferred.
  if (adapter?.extract) {
    const out = adapter.extract(body);
    return { ...out, readings: [...out.readings].sort((a, b) => a.checkpoint.localeCompare(b.checkpoint)), via: "extractor" };
  }

  let records: unknown[] | null = null;
  let via: NormalizeResult["via"] = "none";

  if (adapter?.path) {
    const at = atPath(body, adapter.path);
    if (Array.isArray(at)) { records = at; via = "pinned-path"; }
  }
  if (!records) {
    records = findRecordArray(body);
    // Field names pinned against a real response is still pinned: the records were
    // located by shape, but nothing about how they are read is a guess.
    if (records) via = adapter?.fields ? "pinned-fields" : "inferred";
  }
  if (!records) return { readings: [], via: "none" };

  const f = adapter?.fields;
  const readings: QueueReading[] = [];
  for (const r of records) {
    if (!isRecord(r)) continue;
    const name = f?.name ? r[f.name] : pick(r, NAME_KEYS, looksTextual);
    if (typeof name !== "string" || !name.trim()) continue;

    const rawWait = f?.wait ? r[f.wait] : pick(r, WAIT_KEYS, looksNumeric);
    const level = f?.level ? r[f.level] : pick(r, LEVEL_KEYS, looksTextual);
    const openRaw = f?.open ? r[f.open] : pick(r, OPEN_KEYS);
    const terminal = f?.terminal ? r[f.terminal] : pick(r, TERMINAL_KEYS, looksTextual);

    const open =
      typeof openRaw === "boolean" ? openRaw
      : typeof openRaw === "string" ? !/closed|inactive|unavailable/i.test(openRaw)
      : undefined;

    readings.push({
      checkpoint: name.trim(),
      waitMin: open === false ? null : toMinutes(rawWait),
      level: typeof level === "string" ? level : undefined,
      open,
      terminal: typeof terminal === "string" ? terminal : undefined,
    });
  }

  // Deterministic order — this feeds a content address.
  readings.sort((a, b) => a.checkpoint.localeCompare(b.checkpoint));
  return { readings, via };
}

/* ── shape summary, for pinning an unknown response ──────────────────────── */

/** A compact key tree, so an unseen response can be pinned without pasting all of it. */
export function shapeOf(v: unknown, depth = 0): string {
  if (depth > 4) return "…";
  if (Array.isArray(v)) return v.length ? `[${v.length} × ${shapeOf(v[0], depth + 1)}]` : "[]";
  if (isRecord(v)) {
    const keys = Object.keys(v).slice(0, 14);
    return `{${keys.map((k) => `${k}:${shapeOf(v[k], depth + 1)}`).join(", ")}${Object.keys(v).length > 14 ? ", …" : ""}}`;
  }
  return v === null ? "null" : typeof v;
}

/** Stable key for a checkpoint object, derived from the upstream's own name. */
export const checkpointKey = (iata: string, name: string) =>
  `${iata.toUpperCase()}-${name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24)}`;
