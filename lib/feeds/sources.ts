/**
 * The live source inventory, transcribed from the project's own survey (verified
 * 2026-03-17). This is the coverage map, and it is the reason the substrate exists.
 *
 * The tier vocabulary is the product's, not something invented for this demo:
 *
 *   official           direct airport wait source
 *   official_estimate  current airport-published estimate, with no stronger direct
 *                      live checkpoint feed behind it
 *   community          traveller-submitted queue signal
 *   none               no direct queue feed yet — FAA operational status only
 *
 * The important structural fact is that TWO feeds cover this network at different
 * widths. FAA NAS Status covers all 46 airports: free, no key, and genuinely live.
 * A direct queue feed covers 30. Sixteen airports are on the board with operational
 * status and no queue signal at all — that is 35% of the network, permanently, not a
 * launch-week problem. `GraftCurve` is the answer to those sixteen, and SJC, SEA, SFO
 * and ORD being real names on that list is why it is not a toy.
 *
 * Wait figures in this build are MODELLED. What is real here is the inventory: the
 * tier, the granularity the upstream actually publishes at, and the source URL. Each
 * airport's parser is separate per-airport work; wiring one replaces its seed row and
 * changes nothing else, which is the property worth checking.
 */

export type SourceTier = "official" | "official_estimate" | "community" | "none";

/** What the upstream actually publishes at. Taken from the survey's own notes. */
export type Granularity = "checkpoint" | "concourse" | "terminal" | "airport";

export interface SourceRow {
  iata: string;
  /** IANA zone. Stored as a name, not an offset, so DST is a function of the instant. */
  tz: string;
  city: string;
  tier: SourceTier;
  granularity: Granularity;
  /** The upstream this airport would be read from. Null for FAA-only airports. */
  url: string | null;
  /** Whether the upstream also publishes a forward shape (hourly / same-day forecast). */
  forecast: boolean;
  note?: string;
}

export const TIERS: Record<SourceTier, { label: string; blurb: string }> = {
  official: { label: "official", blurb: "direct airport wait source" },
  official_estimate: { label: "official estimate", blurb: "airport-published estimate, no stronger direct live feed" },
  community: { label: "community", blurb: "traveller-submitted queue signal" },
  none: { label: "FAA only", blurb: "no direct queue feed yet — operational status only" },
};

export const SOURCES: SourceRow[] = [
  // ── official: a direct airport wait source is wired ────────────────────────
  { iata: "ATL", tz: "America/New_York", city: "Atlanta", tier: "official", granularity: "checkpoint", forecast: false, url: "https://dev.atl.com/atlsync/security-wait-times/" },
  { iata: "BNA", tz: "America/Chicago", city: "Nashville", tier: "official", granularity: "airport", forecast: false, url: "https://flynashville.com/" },
  { iata: "BWI", tz: "America/New_York", city: "Baltimore", tier: "official", granularity: "checkpoint", forecast: false, url: "https://bwiairport.com/" },
  { iata: "CLE", tz: "America/New_York", city: "Cleveland", tier: "official", granularity: "checkpoint", forecast: false, url: "https://www.clevelandairport.com/tsa-wait-times-api", note: "open feed, qualitative lane levels" },
  { iata: "CLT", tz: "America/New_York", city: "Charlotte", tier: "official", granularity: "checkpoint", forecast: false, url: "https://www.cltairport.com/airport-info/security/" },
  { iata: "CVG", tz: "America/New_York", city: "Cincinnati", tier: "official", granularity: "checkpoint", forecast: false, url: "https://api.cvgairport.mobi/checkpoints/CVG" },
  { iata: "DCA", tz: "America/New_York", city: "Washington Reagan", tier: "official", granularity: "checkpoint", forecast: false, url: "https://www.flyreagan.com/security-wait-times" },
  { iata: "DEN", tz: "America/Denver", city: "Denver", tier: "official", granularity: "checkpoint", forecast: false, url: "https://www.flydenver.com/security/" },
  { iata: "DFW", tz: "America/Chicago", city: "Dallas–Fort Worth", tier: "official", granularity: "checkpoint", forecast: false, url: "https://www.dfwairport.com/security/" },
  { iata: "DTW", tz: "America/New_York", city: "Detroit", tier: "official", granularity: "checkpoint", forecast: false, url: "https://proxy.metroairport.com/SkyFiiTSAProxy.ashx" },
  { iata: "EWR", tz: "America/New_York", city: "Newark", tier: "official", granularity: "checkpoint", forecast: false, url: "https://avi-prod-mpp-webapp-api.azurewebsites.net/api/v1/SecurityWaitTimesPoints/EWR" },
  { iata: "HOU", tz: "America/Chicago", city: "Houston Hobby", tier: "official", granularity: "checkpoint", forecast: false, url: "https://api.houstonairports.mobi/wait-times/checkpoint/hou" },
  { iata: "IAD", tz: "America/New_York", city: "Washington Dulles", tier: "official", granularity: "checkpoint", forecast: false, url: "https://www.flydulles.com/security-wait-times" },
  { iata: "IAH", tz: "America/Chicago", city: "Houston Intercontinental", tier: "official", granularity: "checkpoint", forecast: false, url: "https://api.houstonairports.mobi/wait-times/checkpoint/iah" },
  { iata: "JFK", tz: "America/New_York", city: "New York Kennedy", tier: "official", granularity: "terminal", forecast: false, url: "https://api.jfkairport.com/graphql" },
  { iata: "LAX", tz: "America/Los_Angeles", city: "Los Angeles", tier: "official", granularity: "terminal", forecast: false, url: "https://www.flylax.com/wait-times" },
  { iata: "MCO", tz: "America/New_York", city: "Orlando", tier: "official", granularity: "checkpoint", forecast: false, url: "https://api.goaa.aero/wait-times/checkpoint/MCO" },
  { iata: "MIA", tz: "America/New_York", city: "Miami", tier: "official", granularity: "checkpoint", forecast: false, url: "https://www.miami-airport.com/tsa-waittimes.asp" },
  { iata: "MSP", tz: "America/Chicago", city: "Minneapolis–St. Paul", tier: "official", granularity: "checkpoint", forecast: false, url: "https://www.mspairport.com/airport/security-screening/security-wait-times" },
  { iata: "PDX", tz: "America/Los_Angeles", city: "Portland", tier: "official", granularity: "checkpoint", forecast: false, url: "https://www.pdx.com/TSAWaitTimesRefresh" },
  { iata: "PHL", tz: "America/New_York", city: "Philadelphia", tier: "official", granularity: "checkpoint", forecast: false, url: "https://www.phl.org/flights/security-information/checkpoint-hours" },
  { iata: "PHX", tz: "America/Phoenix", city: "Phoenix", tier: "official", granularity: "checkpoint", forecast: false, url: "https://api.phx.aero/avn-wait-times/raw" },
  { iata: "PIT", tz: "America/New_York", city: "Pittsburgh", tier: "official", granularity: "checkpoint", forecast: false, url: "https://flypittsburgh.com/pittsburgh-international-airport/security/" },
  { iata: "SLC", tz: "America/Denver", city: "Salt Lake City", tier: "official", granularity: "checkpoint", forecast: false, url: "https://slcairport.com/ajaxtsa/waittimes" },

  // ── official_estimate: published estimate, no stronger direct feed ─────────
  { iata: "CHS", tz: "America/New_York", city: "Charleston", tier: "official_estimate", granularity: "checkpoint", forecast: true, url: "https://iflychs.com/passengers/security-checkpoint/", note: "current estimate plus an hourly forecast" },
  { iata: "CMH", tz: "America/New_York", city: "Columbus", tier: "official_estimate", granularity: "airport", forecast: true, url: "https://flycolumbus.com/passengers/security/", note: "airport-wide estimate plus a same-day forecast" },
  { iata: "JAX", tz: "America/New_York", city: "Jacksonville", tier: "official_estimate", granularity: "checkpoint", forecast: false, url: "https://flyjacksonville.com/jaa/content.aspx?id=3583", note: "lane-level estimate" },
  { iata: "OMA", tz: "America/Chicago", city: "Omaha", tier: "official_estimate", granularity: "concourse", forecast: false, url: "https://www.flyoma.com/passenger-services/security-checkpoint-wait-times/", note: "concourse-level range" },
  { iata: "SAT", tz: "America/Chicago", city: "San Antonio", tier: "official_estimate", granularity: "terminal", forecast: false, url: "https://flysanantonio.com/home/flights/security-checkpoints-wait-time/", note: "terminal-level average" },
  { iata: "STL", tz: "America/Chicago", city: "St. Louis", tier: "official_estimate", granularity: "checkpoint", forecast: false, url: "https://www.flystl.com/tsa-security/", note: "on-page estimate and checkpoint status cards" },

  // ── none: on the board through FAA status, no queue feed wired ─────────────
  { iata: "ABQ", tz: "America/Denver", city: "Albuquerque", tier: "none", granularity: "airport", forecast: false, url: null },
  { iata: "AUS", tz: "America/Chicago", city: "Austin", tier: "none", granularity: "airport", forecast: false, url: null, note: "official guidance points at a TSA/iinside page; no stable machine-readable source confirmed" },
  { iata: "BOS", tz: "America/New_York", city: "Boston", tier: "none", granularity: "airport", forecast: false, url: null },
  { iata: "FLL", tz: "America/New_York", city: "Fort Lauderdale", tier: "none", granularity: "airport", forecast: false, url: null },
  { iata: "IND", tz: "America/New_York", city: "Indianapolis", tier: "none", granularity: "airport", forecast: false, url: null },
  { iata: "LAS", tz: "America/Los_Angeles", city: "Las Vegas", tier: "none", granularity: "airport", forecast: false, url: null },
  { iata: "MCI", tz: "America/Chicago", city: "Kansas City", tier: "none", granularity: "airport", forecast: false, url: null },
  { iata: "MDW", tz: "America/Chicago", city: "Chicago Midway", tier: "none", granularity: "airport", forecast: false, url: null },
  { iata: "OAK", tz: "America/Los_Angeles", city: "Oakland", tier: "none", granularity: "airport", forecast: false, url: null },
  { iata: "ORD", tz: "America/Chicago", city: "Chicago O'Hare", tier: "none", granularity: "airport", forecast: false, url: null },
  { iata: "RDU", tz: "America/New_York", city: "Raleigh–Durham", tier: "none", granularity: "airport", forecast: false, url: null },
  { iata: "SAN", tz: "America/Los_Angeles", city: "San Diego", tier: "none", granularity: "airport", forecast: false, url: null },
  { iata: "SEA", tz: "America/Los_Angeles", city: "Seattle–Tacoma", tier: "none", granularity: "airport", forecast: false, url: null, note: "official page says live estimated wait times are being restored" },
  { iata: "SFO", tz: "America/Los_Angeles", city: "San Francisco", tier: "none", granularity: "airport", forecast: false, url: null, note: "checkpoint hours and routing published, no live per-checkpoint feed" },
  { iata: "SJC", tz: "America/Los_Angeles", city: "San José", tier: "none", granularity: "airport", forecast: false, url: null },
  { iata: "TPA", tz: "America/New_York", city: "Tampa", tier: "none", granularity: "airport", forecast: false, url: null },
];

export const FAA_FEED_URL = "https://nasstatus.faa.gov/api/airport-status-information";

export const byIata = (iata: string) => SOURCES.find((s) => s.iata === iata);

export const COVERAGE = {
  total: SOURCES.length,
  official: SOURCES.filter((s) => s.tier === "official").length,
  officialEstimate: SOURCES.filter((s) => s.tier === "official_estimate").length,
  none: SOURCES.filter((s) => s.tier === "none").length,
};
