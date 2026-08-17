"use client";

/**
 * The data pipeline, and the trace of a single number.
 *
 * Foundry shows lineage between datasets: this transform read that dataset, here is when
 * it last built, here is its health. That is worth having and this panel's left half is
 * the same idea — upstream, boundary, parse, ontology, derived, with what each stage
 * produced in this world.
 *
 * The half that is not the same idea is the trace. A Foundry lineage answers "which
 * dataset did this come from". This answers "which BYTES did this number come from, in
 * this world, at this seq" — every input in the derivation, its provenance, its content
 * address, all the way back to the sha256 of the response the FAA returned. And because
 * the pipeline runs per world, the same stages produce a different number one chip to
 * the left, which a build graph has no way to express: it has exactly one output per
 * dataset.
 *
 * The trace is not a caption. `derivePosted` is the function `recompute` stores from, so
 * what is rendered here IS the computation — an explanation written as a second
 * implementation drifts and eventually lies.
 */
import type { Derivation, DeriveStep, Tone } from "../../lib/tri/airport";
import { short } from "../../lib/tri/hash";
import { objKey, type Snapshot } from "../../lib/tri/runtime";
import { Label } from "../ui";

const TONE: Record<Tone, string> = {
  official: "text-ok",
  official_estimate: "text-info",
  community: "text-vongola",
  grafted: "text-warn",
  modelled: "text-fg-3",
  none: "text-fg-4",
};

const DOT: Record<Tone, string> = {
  official: "bg-ok",
  official_estimate: "bg-info",
  community: "bg-vongola",
  grafted: "bg-warn",
  modelled: "bg-fg-4",
  none: "bg-fg-4",
};

/* ── stages ──────────────────────────────────────────────────────────────── */

export function PipelineStages({ view, world }: { view: Snapshot; world: string }) {
  const objects = Object.values(view.state.objects);
  const count = (t: string) => objects.filter((o) => o.typeId === t).length;
  const captures = objects.filter((o) => o.typeId === "Capture");
  const capture = captures[captures.length - 1];
  const clock = view.state.objects[objKey("Clock", "world")];

  const stages: {
    n: string; name: string; what: string; detail: string;
    value: string; tone: Tone; pure: boolean;
  }[] = [
    {
      n: "1", name: "upstream", what: "nasstatus.faa.gov", tone: capture ? (capture.props.live ? "official" : "modelled") : "none",
      detail: "FAA NAS Status · XML · free, no key · covers all 46 airports. The one live source in this build.",
      value: capture ? (capture.props.live ? "reached" : "unreachable → fixture") : "not called in this world",
      pure: false,
    },
    {
      n: "2", name: "boundary", what: "GET /api/feeds/faa", tone: capture ? "official" : "none",
      detail: "The only non-deterministic step in the system: a network call at a wall-clock moment. So the bytes are hashed and the instant is recorded — everything downstream is a pure function of them.",
      value: capture ? `${String(capture.props.bytes ?? "")} sha ${short(String(capture.props.bodySha256), 12)}` : "—",
      pure: false,
    },
    {
      n: "3", name: "parse", what: "parseFaaStatus()", tone: capture ? "official" : "none",
      detail: "Tolerant XML reader, then a deterministic sort. Pure — same bytes in, same entries out, in the same order, because the order feeds a content address.",
      value: capture ? `${String(capture.props.entries)} entries` : "—",
      pure: true,
    },
    {
      n: "4", name: "ingest", what: "IngestFaaStatus", tone: capture ? "official" : "none",
      detail: "The declared action, primaryOnly. Writes the Capture, one FaaStatus per delayed airport, and the world clock — the fetch instant becomes this world's time.",
      value: capture ? `Capture ${capture.key} · clock ${String(clock.props.source)}` : "not ingested",
      pure: true,
    },
    {
      n: "5", name: "ontology", what: "objects in this world", tone: "modelled",
      detail: "The declared object types. Airports, terminals and checkpoints come from the seed; FaaStatus from the capture; Reports from travellers; Curves from the seed or from a graft.",
      value: `Airport ${count("Airport")} · Checkpoint ${count("Checkpoint")} · Curve ${count("Curve")} · FaaStatus ${count("FaaStatus")} · Report ${count("Report")}`,
      pure: true,
    },
    {
      n: "6", name: "derived", what: "derivePosted()", tone: "modelled",
      detail: "baseLoad × demand × bank(local clock) × faaPressure ÷ lanes, then blended with any traveller reports inside the evidence window. Stored, not computed at render time, so the snapshot root moves when the posted number does.",
      value: `${count("Checkpoint")} posted waits · root ${short(view.root, 12)}`,
      pure: true,
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 border-b border-line bg-panel-2 px-3 py-1.5">
        <Label className="text-fg-4">pipeline</Label>
        <span className="text-[11.5px] text-fg-2">upstream → boundary → ontology → derived</span>
        <span className="ml-auto font-mono text-[10px] text-fg-4">in world <span className="text-fg-3">{world}</span> at seq {view.seq}</span>
      </div>

      <div>
        {stages.map((s, i) => (
          <div key={s.n} className="grid grid-cols-[26px_1fr] border-b border-line-soft last:border-b-0">
            {/* rail */}
            <div className="relative flex justify-center">
              <span className={`absolute top-0 bottom-0 w-px ${i === stages.length - 1 ? "h-[13px]" : ""} ${i === 0 ? "top-[13px]" : ""} bg-line`} />
              <span className={`relative z-10 mt-[7px] h-[13px] w-[13px] shrink-0 rounded-full border border-line bg-panel`}>
                <span className={`absolute inset-[3px] rounded-full ${DOT[s.tone]}`} />
              </span>
            </div>

            <div className="px-2 py-1.5">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.13em] text-fg-4">{s.n} {s.name}</span>
                <span className="font-mono text-[11.5px] text-fg">{s.what}</span>
                <span
                  className="font-mono text-[9px] uppercase tracking-wider text-fg-4"
                  title={s.pure
                    ? "Pure — a function of the previous stage's output. Replayable."
                    : "Not reproducible on its own. This is why the bytes and the instant are captured."}
                >
                  {s.pure ? "pure" : "non-deterministic"}
                </span>
                <span className={`ml-auto nums font-mono text-[10.5px] ${TONE[s.tone]}`}>{s.value}</span>
              </div>
              <p className="mt-0.5 text-[10.5px] leading-snug text-fg-4">{s.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="border-t border-line bg-panel-2 px-3 py-2 text-[11px] leading-relaxed text-fg-3">
        Stages 3–6 are pure functions of stage 2&rsquo;s bytes and instant. Keep the capture payload,
        replay it into a fresh world, and stage 6 lands on the same root — which is the claim a build
        graph cannot make, because it has one output per dataset and this has one per world.
      </p>
    </div>
  );
}

/* ── trace ───────────────────────────────────────────────────────────────── */

export function TraceView({
  derivation, view, world, onClose,
}: {
  derivation: Derivation;
  view: Snapshot;
  world: string;
  onClose: () => void;
}) {
  const d = derivation;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 border-b border-line bg-panel-2 px-3 py-1.5">
        <Label className="text-fg-4">trace</Label>
        <span className="font-mono text-[11.5px] text-fg">{d.checkpoint}</span>
        <span className="text-[11.5px] text-fg-2">
          posted <span className="nums font-mono text-[13px] text-fg">{d.postedMin}</span> min
        </span>
        <span className="ml-auto font-mono text-[10px] text-fg-4">
          {world} @ seq {view.seq} · root {short(view.root, 10)}
        </span>
        <button onClick={onClose} className="border border-line px-2 py-0.5 font-mono text-[10.5px] text-fg-3 hover:border-fg-4 hover:text-fg">
          close
        </button>
      </div>

      <div>
        {d.steps.map((s: DeriveStep) => (
          <div key={s.label} className="grid grid-cols-[100px_1fr] items-baseline gap-2 border-b border-line-soft px-3 py-1.5">
            <span className="flex items-center gap-1.5">
              <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${DOT[s.tone]}`} />
              <span className="font-mono text-[10.5px] text-fg-3">{s.label}</span>
            </span>
            <span>
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className={`nums font-mono text-[12px] ${TONE[s.tone]}`}>{s.value}</span>
                {s.address && <span className="font-mono text-[9.5px] text-fg-4">{s.address}</span>}
              </span>
              <span className="mt-0.5 block text-[10.5px] leading-snug text-fg-4">{s.from}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="border-b border-line-soft px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-fg-4">model</span>
          <span className="nums font-mono text-[11px] text-fg-2">{d.modelFormula}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-fg-4">posted</span>
          <span className="nums font-mono text-[11px] text-fg-2">{d.postedFormula}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-fg-4">confidence</span>
          <span className="nums font-mono text-[11px] text-fg-2">{d.confidencePct}%</span>
          <span className="text-[10.5px] text-fg-4">{d.confidenceWhy}</span>
        </div>
      </div>

      <p className="px-3 py-2 text-[11px] leading-relaxed text-fg-3">
        This is not a caption on the number — <code className="font-mono text-fg-2">derivePosted()</code> is
        the function <code className="font-mono text-fg-2">recompute</code> stores from, so the board and
        this panel cannot disagree. Fork, change one input, and read the same trace in the other world:
        the stages are identical and the answer is not.
      </p>
    </div>
  );
}
