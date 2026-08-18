"use client";

/**
 * A console for any declared ontology, with no domain code in it.
 *
 * The airport has a bespoke product surface because it is the one being built for real.
 * These three do not, and that is the demonstration: an ontology declared against the
 * same `Ontology` type gets a working, forkable, addressable console for free — the
 * object list, the parameter forms, the validation messages, the suppression and the
 * primary-only refusals all fall out of the declaration.
 *
 * If the substrate were an airport application with a general-sounding name, this
 * component could not exist. Everything domain-specific in it is a string in the props.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { DOMAINS } from "../../lib/tri/domains";
import {
  createStore, fork, headOf, lineage, objKey,
  type Store,
} from "../../lib/tri/runtime";
import { fmtUtc } from "../../lib/tri/time";
import { Label } from "../ui";
import Coordinate from "./Coordinate";
import VongolaStrip from "./VongolaStrip";
import WorldConsole from "./WorldConsole";

export interface DomainConsoleProps {
  /**
   * A slug, not the ontology itself. An `Ontology` carries its action handlers, and
   * functions cannot cross the server/client boundary — so the declaration is resolved
   * here, on the client, where the handlers are real functions again.
   */
  domain: string;
  initialWorld?: string;
  initialSeq?: number | null;
}

export default function DomainConsole({
  domain, initialWorld = "primary", initialSeq = null,
}: DomainConsoleProps) {
  const { onto, seed, subject } = DOMAINS[domain];
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [store, setStore] = useState<Store>(() => createStore(seed));
  const [worldReq, setWorldReq] = useState(initialWorld);
  const [pinned, setPinnedState] = useState<number | null>(initialSeq);

  const knownWorld = store.worlds[worldReq] !== undefined;
  const world = knownWorld ? worldReq : "primary";

  const head = headOf(store, world);
  const chain = useMemo(() => lineage(store, head.id), [store, head.id]);
  const view = useMemo(
    () => (pinned === null ? head : chain.find((s) => s.world === head.world && s.seq === pinned) ?? head),
    [pinned, head, chain],
  );

  const clock = view.state.objects[objKey("Clock", "world")];
  const at = Number(clock.props.epochMin);
  const clockSource = String(clock.props.source);

  const writeUrl = useCallback((w: string, t: number | null) => {
    const q = new URLSearchParams(search.toString());
    if (w === "primary") q.delete("w"); else q.set("w", w);
    if (t === null) q.delete("t"); else q.set("t", String(t));
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }, [search, router, pathname]);

  const pickWorld = (w: string) => { setWorldReq(w); setPinnedState(null); writeUrl(w, null); };
  const setPinned = (t: number | null) => { setPinnedState(t); writeUrl(world, t); };

  const doFork = () => {
    const name = `exp-${Object.keys(store.worlds).length}`;
    setStore(fork(store, world, name, `${subject} at ${fmtUtc(at)}, what if`));
    setWorldReq(name);
    setPinnedState(null);
    writeUrl(name, null);
  };

  return (
    <section className="border border-line bg-panel">
      <Coordinate
        store={store} world={world} view={view} head={head}
        at={at}
        // These domains keep one global clock rather than 46 local ones, so the address
        // shows UTC directly instead of projecting through a zone.
        localMin={((at % 1440) + 1440) % 1440}
        tzLabel="UTC"
        clockSource={clockSource}
        subject={subject}
        onWorld={pickWorld} onFork={doFork}
      />

      {!knownWorld && (
        <div className="border-b border-warn/40 bg-warn/[0.07] px-4 py-2 text-[11.5px] text-fg-2">
          <span className="font-mono text-warn">?w={initialWorld}</span> is not a world in this session —
          worlds live in memory in this build.
        </div>
      )}

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line bg-panel-2 px-4 py-2">
        <Label className="text-fg-4">ontology</Label>
        <span className="font-mono text-[11px] text-fg-3">{onto.version}</span>
        <span className="font-mono text-[10.5px] text-fg-4">
          {onto.objects.length} object types · {onto.links.length} link types · {onto.actions.length} actions
        </span>
        <span className="ml-auto text-[11px] text-fg-4">
          no domain code in this console — everything below is the declaration
        </span>
      </div>

      <WorldConsole
        onto={onto}
        store={store} setStore={setStore}
        world={world} pinned={pinned} setPinned={setPinned}
      />

      <VongolaStrip
        chain={chain} world={world} head={head} view={view}
        parent={store.worlds[world].parent} onPin={setPinned}
      />
    </section>
  );
}
