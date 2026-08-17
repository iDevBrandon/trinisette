"use client";

/**
 * Mare, rendered.
 *
 * The axis was invisible on this page for one reason: you could only ever see one world
 * at a time. A row of chips that swaps the screen out is not a horizontal axis, it is a
 * tab bar. Parallel means side by side.
 *
 * Read across a row to compare the same checkpoint under different assumptions; read
 * down a column to see one world end to end. Each column carries its own clock and its
 * own seq, because worlds diverge in time as well as in premise — that divergence is
 * the thing a normal dashboard cannot hold, since it has exactly one present tense.
 */
import { fmtClock, localMinuteAt } from "../../lib/tri/airport";
import { short } from "../../lib/tri/hash";
import { headOf, objKey, type Snapshot, type Store } from "../../lib/tri/runtime";
import { Axis, Label } from "../ui";

export interface MareCompareProps {
  store: Store;
  /** Checkpoint keys for the focused airport, in display order. */
  checkpoints: { key: string; label: string }[];
  airport: string;
  activeWorld: string;
  onWorld: (w: string) => void;
}

export default function MareCompare({ store, checkpoints, airport, activeWorld, onWorld }: MareCompareProps) {
  const worlds = Object.values(store.worlds);
  if (worlds.length < 2) return null;

  const heads: Record<string, Snapshot> = {};
  for (const w of worlds) heads[w.id] = headOf(store, w.id);
  const primary = heads.primary;


  const postedOf = (s: Snapshot, cp: string) => {
    const o = s.state.objects[objKey("Checkpoint", cp)];
    return o ? Number(o.props.postedMin) : null;
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 border-b border-line bg-mare/[0.04] px-3 py-1.5">
        <Axis of="mare" size={13} />
        <span className="font-mono text-[10px] tracking-[0.16em] text-fg">MARE</span>
        <span className="text-[11.5px] text-fg-2">{worlds.length} worlds, side by side</span>
        <span className="ml-auto font-mono text-[10px] text-fg-4">
          same checkpoint · different assumption · different number
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="w-[150px] border-b border-line px-3 py-2 text-left font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-fg-4">
                checkpoint
              </th>
              {worlds.map((w) => {
                const s = heads[w.id];
                const on = w.id === activeWorld;
                return (
                  <th key={w.id} className={`min-w-[118px] border-b border-l border-line px-3 py-2 text-left align-top ${on ? "bg-mare/[0.06]" : ""}`}>
                    <button onClick={() => onWorld(w.id)} className="block w-full text-left">
                      <div className={`font-mono text-[11.5px] ${on ? "text-mare" : "text-fg"}`}>
                        {w.name}{w.kind === "primary" && <span className="ml-1 opacity-60">★</span>}
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-fg-4">
                        seq {s.seq} · {fmtClock(localMinuteAt(s.state, airport))}
                      </div>
                      <div className="mt-1 max-w-[20ch] text-[10px] leading-snug text-fg-3">
                        {w.kind === "primary" ? "reality" : w.hypothesis}
                      </div>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {checkpoints.map((cp) => {
              const basePosted = postedOf(primary, cp.key);
              return (
                <tr key={cp.key} className="border-b border-line-soft last:border-b-0">
                  <td className="px-3 py-2">
                    <div className="text-[12px] text-fg">{cp.label}</div>
                    <div className="font-mono text-[9.5px] text-fg-4">{cp.key}</div>
                  </td>
                  {worlds.map((w) => {
                    const v = postedOf(heads[w.id], cp.key);
                    const diff = v !== null && basePosted !== null && w.kind !== "primary" ? v - basePosted : 0;
                    const on = w.id === activeWorld;
                    return (
                      <td key={w.id} className={`border-l border-line px-3 py-2 ${on ? "bg-mare/[0.04]" : ""}`}>
                        {v === null ? (
                          <span className="font-mono text-[12px] text-fg-4">—</span>
                        ) : (
                          <span className="flex items-baseline gap-2">
                            <span className="nums font-mono text-[16px] text-fg">{v}</span>
                            <span className="text-[10px] text-fg-4">min</span>
                            {diff !== 0 && (
                              <span className={`nums font-mono text-[11px] ${diff < 0 ? "text-ok" : "text-bad"}`}>
                                {diff > 0 ? "+" : ""}{diff}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="border-t border-line px-3 py-1.5">
                <Label className="text-fg-4">address</Label>
              </td>
              {worlds.map((w) => (
                <td key={w.id} className="border-t border-l border-line px-3 py-1.5 font-mono text-[10px] text-arcobaleno">
                  {short(heads[w.id].root, 12)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="border-t border-line-soft px-3 py-1.5 text-[10.5px] text-fg-4"
        title="Every column is a real, materialised state with its own address — not a projection or a scenario row in a spreadsheet. Any of them can be forked again, acted in, or linked to.">
        Each column is a materialised state with its own address. ★ is the only one where an
        irreversible action fires.
      </p>
    </div>
  );
}
