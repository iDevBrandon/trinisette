/**
 * Time, as data.
 *
 * The rule the substrate actually needs is not "do not use the wall clock" — it is
 * "nothing reproducible may READ the wall clock". A timestamp that arrives as a field
 * in a captured payload is an input like any other: hash it, replay it, get the same
 * state back. A timestamp that a model reads for itself is what makes an address a lie,
 * because the same inputs stop producing the same output.
 *
 * So `new Date()` is called in exactly one place in this codebase — the route handler at
 * the ingestion boundary, where it is recorded into the response — and nowhere else.
 * Everything below is a pure function of an instant that was handed to it.
 *
 * The world clock is a single global instant in epoch minutes. Local time is a
 * projection of that instant through an airport's zone, which is the only correct model
 * for a 46-airport national network: ATL at 06:40 local and LAX at 06:40 local are three
 * hours apart, and a departure bank peaks in local time, not UTC.
 */

/** Minutes since the Unix epoch. One number, one instant, no zone. */
export type EpochMin = number;

/**
 * Genesis: 2026-08-17T09:10:00Z — 05:10 local at ATL, comfortably before the first
 * bank. A fixed constant, so a freshly opened world always has the same root and a
 * copied coordinate link still resolves to the state it was copied from.
 */
export const GENESIS_EPOCH_MIN: EpochMin = Math.floor(Date.UTC(2026, 7, 17, 9, 10) / 60000);

/**
 * The zone's offset from UTC at a given instant, in minutes. Pure: same instant and
 * same zone always give the same answer, including across DST boundaries — which is
 * why the zone is stored as an IANA name rather than as a baked-in offset. Phoenix is
 * the reason that matters: Arizona does not observe DST, so a hardcoded -7 would be
 * right in August and wrong in January.
 */
export function tzOffsetMin(tz: string, at: EpochMin): number {
  const ms = at * 60000;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ms));

  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  // `hour` comes back as 24 at midnight under hour12:false in some engines.
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asIfUtc - ms) / 60000);
}

/** Minute-of-day (0–1439) at this instant, in this zone. What a departure bank runs on. */
export function localMinuteOfDay(at: EpochMin, tz: string): number {
  const local = at + tzOffsetMin(tz, at);
  return ((local % 1440) + 1440) % 1440;
}

/** "05:10" */
export const fmtClock = (minuteOfDay: number) => {
  const m = ((Math.round(minuteOfDay) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** "2026-08-17 09:10Z" — the address side of the clock, which is always UTC. */
export function fmtUtc(at: EpochMin): string {
  return new Date(at * 60000).toISOString().replace("T", " ").slice(0, 16) + "Z";
}

/** "UTC−4" */
export function fmtOffset(offsetMin: number): string {
  const sign = offsetMin < 0 ? "−" : "+";
  const a = Math.abs(offsetMin);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** Parse an ISO instant from a capture payload. Returns null rather than NaN-poisoning a hash. */
export function epochMinFromIso(iso: string): EpochMin | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 60000) : null;
}
