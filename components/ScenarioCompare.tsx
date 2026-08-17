/**
 * Mare, rendered.
 *
 * Three decisions carry the concept into the UI:
 *  1. Columns, not cards. Scenarios are mutually exclusive, so they are laid out for
 *     comparison down shared rows — a card grid reads as "options on a list".
 *  2. Provenance under every number. Source and age, inline. This is what produces the
 *     density; it is information, not ornament.
 *  3. Borrowed values are never silent. A queue figure grafted from another airport is
 *     labelled with its origin and marks the whole column as second-hand evidence.
 */
import type { Metric, Provenance, Scenario, SourceKind, Verdict } from "../lib/scenarios";
import { Label } from "./ui";

const SOURCE_LABEL: Record<SourceKind, string> = {
  official: "official",
  community: "community",
  model: "modelled",
  grafted: "other airport",
};

const SOURCE_DOT: Record<SourceKind, string> = {
  official: "bg-ok",
  community: "bg-info",
  model: "bg-fg-4",
  grafted: "bg-warn",
};

const VERDICT: Record<Verdict, { label: string; text: string; bar: string }> = {
  comfortable: { label: "COMFORTABLE", text: "text-ok", bar: "bg-ok" },
  tight: { label: "TIGHT", text: "text-warn", bar: "bg-warn" },
  miss: { label: "MISSED", text: "text-bad", bar: "bg-bad" },
};

function Prov({ prov }: { prov: Provenance }) {
  return (
    <span className="mt-1.5 flex items-center gap-1.5 text-[10px] leading-none text-fg-3">
      <span className={`inline-block h-[4px] w-[4px] shrink-0 ${SOURCE_DOT[prov.source]}`} />
      <span className="truncate">
        {prov.originAirport && (
          <>
            <span className="text-warn">via {prov.originAirport}</span>
            <span className="text-fg-4"> · </span>
          </>
        )}
        {SOURCE_LABEL[prov.source]}
        {prov.ageMinutes > 0 && <span className="text-fg-4"> · {prov.ageMinutes}m</span>}
      </span>
    </span>
  );
}

function Cell({ metric }: { metric: Metric }) {
  return (
    <div className="flex flex-col px-4 py-3">
      <span className="nums font-mono text-[15px] text-fg">
        {metric.value}
        <span className="ml-1 text-[10.5px] text-fg-3">{metric.unit}</span>
      </span>
      <Prov prov={metric.prov} />
    </div>
  );
}

export interface ScenarioCompareProps {
  airport: string;
  terminal: string;
  boardingAt: string;
  scenarios: Scenario[];
  recommendedId: string | null;
}

export default function ScenarioCompare({
  airport, terminal, boardingAt, scenarios, recommendedId,
}: ScenarioCompareProps) {
  const rows = scenarios[0]?.metrics.map((m) => ({ key: m.key, label: m.label })) ?? [];
  const grid = { gridTemplateColumns: `168px repeat(${scenarios.length}, minmax(0,1fr))` };
  const pick = (id: string) => (id === recommendedId ? "bg-accent/[0.055]" : "");

  return (
    <section className="border border-line bg-panel">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-line px-4 py-3.5">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[13px] tracking-[0.16em] text-fg">
            {airport} · {terminal.toUpperCase()}
          </span>
          <Label className="text-fg-4">departure scenarios</Label>
        </div>
        <span className="font-mono text-[11px] text-fg-3">
          boarding <span className="nums text-fg-2">{boardingAt}</span>
        </span>
      </header>

      <p className="border-b border-line-soft px-4 py-2.5 text-[11.5px] text-fg-3">
        Parallel worlds, not options on a list — <span className="text-fg-2">only one will happen.</span>{" "}
        Every figure carries its source.
      </p>

      {/* column heads */}
      <div className="grid border-b border-line" style={grid}>
        <div className="px-4 py-3.5"><Label className="text-fg-4">if you leave</Label></div>
        {scenarios.map((s) => (
          <div key={s.id} className={`relative border-l border-line px-4 py-3.5 ${pick(s.id)}`}>
            {s.id === recommendedId && <span className="absolute inset-x-0 top-0 h-px bg-accent" />}
            <div className="flex items-baseline gap-2">
              <span className="nums font-mono text-[18px] text-fg">{s.leaveAt}</span>
              {s.id === recommendedId && (
                <span className="bg-accent px-1.5 py-px font-mono text-[9px] font-semibold tracking-[0.1em] text-bg">
                  PICK
                </span>
              )}
            </div>
            <div className="mt-1 truncate text-[11px] text-fg-3">{s.hypothesis}</div>
          </div>
        ))}
      </div>

      {/* shared metric rows */}
      {rows.map(({ key, label }) => (
        <div key={key} className="grid border-b border-line-soft" style={grid}>
          <div className="px-4 py-3 text-[12px] text-fg-3">{label}</div>
          {scenarios.map((s) => (
            <div key={s.id} className={`border-l border-line ${pick(s.id)}`}>
              <Cell metric={s.metrics.find((m) => m.key === key)!} />
            </div>
          ))}
        </div>
      ))}

      {/* the headline number */}
      <div className="grid border-b border-line" style={grid}>
        <div className="px-4 py-3.5 text-[12px] text-fg-2">Buffer at gate</div>
        {scenarios.map((s) => {
          const v = VERDICT[s.verdict];
          return (
            <div key={s.id} className={`border-l border-line px-4 py-3.5 ${pick(s.id)}`}>
              <div className="flex items-baseline gap-1.5">
                <span className={`nums font-mono text-[26px] leading-none ${v.text}`}>
                  {s.bufferMin > 0 ? `+${s.bufferMin}` : s.bufferMin}
                </span>
                <span className="text-[10.5px] text-fg-3">min</span>
              </div>
              <div className={`mt-2 font-mono text-[9.5px] tracking-[0.16em] ${v.text}`}>{v.label}</div>
              <div className="mt-2 h-px w-full bg-line">
                <div className={`h-px ${v.bar}`}
                  style={{ width: `${Math.max(4, Math.min(100, ((s.bufferMin + 30) / 90) * 100))}%` }} />
              </div>
              <div className="nums mt-2.5 font-mono text-[10px] text-fg-3">at gate {s.arriveAt}</div>
            </div>
          );
        })}
      </div>

      {/* confidence + contamination */}
      <div className="grid" style={grid}>
        <div className="px-4 py-3.5 text-[12px] text-fg-3">Confidence</div>
        {scenarios.map((s) => (
          <div key={s.id} className={`border-l border-line px-4 py-3.5 ${pick(s.id)}`}>
            <div className="flex items-center gap-2.5">
              <div className="h-[3px] w-16 bg-line">
                <div className="h-[3px] bg-fg-3" style={{ width: `${Math.round(s.confidence * 100)}%` }} />
              </div>
              <span className="nums font-mono text-[11px] text-fg-2">{Math.round(s.confidence * 100)}%</span>
            </div>
            {s.contaminated && (
              <div className="mt-2.5 inline-block border border-warn/35 bg-warn/[0.07] px-1.5 py-0.5 font-mono text-[9.5px] text-warn">
                second-hand · {s.graftedFrom.join(", ")}
              </div>
            )}
          </div>
        ))}
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3">
        {(Object.keys(SOURCE_LABEL) as SourceKind[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5 text-[10px] text-fg-3">
            <span className={`inline-block h-[4px] w-[4px] ${SOURCE_DOT[k]}`} />
            {SOURCE_LABEL[k]}
          </span>
        ))}
        <span className="ml-auto text-[10px] text-fg-4">
          a pattern borrowed from another airport is shown as evidence, never merged in silently
        </span>
      </footer>
    </section>
  );
}
