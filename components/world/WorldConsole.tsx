"use client";

/**
 * World console — run a world, fork it, and see what would have happened.
 *
 * Deliberately NOT called an ontology browser. Objects, links and actions are the
 * vocabulary you act through; they are not what this screen is for. Foundry sells the
 * ontology and attaches what-if to it. Here the branching is the product and the
 * ontology is the layer underneath, so the screen leads with the coordinate — one world
 * at one seq, address on the bar — and the object graph is how you get work done inside it.
 *
 * Nothing here special-cases behaviour in the component. The parameter forms are built
 * from each action's declared `params`; validation messages come back from the runtime;
 * and PublishAlert is refused outside the primary world by `invoke()`, not by a disabled
 * prop. Fork an experiment, try to publish, and read the reason the runtime gives.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { AIRPORT_ONTOLOGY, seedAirport } from "../../lib/tri/airport";
import { short } from "../../lib/tri/hash";
import {
  createStore, fork, headOf, invoke, lineage, objKey,
  type Store, type OntoObject,
} from "../../lib/tri/runtime";
import { Label } from "../ui";

const onto = AIRPORT_ONTOLOGY;

const STATUS = {
  applied: { cls: "text-ok", border: "border-ok/40 bg-ok/[0.06]" },
  suppressed: { cls: "text-warn", border: "border-warn/40 bg-warn/[0.07]" },
  rejected: { cls: "text-bad", border: "border-bad/40 bg-bad/[0.06]" },
} as const;

export interface WorldConsoleProps {
  /** Coordinate from the URL. `?w=` selects the world, `?t=` pins a seq. */
  initialWorld?: string;
  initialSeq?: number | null;
  /** When true, world/seq changes are written back to the address bar. */
  syncUrl?: boolean;
}

export default function WorldConsole({ initialWorld = "primary", initialSeq = null, syncUrl = false }: WorldConsoleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [store, setStore] = useState<Store>(() => createStore(seedAirport));
  const [world, setWorldState] = useState(initialWorld);
  /** null = follow head. A number pins the view to that seq (read-only). */
  const [pinned, setPinned] = useState<number | null>(initialSeq);
  const [selected, setSelected] = useState(objKey("Checkpoint", "A"));
  const [actionId, setActionId] = useState(onto.actions[0].id);
  const [params, setParams] = useState<Record<string, string>>({ checkpoint: "A", lanes: "4" });
  const [flash, setFlash] = useState<{ status: keyof typeof STATUS; reason?: string; action: string } | null>(null);

  const writeUrl = useCallback((w: string, t: number | null) => {
    if (!syncUrl) return;
    const q = new URLSearchParams(search.toString());
    if (w === "primary") q.delete("w"); else q.set("w", w);
    if (t === null) q.delete("t"); else q.set("t", String(t));
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }, [syncUrl, search, router, pathname]);

  const setWorld = useCallback((w: string) => {
    setWorldState(w); setPinned(null); writeUrl(w, null);
  }, [writeUrl]);

  const pin = useCallback((t: number | null) => {
    setPinned(t); writeUrl(world, t);
  }, [writeUrl, world]);

  const known = store.worlds[world] !== undefined;
  /** Every store lookup goes through a world that is known to exist. */
  const activeId = known ? world : "primary";
  const head = headOf(store, activeId);
  const primaryHead = headOf(store, "primary");
  const w = store.worlds[activeId];
  const action = onto.actions.find((a) => a.id === actionId)!;
  const chain = useMemo(() => lineage(store, head.id), [store, head.id]);
  /** What is on screen: head, or the pinned ancestor. */
  const view = useMemo(
    () => (pinned === null ? head : chain.find((s) => s.world === head.world && s.seq === pinned) ?? head),
    [pinned, head, chain],
  );
  const atHead = view.id === head.id;
  const obj: OntoObject | undefined = view.state.objects[selected];

  const byType = useMemo(() => {
    const m: Record<string, OntoObject[]> = {};
    for (const o of Object.values(view.state.objects)) (m[o.typeId] ??= []).push(o);
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.key.localeCompare(b.key));
    return m;
  }, [view]);

  function pickAction(id: string) {
    setActionId(id);
    const def = onto.actions.find((a) => a.id === id)!;
    const next: Record<string, string> = {};
    for (const [name, spec] of Object.entries(def.params)) {
      next[name] = spec.options ? spec.options[0] : spec.type === "number" ? "1" : "";
    }
    setParams(next);
    setFlash(null);
  }

  function run() {
    const r = invoke(store, onto, activeId, actionId, params);
    setStore(r.store);
    setFlash({ status: r.status, reason: r.reason, action: action.label });
  }

  function doFork() {
    const n = Object.keys(store.worlds).length;
    const name = `exp-${n}`;
    setStore(fork(store, activeId, name, `forked from ${activeId} @ seq ${head.seq}`));
    setWorld(name);
    setFlash(null);
  }

  const cell = "border-line";

  return (
    <section className="border border-line bg-panel">
      {/* ── coordinate bar ───────────────────────────────────────────── */}
      <div className={`flex flex-wrap items-center gap-x-6 gap-y-3 border-b ${cell} px-4 py-3`}>
        <div className="flex items-center gap-2">
          <Label className="text-fg-4">world</Label>
          {Object.values(store.worlds).map((x) => (
            <button
              key={x.id}
              onClick={() => { setWorld(x.id); setFlash(null); }}
              className={`border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                x.id === activeId
                  ? "border-fg bg-fg text-bg"
                  : "border-line text-fg-2 hover:border-fg-4 hover:text-fg"
              }`}
            >
              {x.name}
              {x.kind === "primary" && <span className="ml-1.5 opacity-60">★</span>}
            </button>
          ))}
          <button
            onClick={doFork}
            className="border border-line px-2.5 py-1 font-mono text-[11px] text-fg-2 transition-colors hover:border-fg-4 hover:text-fg"
          >
            + fork
          </button>
        </div>

        <div className="ml-auto flex items-center gap-5 font-mono text-[11px]">
          <span className="text-fg-3">
            seq <span className="nums text-fg">{view.seq}</span>
            <span className="text-fg-4"> / {head.seq}</span>
          </span>
          <span className="text-fg-3">
            root <span className="text-fg">{short(view.root, 10)}</span>
          </span>
          <span className="text-fg-4">{short(view.id, 10)}</span>
        </div>
      </div>

      {!known && (
        <div className={`border-b ${cell} border-warn/40 bg-warn/[0.07] px-4 py-2.5 text-[11.5px] text-fg-2`}>
          <span className="font-mono text-warn">?w={initialWorld}</span> is not a world in this
          session. Worlds live in memory here, so a link to a forked world only resolves for whoever
          forked it — persisting them is what makes these addresses durable.
        </div>
      )}

      {known && w.kind !== "primary" && (
        <div className={`border-b ${cell} bg-panel-2 px-4 py-2 text-[11.5px] text-fg-3`}>
          <span className="font-mono text-fg-2">{w.name}</span> — {w.hypothesis}. Irreversible
          actions are suppressed here; <span className="text-fg-2">primary is untouched</span>.
        </div>
      )}

      <div className="grid lg:grid-cols-[220px_1fr_320px]">
        {/* ── objects ────────────────────────────────────────────────── */}
        <div className={`border-b ${cell} lg:border-b-0 lg:border-r`}>
          <div className={`border-b ${cell} px-4 py-2.5`}>
            <Label className="text-fg-4">objects</Label>
          </div>
          <div className="max-h-[380px] overflow-y-auto py-1">
            {onto.objects.map((t) => (
              <div key={t.id} className="px-2 py-1.5">
                <div className="px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">
                  {t.label} <span className="nums">{(byType[t.id] ?? []).length}</span>
                </div>
                {(byType[t.id] ?? []).map((o) => (
                  <button
                    key={o.key}
                    onClick={() => setSelected(objKey(o.typeId, o.key))}
                    className={`mt-1 block w-full px-2 py-1 text-left text-[12.5px] transition-colors ${
                      selected === objKey(o.typeId, o.key)
                        ? "bg-accent-tint text-fg"
                        : "text-fg-2 hover:bg-panel-2"
                    }`}
                  >
                    {o.key}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── object detail ──────────────────────────────────────────── */}
        <div className={`border-b ${cell} lg:border-b-0 lg:border-r`}>
          <div className={`border-b ${cell} px-4 py-2.5`}>
            <Label className="text-fg-4">object</Label>
          </div>

          {!obj ? (
            <div className="px-4 py-6 text-[12.5px] text-fg-3">
              This object does not exist in <span className="font-mono text-fg-2">{activeId}</span>.
            </div>
          ) : (
            <div className="px-4 py-4">
              <div className="flex items-baseline gap-2.5">
                <span className="font-mono text-[13px] tracking-[0.1em] text-fg">{obj.typeId}</span>
                <span className="text-b2 text-fg">{obj.key}</span>
              </div>

              <div className="mt-4">
                <Label className="text-fg-4">properties</Label>
                <div className="mt-2 border border-line">
                  {Object.entries(obj.props).map(([k, v]) => {
                    const base = primaryHead.state.objects[selected]?.props[k];
                    const drifted = activeId !== "primary" && base !== undefined && base !== v;
                    return (
                      <div key={k} className={`flex items-baseline justify-between gap-4 border-b ${cell} px-3 py-2 last:border-b-0`}>
                        <span className="text-[12px] text-fg-3">{k}</span>
                        <span className="flex items-baseline gap-2">
                          {drifted && (
                            <span className="nums font-mono text-[11px] text-fg-4 line-through">{String(base)}</span>
                          )}
                          <span className={`nums font-mono text-[13px] ${drifted ? "text-accent" : "text-fg"}`}>
                            {String(v)}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-fg-4">provenance</Label>
                  <div className="mt-1.5 font-mono text-[11px] leading-relaxed text-fg-3">
                    <div>{obj.prov.source} · {obj.prov.originKind}</div>
                    <div className="text-fg-4">{obj.prov.originWorld} / seq {obj.prov.originSeq}</div>
                  </div>
                </div>
                <div>
                  <Label className="text-fg-4">links</Label>
                  <div className="mt-1.5 space-y-1">
                    {view.state.links
                      .filter((l) => l.from === selected || l.to === selected)
                      .map((l, i) => {
                        const other = l.from === selected ? l.to : l.from;
                        const def = onto.links.find((x) => x.id === l.typeId);
                        return (
                          <button
                            key={i}
                            onClick={() => setSelected(other)}
                            className="block text-left font-mono text-[11px] text-fg-2 underline decoration-line underline-offset-2 hover:text-accent"
                          >
                            {l.from === selected ? def?.label : `${def?.label} ←`} {other}
                          </button>
                        );
                      })}
                    {view.state.links.filter((l) => l.from === selected || l.to === selected).length === 0 && (
                      <span className="text-[11px] text-fg-4">none</span>
                    )}
                  </div>
                </div>
              </div>

              <code className="mt-4 block truncate border border-line-soft bg-panel-2 px-3 py-2 font-mono text-[10.5px] text-fg-4">
                {obj.hash}
              </code>
            </div>
          )}
        </div>

        {/* ── actions ────────────────────────────────────────────────── */}
        <div>
          <div className={`border-b ${cell} px-4 py-2.5`}>
            <Label className="text-fg-4">actions</Label>
          </div>

          <div className="p-1">
            {onto.actions.map((a) => {
              const willSuppress = a.effect === "irreversible" && w.kind !== "primary";
              return (
                <button
                  key={a.id}
                  onClick={() => pickAction(a.id)}
                  className={`block w-full px-3 py-2 text-left transition-colors ${
                    a.id === actionId ? "bg-accent-tint" : "hover:bg-panel-2"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] text-fg">{a.id}</span>
                    {willSuppress && (
                      <span className="ml-auto font-mono text-[9.5px] uppercase tracking-wider text-warn">
                        suppressed here
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-fg-4">effect_class: {a.effect}</div>
                </button>
              );
            })}
          </div>

          <div className={`border-t ${cell} px-4 py-4`}>
            <p className="text-[11.5px] leading-relaxed text-fg-3">{action.note}</p>

            <div className="mt-4 space-y-3">
              {Object.entries(action.params).map(([name, spec]) => (
                <label key={name} className="block">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">
                    {spec.label}
                  </span>
                  {spec.options ? (
                    <select
                      value={params[name] ?? ""}
                      onChange={(e) => setParams({ ...params, [name]: e.target.value })}
                      className="mt-1 w-full border border-line bg-panel px-2 py-1.5 font-mono text-[12px] text-fg"
                    >
                      {spec.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      value={params[name] ?? ""}
                      onChange={(e) => setParams({ ...params, [name]: e.target.value })}
                      inputMode={spec.type === "number" ? "numeric" : "text"}
                      className="mt-1 w-full border border-line bg-panel px-2 py-1.5 font-mono text-[12px] text-fg"
                    />
                  )}
                  {(spec.min !== undefined || spec.max !== undefined) && (
                    <span className="mt-1 block font-mono text-[10px] text-fg-4">
                      {spec.min} – {spec.max}
                    </span>
                  )}
                </label>
              ))}
            </div>

            {atHead ? (
              <button onClick={run} className="btn btn-primary mt-4 w-full text-center">
                Invoke
              </button>
            ) : (
              <div className="mt-4 border border-line bg-panel-2 px-3 py-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">
                  read-only
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-2">
                  You are looking at seq {view.seq}, not the head. Worlds are append-only (I2) —
                  history cannot be rewritten, so acting here is not a thing the runtime offers.
                  Fork from this point, or return to the head.
                </p>
                <button
                  onClick={() => pin(null)}
                  className="mt-3 border border-line px-2.5 py-1 font-mono text-[11px] text-fg-2 hover:border-fg-4 hover:text-fg"
                >
                  go to head
                </button>
              </div>
            )}

            {flash && (
              <div className={`mt-3 border px-3 py-2 ${STATUS[flash.status].border}`}>
                <div className={`font-mono text-[10px] uppercase tracking-[0.14em] ${STATUS[flash.status].cls}`}>
                  {flash.status}
                </div>
                <div className="mt-1 text-[11.5px] text-fg-2">
                  {flash.reason ??
                    (flash.status === "suppressed"
                      ? "Recorded, state updated, nothing emitted. The counterfactual exists; the notification was never sent."
                      : `${flash.action} produced a new snapshot.`)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── snapshot log ───────────────────────────────────────────────── */}
      <div className={`border-t ${cell}`}>
        <div className={`flex items-center gap-3 border-b ${cell} px-4 py-2.5`}>
          <Label className="text-fg-4">lineage</Label>
          <span className="font-mono text-[10.5px] text-fg-4">
            {activeId} · {chain.length} snapshot{chain.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="max-h-[190px] overflow-y-auto">
          {chain.map((s) => (
            <button
              key={s.id}
              onClick={() => s.world === head.world && pin(s.seq === head.seq ? null : s.seq)}
              className={`grid w-full grid-cols-[54px_1fr_auto] items-baseline gap-4 border-b ${cell} px-4 py-2 text-left transition-colors last:border-b-0 ${
                s.id === view.id ? "bg-accent-tint" : "hover:bg-panel-2"
              }`}
            >
              <span className="nums font-mono text-[11px] text-fg-3">
                {s.world === world ? `seq ${s.seq}` : `↖ ${s.seq}`}
              </span>
              <span className="truncate font-mono text-[11.5px] text-fg-2">
                {s.cause.kind === "action" ? (
                  <>
                    {s.cause.action}
                    <span className="text-fg-4">({JSON.stringify(s.cause.params).slice(1, -1)})</span>
                    {s.cause.suppressed && <span className="ml-2 text-warn">suppressed</span>}
                  </>
                ) : (
                  <span className="text-fg-4">{s.cause.kind}{s.world !== world && ` · ${s.world}`}</span>
                )}
              </span>
              <span className="font-mono text-[10.5px] text-fg-4">{short(s.id, 10)}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
