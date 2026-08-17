"use client";

/**
 * 🐚 Vongola — the strip along the foot of the console.
 *
 * Same place the lineage log lived before, doing more work: the track on the left is the
 * axis itself, and the rows on the right are what happened at each step. Ancestors from
 * a parent world stay on the track in a muted tone rather than being cropped at the
 * fork, because that inheritance is the entire point of the axis — a fork does not start
 * empty, it starts owning everything above the fork point.
 *
 * Clicking a node of this world pins the view there. Pinned is read-only: worlds are
 * append-only (I2), so the past is legible and not writable.
 */
import { fmtParams, short } from "../../lib/tri/hash";
import type { Snapshot } from "../../lib/tri/runtime";
import { Axis } from "../ui";

const WHY =
  "Vongola — the vertical axis. Inheritance through time, including inheritance across a fork from a parent world.";

export interface VongolaStripProps {
  /** Newest-first, as lineage() returns it. */
  chain: Snapshot[];
  world: string;
  head: Snapshot;
  view: Snapshot;
  parent: string | null;
  onPin: (t: number | null) => void;
}

export default function VongolaStrip({ chain, world, head, view, parent, onPin }: VongolaStripProps) {
  const track = [...chain].reverse();
  const inherited = track.filter((s) => s.world !== world).length;

  return (
    <div className="border-t border-line">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2">
        <div className="flex items-center gap-2" title={WHY}>
          <Axis of="vongola" size={14} />
          <span className="font-mono text-[10px] tracking-[0.16em] text-fg">VONGOLA</span>
          <span className="font-mono text-[10px] text-fg-4">how far along</span>
        </div>

        {/* the track */}
        <div className="flex items-center overflow-x-auto">
          {track.map((s, i) => {
            const inh = s.world !== world;
            const on = s.id === view.id;
            return (
              <div key={s.id} className="flex shrink-0 items-center">
                {i > 0 && <span className={`block h-px w-3.5 ${inh ? "bg-line" : "bg-vongola/40"}`} />}
                <button
                  disabled={inh}
                  onClick={() => onPin(s.seq === head.seq ? null : s.seq)}
                  title={inh ? `inherited from ${s.world} @ seq ${s.seq}` : `${s.cause.kind === "action" ? s.cause.action : s.cause.kind} · seq ${s.seq}`}
                  className={`grid h-[19px] w-[19px] place-items-center rounded-full border font-mono text-[9px] transition-colors ${
                    on ? "border-vongola bg-vongola text-white"
                      : inh ? "cursor-default border-line bg-panel-2 text-fg-4"
                      : "border-line text-fg-3 hover:border-vongola hover:text-vongola"
                  }`}
                >
                  {s.seq}
                </button>
                {s.cause.kind === "fork" && <span className="ml-0.5 font-mono text-[9px] text-mare">⑂</span>}
              </div>
            );
          })}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-x-4 font-mono text-[10.5px] text-fg-4">
          <span>seq <span className="nums text-fg-2">{view.seq}</span> of {head.seq}</span>
          {parent && <span>forked from <span className="text-fg-3">{parent}</span></span>}
          <span>{inherited} inherited</span>
          {view.id !== head.id && (
            <>
              <span className="text-warn">pinned · read-only</span>
              <button onClick={() => onPin(null)} className="text-accent underline underline-offset-2">go to head</button>
            </>
          )}
        </div>
      </div>

      <div className="max-h-[112px] overflow-y-auto">
        {chain.map((s) => (
          <button
            key={s.id}
            onClick={() => s.world === world && onPin(s.seq === head.seq ? null : s.seq)}
            className={`grid w-full grid-cols-[68px_1fr_auto] items-baseline gap-4 border-b border-line-soft px-4 py-1.5 text-left transition-colors last:border-b-0 ${
              s.id === view.id ? "bg-accent-tint" : "hover:bg-panel-2"
            }`}
          >
            <span className="nums font-mono text-[10.5px] text-fg-3">
              {s.world === world ? `seq ${s.seq}` : `↖ ${s.world} ${s.seq}`}
            </span>
            <span className="truncate font-mono text-[11px] text-fg-2">
              {s.cause.kind === "action" ? (
                <>
                  {s.cause.action}
                  <span className="text-fg-4"> {fmtParams(s.cause.params)}</span>
                  {s.cause.suppressed && <span className="ml-2 text-warn">suppressed</span>}
                </>
              ) : (
                <span className="text-fg-4">{s.cause.kind}</span>
              )}
            </span>
            <span className="font-mono text-[10px] text-fg-4">{short(s.root, 10)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
