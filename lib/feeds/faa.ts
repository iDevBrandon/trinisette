/**
 * The FAA NAS Status feed — the one upstream in this build that is actually live.
 *
 *   https://nasstatus.faa.gov/api/airport-status-information
 *
 * Free, no key, XML. It reports ground delay programs, ground stops, airport closures
 * and general arrival/departure delays for the whole National Airspace System. That
 * universality is the point: FAA operational status covers every airport on the board,
 * while a direct checkpoint queue feed exists for only some of them. The gap between
 * those two coverages is not a hypothetical cold-start problem — it is the shape of the
 * real network, and it is what `GraftCurve` exists to answer.
 *
 * Two deliberate choices:
 *
 *   1. No XML dependency. A ~70-line tolerant parser instead, because this has to run
 *      identically in a route handler, in a test, and against a recorded fixture, and
 *      because the FAA document's exact nesting is not contractually stable. The parser
 *      walks for records containing an <ARPT> tag rather than assuming a fixed path, so
 *      a renamed wrapper element does not silently produce zero delays.
 *
 *   2. The parse is PURE and the fetch is not. Everything below the fetch boundary is a
 *      deterministic function of the response bytes. That is what makes the capture in
 *      `app/api/feeds/faa/route.ts` a cassette: hash the bytes, and every snapshot
 *      downstream is reproducible from them (§ADR-004).
 */

/* ── a small tolerant XML reader ─────────────────────────────────────────── */

export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const EMPTY: XmlNode = { tag: "#none", attrs: {}, children: [], text: "" };

const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, "&");

export function parseXml(src: string): XmlNode {
  const root: XmlNode = { tag: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  // Strip comments, declarations and doctypes; unwrap CDATA into plain text.
  const clean = src
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c) => c);

  const tagRe = /<\s*(\/?)\s*([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)\s*>/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(clean)) !== null) {
    const [full, close, tag, rawAttrs, selfClose] = m;
    const between = clean.slice(last, m.index);
    if (between.trim()) stack[stack.length - 1].text += decode(between.trim());
    last = m.index + full.length;

    if (close) {
      // Tolerate mismatched closers: unwind to the nearest matching open tag if there
      // is one, otherwise ignore the closer rather than corrupting the stack.
      const at = stack.map((n) => n.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      continue;
    }

    const attrs: Record<string, string> = {};
    const attrRe = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(rawAttrs ?? "")) !== null) attrs[a[1]] = decode(a[2] ?? a[3] ?? "");

    const node: XmlNode = { tag, attrs, children: [], text: "" };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}

/** Depth-first search for every node with this tag name (case-insensitive). */
export function findAll(node: XmlNode, tag: string): XmlNode[] {
  const want = tag.toLowerCase();
  const out: XmlNode[] = [];
  const walk = (n: XmlNode) => {
    for (const c of n.children) {
      if (c.tag.toLowerCase() === want) out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

const first = (node: XmlNode, tag: string): XmlNode => findAll(node, tag)[0] ?? EMPTY;
const textOf = (node: XmlNode, tag: string): string => first(node, tag).text.trim();

/* ── durations ───────────────────────────────────────────────────────────── */

/**
 * "45 minutes" → 45 · "1 hour and 30 minutes" → 90 · "2 hours" → 120 · "" → null.
 * The FAA writes these as prose, so this has to be forgiving rather than clever.
 */
export function parseDurationMin(raw: string): number | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const h = /(\d+)\s*hour/i.exec(s);
  const m = /(\d+)\s*min/i.exec(s);
  if (h || m) return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  const bare = /^(\d+)$/.exec(s);
  return bare ? Number(bare[1]) : null;
}

/* ── the normalized reading ──────────────────────────────────────────────── */

export type FaaKind = "ground_delay" | "ground_stop" | "closure" | "arrival" | "departure";

export interface FaaEntry {
  iata: string;
  kind: FaaKind;
  reason: string;
  avgMin: number | null;
  minMin: number | null;
  maxMin: number | null;
  trend: string | null;
}

/** Highest impact wins, so one airport reduces to one operational headline. */
const SEVERITY: Record<FaaKind, number> = {
  closure: 5, ground_stop: 4, ground_delay: 3, departure: 2, arrival: 1,
};

export function parseFaaStatus(xml: string): FaaEntry[] {
  const doc = parseXml(xml);
  const out: FaaEntry[] = [];

  for (const block of findAll(doc, "Delay_type")) {
    const name = textOf(block, "Name").toLowerCase();

    const kindFor = (rec: XmlNode): FaaKind => {
      if (name.includes("closure")) return "closure";
      if (name.includes("ground stop")) return "ground_stop";
      if (name.includes("ground delay")) return "ground_delay";
      // Arrival/Departure records carry the direction as an attribute or a nested tag.
      const ad = first(rec, "Arrival_Departure");
      const type = (ad.attrs.Type ?? ad.attrs.type ?? textOf(rec, "Type") ?? "").toLowerCase();
      return type.startsWith("arr") ? "arrival" : "departure";
    };

    // A record is anything carrying an <ARPT>. Matching on that rather than on the
    // wrapper element name is what keeps this working if the FAA renames a container.
    const seen = new Set<XmlNode>();
    for (const arpt of findAll(block, "ARPT")) {
      const rec = owner(block, arpt) ?? block;
      if (seen.has(rec)) continue;
      seen.add(rec);

      const iata = arpt.text.trim().toUpperCase();
      if (!/^[A-Z]{3,4}$/.test(iata)) continue;

      const ad = first(rec, "Arrival_Departure");
      const scope = ad === EMPTY ? rec : ad;
      out.push({
        iata,
        kind: kindFor(rec),
        reason: textOf(rec, "Reason") || textOf(rec, "reason") || "unspecified",
        avgMin: parseDurationMin(textOf(scope, "Avg")),
        minMin: parseDurationMin(textOf(scope, "Min")),
        maxMin: parseDurationMin(textOf(scope, "Max")),
        trend: textOf(scope, "Trend") || null,
      });
    }
  }

  // Deterministic order: the parse output feeds a content address, so insertion order
  // from the document must not be able to change the hash.
  return out.sort((a, b) =>
    a.iata.localeCompare(b.iata) || SEVERITY[b.kind] - SEVERITY[a.kind] || a.reason.localeCompare(b.reason));
}

/** The parent of `child` inside `root` — the record the <ARPT> belongs to. */
function owner(root: XmlNode, child: XmlNode): XmlNode | null {
  const stack: XmlNode[] = [root];
  while (stack.length) {
    const n = stack.pop()!;
    for (const c of n.children) {
      if (c === child) return n;
      stack.push(c);
    }
  }
  return null;
}

/** One operational headline per airport: the worst thing currently happening to it. */
export function worstByAirport(entries: FaaEntry[]): Record<string, FaaEntry> {
  const m: Record<string, FaaEntry> = {};
  for (const e of entries) {
    const cur = m[e.iata];
    if (!cur || SEVERITY[e.kind] > SEVERITY[cur.kind]) m[e.iata] = e;
  }
  return m;
}

/**
 * How much an operational delay pushes the checkpoint.
 *
 * Not a claim that FAA delay causes queue length — it does not, directly. It is a
 * declared, visible coupling: when departures are held, the concourse fills and the
 * checkpoint feels it later. Keeping the coefficient here, in the open, is the whole
 * argument against a confidence score with no derivation.
 */
export function delayPressure(e: FaaEntry | undefined): number {
  if (!e) return 1;
  if (e.kind === "closure") return 1.6;
  if (e.kind === "ground_stop") return 1.45;
  const mins = e.avgMin ?? e.maxMin ?? e.minMin ?? 0;
  return 1 + Math.min(0.4, mins / 300);
}

/* ── fixture ─────────────────────────────────────────────────────────────────
   SYNTHETIC. Not a recorded capture of a real response — it is a hand-written
   document in the FAA's shape so the app runs and the parser is testable with no
   network. The route handler labels anything served from here `source: "fixture"`
   and the UI says so, because a demo that passes an invention off as telemetry is
   claiming the one thing it has not earned.                                     */

export const FAA_FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<AIRPORT_STATUS_INFORMATION>
  <Update_Time>Mon Aug 17 12:40:00 2026 GMT</Update_Time>
  <Delay_type>
    <Name>Ground Delay Programs</Name>
    <Ground_Delay_List>
      <Ground_Delay><ARPT>EWR</ARPT><Reason>WEATHER / LOW CEILINGS</Reason><Avg>52 minutes</Avg><Max>1 hour and 20 minutes</Max></Ground_Delay>
      <Ground_Delay><ARPT>SFO</ARPT><Reason>WEATHER / LOW CEILINGS</Reason><Avg>38 minutes</Avg><Max>1 hour</Max></Ground_Delay>
    </Ground_Delay_List>
  </Delay_type>
  <Delay_type>
    <Name>Ground Stop Programs</Name>
    <Ground_Stop_List>
      <Program><ARPT>ORD</ARPT><Reason>THUNDERSTORMS</Reason><End_Time>17:15</End_Time></Program>
    </Ground_Stop_List>
  </Delay_type>
  <Delay_type>
    <Name>General Arrival/Departure Delay Info</Name>
    <Arrival_Departure_Delay_List>
      <Delay><ARPT>ATL</ARPT><Reason>VOL:COMPACTED DEMAND</Reason>
        <Arrival_Departure Type="Departure"><Min>16 minutes</Min><Max>30 minutes</Max><Trend>Increasing</Trend></Arrival_Departure></Delay>
      <Delay><ARPT>LAS</ARPT><Reason>VOL:MULTI-TAXI</Reason>
        <Arrival_Departure Type="Departure"><Min>15 minutes</Min><Max>29 minutes</Max><Trend>Steady</Trend></Arrival_Departure></Delay>
      <Delay><ARPT>JFK</ARPT><Reason>WIND</Reason>
        <Arrival_Departure Type="Arrival"><Min>31 minutes</Min><Max>45 minutes</Max><Trend>Decreasing</Trend></Arrival_Departure></Delay>
    </Arrival_Departure_Delay_List>
  </Delay_type>
  <Delay_type>
    <Name>Airport Closures</Name>
    <Airport_Closure_List>
      <Airport><ARPT>OAK</ARPT><Reason>RUNWAY MAINTENANCE</Reason><Start>12:00 UTC</Start><Reopen>14:30 UTC</Reopen></Airport>
    </Airport_Closure_List>
  </Delay_type>
</AIRPORT_STATUS_INFORMATION>`;
