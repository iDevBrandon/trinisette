/**
 * Mare — mutually exclusive departure scenarios.
 *
 * The distinction that makes this Trinisette and not a dashboard: adjacent airports are
 * NOT parallel worlds (they all exist at once — that is the object graph). Departure
 * times ARE, because only one of them will happen. Each Scenario below is a world with
 * a hypothesis, and the user's decision is which one to make real.
 *
 * Everything here is a PURE function of its inputs, so a prediction can be replayed and
 * audited later. Nothing reads the clock: `now` is passed in.
 */

export type SourceKind = "official" | "community" | "model" | "grafted";

export interface Provenance {
  source: SourceKind;
  /** Human-readable derivation, shown inline under the number. */
  detail: string;
  ageMinutes: number;
  /**
   * Set only when source === "grafted": the airport this pattern came from.
   * ALWAYS rendered. A grafted value is `observed`, never silently assimilated —
   * the user sees it is second-hand evidence from another airport.
   */
  originAirport?: string;
}

export interface Metric {
  key: string;
  label: string;
  value: number;
  unit: string;
  prov: Provenance;
}

export type Verdict = "comfortable" | "tight" | "miss";

export interface Scenario {
  id: string;
  /** The intervention this world represents — world.hypothesis. */
  hypothesis: string;
  leaveAt: string;
  arriveAt: string;
  metrics: Metric[];
  bufferMin: number;
  verdict: Verdict;
  confidence: number;
  /** True when any input was grafted from another airport (world.contaminated). */
  contaminated: boolean;
  graftedFrom: string[];
}

export interface QueueSample {
  minutesFromNow: number;
  waitMin: number;
  prov: Provenance;
}

export interface ScenarioInput {
  airport: string;
  terminal: string;
  boardingAt: string;
  /** Minutes from home to terminal door. */
  transitMin: number;
  /** Minutes from checkpoint exit to gate. */
  walkMin: number;
  /** Predicted checkpoint wait at various offsets, each with its own provenance. */
  curve: QueueSample[];
  /** Candidate departure times, in minutes from now. */
  options: { minutesFromNow: number; label: string }[];
  now: Date;
}

const fmt = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

/** Nearest sample on the predicted queue curve. */
function queueAt(curve: QueueSample[], minutesFromNow: number): QueueSample {
  return curve.reduce((best, s) =>
    Math.abs(s.minutesFromNow - minutesFromNow) < Math.abs(best.minutesFromNow - minutesFromNow) ? s : best,
  );
}

export function buildScenarios(input: ScenarioInput): Scenario[] {
  const [bh, bm] = input.boardingAt.split(":").map(Number);
  const boarding = new Date(input.now);
  boarding.setHours(bh, bm, 0, 0);

  return input.options.map((opt) => {
    const leave = addMin(input.now, opt.minutesFromNow);
    const arrive = addMin(leave, input.transitMin);
    const q = queueAt(input.curve, opt.minutesFromNow + input.transitMin);
    const atGate = addMin(arrive, q.waitMin + input.walkMin);
    const bufferMin = Math.round((boarding.getTime() - atGate.getTime()) / 60_000);

    const metrics: Metric[] = [
      { key: "transit", label: "Transit", value: input.transitMin, unit: "min",
        prov: { source: "model", detail: "typical drive, this hour", ageMinutes: 0 } },
      { key: "queue", label: "Checkpoint queue", value: q.waitMin, unit: "min", prov: q.prov },
      { key: "walk", label: "Walk to gate", value: input.walkMin, unit: "min",
        prov: { source: "official", detail: `${input.terminal} concourse map`, ageMinutes: 0 } },
    ];

    const grafted = metrics
      .filter((m) => m.prov.source === "grafted" && m.prov.originAirport)
      .map((m) => m.prov.originAirport!);

    // Confidence degrades with age, and with reliance on second-hand evidence.
    const staleness = Math.min(1, q.prov.ageMinutes / 120);
    const base = q.prov.source === "official" ? 0.9 : q.prov.source === "community" ? 0.72 : 0.55;
    const confidence = Math.max(0.2, base - staleness * 0.25 - (grafted.length ? 0.12 : 0));

    return {
      id: `leave+${opt.minutesFromNow}`,
      hypothesis: opt.label,
      leaveAt: fmt(leave),
      arriveAt: fmt(atGate),
      metrics,
      bufferMin,
      verdict: bufferMin >= 25 ? "comfortable" : bufferMin >= 5 ? "tight" : "miss",
      confidence,
      contaminated: grafted.length > 0,
      graftedFrom: [...new Set(grafted)],
    };
  });
}

/** The scenario a traveller should pick: earliest departure that is still comfortable. */
export function recommend(scenarios: Scenario[]): string | null {
  const ok = scenarios.filter((s) => s.verdict === "comfortable");
  return ok.length ? ok[ok.length - 1].id : (scenarios.find((s) => s.verdict === "tight")?.id ?? null);
}
