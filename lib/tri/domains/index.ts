/**
 * The domain registry.
 *
 * This exists because of a real constraint rather than a preference. An `Ontology`
 * carries its action `handler`s — the declaration is not a schema document, it is the
 * executable rule — and functions cannot cross the server/client boundary. So a page
 * cannot import an ontology on the server and hand it to a client console as a prop; it
 * passes a slug, and the console resolves it here, on the client, where the handlers are
 * real functions again.
 *
 * Worth noticing rather than working around: the thing that makes this awkward is the
 * same thing that makes the claim true. If the ontology were inert JSON it would pass
 * through happily and it would also not be the only write path.
 */
import type { Ontology, Provenance, WorldState } from "../runtime";
import { OIL_META, OIL_ONTOLOGY, seedOil } from "./oil";
import { PORT_META, PORT_ONTOLOGY, seedPort } from "./port";
import { WEATHER_META, WEATHER_ONTOLOGY, seedWeather } from "./weather";

export interface DomainMeta {
  slug: string;
  name: string;
  blurb: string;
  irreversible: string;
  gap: string;
  status: string;
}

export interface Domain {
  meta: DomainMeta;
  onto: Ontology;
  seed: (prov: Provenance) => WorldState;
  /** What the coordinate points at by default. */
  subject: string;
}

export const DOMAINS: Record<string, Domain> = {
  oil: { meta: OIL_META, onto: OIL_ONTOLOGY, seed: seedOil, subject: "BRENT" },
  weather: { meta: WEATHER_META, onto: WEATHER_ONTOLOGY, seed: seedWeather, subject: "KJFK" },
  port: { meta: PORT_META, onto: PORT_ONTOLOGY, seed: seedPort, subject: "LAX-P400" },
};

/** Plain data only — safe to read from a server component. */
export const DOMAIN_META: Record<string, DomainMeta> = {
  oil: OIL_META,
  weather: WEATHER_META,
  port: PORT_META,
};

export const SKETCH_SLUGS = Object.keys(DOMAINS);

/* ── the examples catalogue ──────────────────────────────────────────────────
   One list, read by the platform page and by /examples. It used to be declared
   twice and the two had already drifted — the same failure the ontology exists to
   prevent, committed in the copy that describes it.                             */

export interface ExampleCard {
  slug: string;
  name: string;
  /** One line for the grid. Longer prose belongs on the example itself. */
  blurb: string;
  /** The action this domain refuses to fire outside primary. Different in all four. */
  irreversible: string;
  /** The coverage hole the lateral edge answers. Also different in all four. */
  gap: string;
  status: "live" | "sketch";
  /** Airport carries a live upstream; the sketches do not. */
  feed?: string;
  /** Shown as chips on /examples, where there is room for them. */
  demonstrates: string[];
}

export const EXAMPLES: ExampleCard[] = [
  {
    slug: "airport",
    name: "Airport",
    blurb: "Checkpoint queues across 46 airports. Fork a world, change the staffing, and watch reality stay untouched.",
    irreversible: "PublishAlert — a push cannot be unsent",
    gap: "16 airports have no queue feed at all",
    status: "live",
    feed: "FAA NAS Status, live · 8 of 30 queue adapters pinned",
    demonstrates: ["live ingestion + cassette", "fork isolation", "irreversible suppression", "trace to the bytes"],
  },
  {
    slug: "oil",
    name: "Crude book",
    blurb: "Cargoes, benchmarks and voyage routes. Price a reroute in a fork, and find that a nomination will not go out from a world that is not real.",
    irreversible: "NominateCargo — a nomination binds a counterparty",
    gap: "assessed and unpriced grades have no intraday shape",
    status: "sketch",
    demonstrates: ["branchable hedges", "graft a price shape", "irreversible suppression"],
  },
  {
    slug: "weather",
    name: "Forecast ensemble",
    blurb: "Members that disagree, and one of them becomes the weather. The cleanest fit for Mare here — meteorology already models futures as mutually exclusive.",
    irreversible: "IssueWarning — a public warning cannot be unsent",
    gap: "sites with no station have no daily shape",
    status: "sketch",
    demonstrates: ["ensemble as parallel worlds", "graft a diurnal shape", "per-zone local time"],
  },
  {
    slug: "port",
    name: "Berth plan",
    blurb: "Vessels, berths and crane gangs. Two calls start in the same berth on purpose — resolve it in a fork, then try to confirm the window.",
    irreversible: "ConfirmWindow — pilots and gangs get booked against it",
    gap: "terminals with no arrival feed have no shape to their day",
    status: "sketch",
    demonstrates: ["conflicts held, not refused", "branchable crane allocation", "irreversible suppression"],
  },
];
