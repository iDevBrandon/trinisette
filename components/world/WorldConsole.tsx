"use client";

/**
 * The substrate underneath the product surface.
 *
 * Deliberately NOT called an ontology browser. Objects, links and actions are the
 * vocabulary you act through; they are not what this screen is for. Foundry sells the
 * ontology and attaches what-if to it. Here the branching is the product and the ontology
 * is the layer beneath, so the console leads with the coordinate — one world at one seq,
 * address on the bar — and the object graph is how you get work done inside it.
 *
 * This component is controlled: the app above owns the store, so the traveller-facing
 * panels and this one are looking at the same world, not two copies of it.
 *
 * Nothing here special-cases behaviour in the component. The parameter forms are built
 * from each action's declared `params`; validation messages come back from the runtime;
 * and PublishAlert is refused outside the primary world by `invoke()`, not by a disabled
 * prop.
 */
import { useMemo, useState } from "react";
import { AIRPORT_ONTOLOGY } from "../../lib/tri/airport";
import { fmtParams, short } from "../../lib/tri/hash";
import {
  headOf, invoke, lineage, objKey,
  type OntoObject, type Store,
} from "../../lib/tri/runtime";
import { Label } from "../ui";

const onto = AIRPORT_ONTOLOGY;

const STATUS = {
  applied: { cls: "text-ok", border: "border-ok/40 bg-ok/[0.06]" },
  suppressed: { cls: "text-warn", border: "border-warn/40 bg-warn/[0.07]" },
  rejected: { cls: "text-bad", border: "border-bad/40 bg-bad/[0.06]" },
} as const;

export interface WorldConsoleProps {
  store: Store;
  setStore: (s: Store) => void;
  world: string;
  /** null = follow head. A number pins the view to that seq (read-only). */
  pinned: number | null;
  setPinned: (t: number | null) => void;
  /** Preselect an object, e.g. the checkpoint the traveller clicked upstairs. */
  focus?: string;
}

export default function WorldConsole({ store, setStore, world, pinned, setPinned, focus }: WorldConsoleProps) {
  const [selected, setSelected] = useState(focus ?? objKey("Clock", "world"));
  const [actionId, setActionId] = useState(onto.actions[0].id);
  const [params, setParams] = useState<Record<string, string>>({ minutes: "30" });
  const [flash, setFlash] = useState<{ status: keyof typeof STATUS; reason?: string; action: string } | null>(null);

  const head = headOf(store, world);
  const primaryHead = headOf(store, "primary");
  const w = store.worlds[world];
  const action = onto.actions.find((a) => a.id === actionId)!;
  const chain = useMemo(() => lineage(store, head.id), [store, head.id]);
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
    const r = invoke(store, onto, world, actionId, params);
    setStore(r.store);
    setFlash({ status: r.status, reason: r.reason, action: action.label });
  }

  const cell = "border-line";

  return (
    <section className="border border-line bg-panel">
      <div className="grid lg:grid-cols-[230px_1fr_330px]">
        {/* ── objects ────────────────────────────────────────────────── */}
        <div className={`border-b ${cell} lg:border-b-0 lg:border-r`}>
          <div className={`border-b ${cell} px-4 py-2.5`}>
            <Label className="text-fg-4">objects</Label>
          </div>
          <div className="max-h-[420px] overflow-y-auto py-1">
            {onto.objects.map((t) => (
              <div key={t.id} className="px-2 py-1.5">
                <div className="px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-4">
                  {t.label} <span className="nums">{(byType[t.id] ?? []).length}</span>
                </div>
                {(byType[t.id] ?? []).map((o) => (
                  <button
                    key={o.key}
                    onClick={() => setSelected(objKey(o.typeId, o.key))}
                    className={`mt-1 block w-full px-2 py-1 text-left font-mono text-[11.5px] transition-colors ${
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
              This object does not exist in <span className="font-mono text-fg-2">{world}</span> at seq {view.seq}.
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
                    const drifted = world !== "primary" && base !== undefined && base !== v;
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
                    <div>
                      {obj.prov.source} · {obj.prov.originKind}
                      {obj.prov.via && <span className="text-warn"> via {obj.prov.via}</span>}
                    </div>
                    <div className="text-fg-4">
                      {obj.prov.originWorld} / seq {obj.prov.originSeq}
                      {obj.prov.confidence !== undefined && ` · conf ${Math.round(obj.prov.confidence * 100)}%`}
                    </div>
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
                  ) : spec.multiline ? (
                    // Cassette payloads land here. Paste a recorded capture and the world
                    // replays to the address it had when that capture was live.
                    <textarea
                      value={params[name] ?? ""}
                      onChange={(e) => setParams({ ...params, [name]: e.target.value })}
                      rows={5}
                      placeholder='{"feedId":"faa.nasstatus","entries":[…]}'
                      className="mt-1 w-full resize-y border border-line bg-panel px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-fg placeholder:text-fg-4"
                    />
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
                  onClick={() => setPinned(null)}
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

      {/* ── lineage ────────────────────────────────────────────────────── */}
      <div className={`border-t ${cell}`}>
        <div className={`flex items-center gap-3 border-b ${cell} px-4 py-2.5`}>
          <Label className="text-fg-4">lineage</Label>
          <span className="font-mono text-[10.5px] text-fg-4">
            {world} · {chain.length} snapshot{chain.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="max-h-[210px] overflow-y-auto">
          {chain.map((s) => (
            <button
              key={s.id}
              onClick={() => s.world === head.world && setPinned(s.seq === head.seq ? null : s.seq)}
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
                    <span className="text-fg-4"> {fmtParams(s.cause.params)}</span>
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
