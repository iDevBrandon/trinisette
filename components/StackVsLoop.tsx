import { Axis, Label } from "./ui";

const PALANTIR = ["Data", "Ontology", "Actions", "Scenarios", "AI Agents"];
const LOOP = ["World", "Agent", "Action", "Outcome"];

/**
 * The shape difference, drawn rather than described. Palantir's model terminates at the
 * top of a stack; Trinisette's closes back on itself — and that closing edge, Experience
 * returning to a *different* world, is the whole product.
 */
export default function StackVsLoop() {
  return (
    <div className="grid gap-px border border-line bg-line md:grid-cols-2">
      {/* ── a stack ─────────────────────────────────────────────── */}
      <div className="bg-panel p-6 md:p-8">
        <div className="mb-6 flex items-baseline justify-between">
          <Label>Palantir</Label>
          <Label className="text-fg-4">a stack</Label>
        </div>
        <ol className="space-y-0">
          {PALANTIR.map((s, i) => (
            <li key={s}>
              <div className="flex items-center gap-3 border border-line-soft bg-panel-2 px-3 py-2">
                <span className="nums font-mono text-[10px] text-fg-4">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-b1 text-fg-2">{s}</span>
              </div>
              {i < PALANTIR.length - 1 && <div className="ml-[22px] h-3 w-px bg-line" />}
            </li>
          ))}
        </ol>
        <p className="mt-6 border-t border-line-soft pt-4 text-b1 text-fg-3">
          Terminates at the top. Scenarios sit <em className="not-italic text-fg-2">inside</em> the
          ontology as a feature — documented limits of 30,000 edits and 50 Actions per scenario,
          sized for a person clicking through an application.
        </p>
      </div>

      {/* ── a loop ──────────────────────────────────────────────── */}
      <div className="bg-panel p-6 md:p-8">
        <div className="mb-6 flex items-baseline justify-between">
          <Label>Trinisette</Label>
          <Label className="text-fg-4">a loop</Label>
        </div>

        <div className="mb-3 inline-flex items-center gap-3 border border-line-soft bg-panel-2 px-3 py-2">
          <span className="nums font-mono text-[10px] text-fg-4">00</span>
          <span className="text-[14px] text-fg-2">Ontology</span>
        </div>

        <div className="relative border-l border-line pl-5">
          <div className="grid grid-cols-2 gap-px bg-line">
            {LOOP.map((s, i) => (
              <div key={s} className="flex items-center gap-3 bg-panel-2 px-3 py-2">
                <span className="nums font-mono text-[10px] text-fg-4">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-b1 text-fg-2">{s}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3 border border-mare/40 bg-mare/[0.06] px-3 py-2">
            <Axis of="mare" size={15} />
            <span className="text-b1 text-fg">Experience</span>
            <span className="ml-auto font-mono text-[10.5px] text-mare/90">↰ back to another World</span>
          </div>
        </div>

        <p className="mt-6 border-t border-line-soft pt-4 text-b1 text-fg-3">
          Closes on itself. The feedback edge — experience returning to a{" "}
          <em className="not-italic text-fg-2">different</em> world — is the product, and it is the
          part a layer stack has nowhere to put.
        </p>
      </div>
    </div>
  );
}
