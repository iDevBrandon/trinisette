"use client";

/**
 * Airport Now — one console, one screen.
 *
 * The layout is the one this project already had and that worked: a coordinate bar on
 * top, three columns in the middle, a lineage strip along the bottom. What changed is
 * what the columns hold and where the triad lives.
 *
 *   🌊 Mare        the world chips on the bar, and the `compare` tab — parallel means
 *                  side by side, so worlds become columns rather than a tab swap
 *   🐚 Vongola     the strip at the foot: the track plus what happened at each step
 *   🌈 Arcobaleno  the address on the right of the bar — what you are looking at
 *
 * The axes are the chrome; the airport is the content. An earlier pass gave each axis a
 * tall explainer card and pushed the tool off the fold — the argument was visible and
 * the thing was unusable. Definitions are one line, long form is a `title` tooltip.
 *
 * PICK (left) · READ (middle) · ACT (right) is the same grammar as OBJECTS · OBJECT ·
 * ACTIONS in the console below the fold, which is deliberate: it is the same store.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { adapterFor } from "../../lib/feeds/queue";
import { SOURCES, TIERS, type SourceTier } from "../../lib/feeds/sources";
import {
  AIRPORT_ONTOLOGY, EVIDENCE_WINDOW_MIN, clockOf, derivePosted, fmtClock, fmtOffset,
  localMinuteAt, seedAirport, tzOffsetMin,
} from "../../lib/tri/airport";
import { short } from "../../lib/tri/hash";
import {
  createStore, fork, headOf, invoke, lineage, objKey,
  type Snapshot, type Store,
} from "../../lib/tri/runtime";
import { Axis, Label } from "../ui";
import Coordinate from "./Coordinate";
import MareCompare from "./MareCompare";
import { PipelineStages, TraceView } from "./Pipeline";
import VongolaStrip from "./VongolaStrip";
import WorldConsole from "./WorldConsole";

const onto = AIRPORT_ONTOLOGY;

const TIER_STYLE: Record<SourceTier | "grafted", { dot: string; text: string }> = {
  official: { dot: "bg-ok", text: "text-ok" },
  official_estimate: { dot: "bg-info", text: "text-info" },
  community: { dot: "bg-vongola", text: "text-vongola" },
  none: { dot: "bg-fg-4", text: "text-fg-4" },
  grafted: { dot: "bg-warn", text: "text-warn" },
};

const TIER_ORDER: SourceTier[] = ["official", "official_estimate", "none"];
const ofType = (s: Snapshot, t: string) => Object.values(s.state.objects).filter((o) => o.typeId === t);

export interface AirportNowProps {
  initialAirport?: string;
  initialWorld?: string;
  initialSeq?: number | null;
}

export default function AirportNow({
  initialAirport = "ATL", initialWorld = "primary", initialSeq = null,
}: AirportNowProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [store, setStore] = useState<Store>(() => createStore(seedAirport));
  const [worldReq, setWorldReq] = useState(initialWorld);
  const [pinned, setPinnedState] = useState<number | null>(initialSeq);
  const [iataReq, setIataReq] = useState(initialAirport);
  const [flash, setFlash] = useState<{ status: string; text: string } | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [tab, setTab] = useState<"board" | "compare" | "pipeline">("board");
  /** A checkpoint key whose posted number is being traced back to the bytes. */
  const [trace, setTrace] = useState<string | null>(null);

  const knownWorld = store.worlds[worldReq] !== undefined;
  const world = knownWorld ? worldReq : "primary";

  const head = headOf(store, world);
  const chain = useMemo(() => lineage(store, head.id), [store, head.id]);
  const view = useMemo(
    () => (pinned === null ? head : chain.find((s) => s.world === head.world && s.seq === pinned) ?? head),
    [pinned, head, chain],
  );
  const locked = view.id !== head.id;
  const primaryHead = headOf(store, "primary");

  const iata = SOURCES.some((s) => s.iata === iataReq) ? iataReq : "ATL";
  const airport = view.state.objects[objKey("Airport", iata)];
  const curve = view.state.objects[objKey("Curve", iata)];
  const faa = view.state.objects[objKey("FaaStatus", iata)];
  const at = clockOf(view.state);
  const tz = String(airport.props.tz);
  const localMin = localMinuteAt(view.state, iata);
  const offset = tzOffsetMin(tz, at);
  const clockSource = String(view.state.objects[objKey("Clock", "world")].props.source);
  const captures = useMemo(() => ofType(view, "Capture"), [view]);
  const capture = captures[captures.length - 1];

  const checkpoints = useMemo(
    () => ofType(view, "Checkpoint").filter((c) => c.props.airport === iata).sort((a, b) => a.key.localeCompare(b.key)),
    [view, iata],
  );
  const reports = useMemo(
    () => ofType(view, "Report").filter((r) => r.props.airport === iata)
      .sort((a, b) => Number(b.props.observedAtEpochMin) - Number(a.props.observedAtEpochMin)),
    [view, iata],
  );
  const donors = useMemo(
    () => ofType(view, "Curve").filter((c) => c.prov.originKind !== "grafted").map((c) => c.key).sort(),
    [view],
  );
  const worldCount = Object.keys(store.worlds).length;
  const showing = trace ? "trace" : tab === "compare" && worldCount < 2 ? "board" : tab;
  const derivation = useMemo(
    () => (trace ? derivePosted(view.state, trace) : null),
    [trace, view],
  );

  /* ── url ─────────────────────────────────────────────────────────────── */

  const writeUrl = useCallback((a: string, w: string, t: number | null) => {
    const q = new URLSearchParams(search.toString());
    if (a === "ATL") q.delete("a"); else q.set("a", a);
    if (w === "primary") q.delete("w"); else q.set("w", w);
    if (t === null) q.delete("t"); else q.set("t", String(t));
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }, [search, router, pathname]);

  const pickAirport = (a: string) => { setIataReq(a); setTrace(null); setFlash(null); writeUrl(a, world, pinned); };
  const pickWorld = (w: string) => { setWorldReq(w); setPinnedState(null); setFlash(null); writeUrl(iata, w, null); };
  const setPinned = (t: number | null) => { setPinnedState(t); writeUrl(iata, world, t); };

  /* ── acting ──────────────────────────────────────────────────────────── */

  const act = useCallback((actionId: string, params: Record<string, string | number>) => {
    const r = invoke(store, onto, world, actionId, params);
    setStore(r.store);
    const def = onto.actions.find((a) => a.id === actionId);
    setFlash({
      status: r.status,
      text: r.reason ?? (r.status === "suppressed"
        ? `${def?.label} computed, not emitted — this is not primary and the effect is irreversible.`
        : `${def?.label} → seq ${r.store.snapshots[r.store.worlds[world].head].seq}`),
    });
  }, [store, world]);

  async function ingestQueue() {
    setIngesting(true);
    try {
      const res = await fetch(`/api/feeds/queue/${iata}`, { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) {
        setFlash({ status: "rejected", text: `${iata} queue feed: ${data.error}${data.hint ? ` — ${data.hint}` : ""}` });
        return;
      }
      act("IngestQueueFeed", { payload: JSON.stringify(data) });
      if (data.via === "inferred") {
        setFlash({
          status: "suppressed",
          text: `${data.readings.length} checkpoints, but the records were found by shape alone — no extractor or field pin for this airport yet. Confidence docked to 70% until it is pinned — GET /api/feeds/queue/${iata}?raw=1 to read the real shape.`,
        });
      }
    } catch (e) {
      setFlash({ status: "rejected", text: `queue feed unreachable: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setIngesting(false); }
  }

  async function ingest() {
    setIngesting(true);
    try {
      const res = await fetch("/api/feeds/faa", { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) { setFlash({ status: "rejected", text: `feed error: ${data.error}` }); return; }
      act("IngestFaaStatus", { payload: JSON.stringify(data) });
      if (!data.live) {
        setFlash({ status: "suppressed", text: `Upstream unreachable (${data.error}) — synthetic fixture ingested and labelled as such. The clock is still the real fetch instant.` });
      }
    } catch (e) {
      setFlash({ status: "rejected", text: `feed unreachable: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setIngesting(false); }
  }

  const doFork = () => {
    const name = `exp-${worldCount}`;
    setStore(fork(store, world, name, `${iata} at ${fmtClock(localMin)} local, what if`));
    setWorldReq(name); setPinnedState(null); setTab("compare");
    setFlash({ status: "applied", text: `${name} forked from ${world} at seq ${head.seq} — nothing copied, it shares the parent's root.` });
    writeUrl(iata, name, null);
  };

  /* ── form state ──────────────────────────────────────────────────────── */

  const [rCheckpoint, setRCheckpoint] = useState("");
  const [rWait, setRWait] = useState("18");
  const [rPhotos, setRPhotos] = useState("1");
  const reportTarget = checkpoints.some((c) => c.key === rCheckpoint) ? rCheckpoint : (checkpoints[0]?.key ?? "");
  const [graftFrom, setGraftFrom] = useState("");
  const graftSource = donors.includes(graftFrom) ? graftFrom : (donors[0] ?? "");
  const [alertMsg, setAlertMsg] = useState("");
  const busiest = [...checkpoints].sort((a, b) => Number(b.props.postedMin) - Number(a.props.postedMin))[0];
  const defaultAlert = busiest ? `${iata} ${String(busiest.props.label)} is ${busiest.props.postedMin} min at ${fmtClock(localMin)}.` : "";

  const tier = String(airport.props.tier) as SourceTier;
  const grafted = curve?.prov.originKind === "grafted";
  const field = "w-full border border-line bg-panel px-2 py-1 font-mono text-[11.5px] text-fg";
  const chip = "border border-line px-2 py-1 font-mono text-[11px] text-fg-2 transition-colors hover:border-fg-4 hover:text-fg disabled:opacity-30";

  /* ── render ──────────────────────────────────────────────────────────── */

  return (
    <>
      <section className="border border-line bg-panel">
        <Coordinate
          store={store} world={world} view={view} head={head}
          at={at} localMin={localMin} tzLabel={fmtOffset(offset)} clockSource={clockSource}
          subject={iata} onWorld={pickWorld} onFork={doFork}
        />

        {/* feed + flash: one thin line each */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel-2 px-4 py-2">
          <Label className="text-fg-4">feed</Label>
          <span className="font-mono text-[11px] text-fg-3"
            title="FAA NAS Status — free, no key, covers all 46 airports. The only live upstream here.">
            FAA NAS Status
          </span>
          {capture ? (
            <span className="font-mono text-[11px] text-fg-3">
              <span className={capture.props.live ? "text-ok" : "text-warn"}>
                {capture.props.live ? "live" : "fixture"}
              </span>
              <span className="text-fg-4"> · {String(capture.props.entries)} entries · sha {short(String(capture.props.bodySha256), 10)}</span>
            </span>
          ) : (
            <span className="font-mono text-[11px] text-fg-4">not ingested in this world</span>
          )}
          {(() => {
            const ad = adapterFor(iata);
            const why = tier === "none"
              ? `${iata} has no queue feed — one of the sixteen. Graft a bank shape instead.`
              : !ad ? `no adapter for ${iata} yet`
              : ad.blocked ? ad.blocked
              : ad.transport === "html" ? `${iata} publishes HTML — needs a per-airport extractor pinned from a real page`
              : `GET ${ad.url}`;
            const ready = !!ad && !ad.blocked && ad.transport !== "html" && tier !== "none";
            return (
              <button
                onClick={ingestQueue}
                disabled={ingesting || locked || world !== "primary" || !ready}
                title={why}
                className="btn btn-sm ml-auto disabled:opacity-40"
              >
                {ready ? `Ingest ${iata} queue →` : `${iata} queue: not wired`}
              </button>
            );
          })()}
          <button
            onClick={ingest}
            disabled={ingesting || locked || world !== "primary"}
            title={world !== "primary"
              ? "IngestFaaStatus is primaryOnly — a true reading dropped into false premises is not a counterfactual. Re-fork from primary for newer data."
              : "The response bytes are hashed into the snapshot, clock included. Keep the payload and this world replays exactly."}
            className="btn btn-sm disabled:opacity-40"
          >
            {ingesting ? "fetching…" : capture ? "Re-ingest FAA" : "Ingest FAA →"}
          </button>
        </div>

        {flash && (
          <div className={`border-b px-4 py-1.5 text-[11.5px] ${
            flash.status === "rejected" ? "border-bad/40 bg-bad/[0.06]"
            : flash.status === "suppressed" ? "border-warn/40 bg-warn/[0.07]" : "border-ok/40 bg-ok/[0.06]"
          }`}>
            <span className={`font-mono text-[9.5px] uppercase tracking-[0.14em] ${
              flash.status === "rejected" ? "text-bad" : flash.status === "suppressed" ? "text-warn" : "text-ok"
            }`}>{flash.status}</span>
            <span className="ml-3 text-fg-2">{flash.text}</span>
          </div>
        )}

        {/* ── PICK · READ · ACT ──────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-[212px_1fr_310px]">

          {/* ── PICK ─────────────────────────────────────────────────────── */}
          <div className="border-b border-line lg:border-b-0 lg:border-r">
            <div className="flex items-baseline gap-2 border-b border-line px-3 py-2">
              <Label className="text-fg-4">airports</Label>
              <span className="font-mono text-[10px] text-fg-4">{SOURCES.length}</span>
            </div>
            <div className="max-h-[520px] overflow-y-auto py-1">
              {TIER_ORDER.map((t) => {
                const rows = SOURCES.filter((s) => s.tier === t);
                return (
                  <div key={t} className="px-2 py-1">
                    <div className="flex items-center gap-1.5 px-2 pb-1" title={TIERS[t].blurb}>
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${TIER_STYLE[t].dot}`} />
                      <span className="font-mono text-[9.5px] uppercase tracking-[0.13em] text-fg-4">
                        {TIERS[t].label} <span className="nums">{rows.length}</span>
                      </span>
                    </div>
                    {rows.map((s) => {
                      const on = s.iata === iata;
                      const g = view.state.objects[objKey("Curve", s.iata)]?.prov.originKind === "grafted";
                      return (
                        <button
                          key={s.iata}
                          onClick={() => pickAirport(s.iata)}
                          title={`${s.city}${s.note ? ` — ${s.note}` : ""}`}
                          className={`flex w-full items-baseline gap-2 px-2 py-[3px] text-left transition-colors ${
                            on ? "bg-fg text-bg" : "hover:bg-panel-2"
                          }`}
                        >
                          <span className={`font-mono text-[11.5px] ${on ? "text-bg" : "text-fg-2"}`}>{s.iata}</span>
                          <span className={`truncate text-[10.5px] ${on ? "text-bg/70" : "text-fg-4"}`}>{s.city}</span>
                          {g && <span className={`ml-auto font-mono text-[9px] ${on ? "text-bg/80" : "text-warn"}`}>graft</span>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── READ ─────────────────────────────────────────────────────── */}
          <div className="border-b border-line lg:border-b-0 lg:border-r">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2">
              <span className="font-mono text-[15px] tracking-[0.06em] text-fg">{iata}</span>
              <span className="text-[12px] text-fg-3">{String(airport.props.city)}</span>
              <span className="nums font-mono text-[11.5px] text-fg-2">{fmtClock(localMin)} {fmtOffset(offset)}</span>
              <span
                className={`font-mono text-[10.5px] ${grafted || tier === "none" ? "text-warn" : TIER_STYLE[tier].text}`}
                title={grafted ? `Shape grafted from ${curve.prov.via} — confidence docked to 60%.` : TIERS[tier].blurb}
              >
                {grafted ? `grafted ← ${curve.prov.via}` : TIERS[tier].label}
              </span>
              <span className="font-mono text-[10px] text-fg-4">{String(airport.props.granularity)}-level</span>

              <div className="ml-auto flex items-center gap-px">
                {(["board", "compare", "pipeline"] as const).map((k) => (
                  <button
                    key={k}
                    disabled={k === "compare" && worldCount < 2}
                    onClick={() => { setTab(k); setTrace(null); }}
                    title={k === "compare"
                      ? "Mare — the same checkpoint under every world at once. Fork first."
                      : k === "pipeline"
                        ? "Where these numbers come from: upstream → boundary → parse → ontology → derived, in this world."
                        : undefined}
                    className={`border px-2 py-0.5 font-mono text-[10.5px] transition-colors disabled:opacity-30 ${
                      showing === k ? "border-fg bg-fg text-bg" : "border-line text-fg-3 hover:border-fg-4 hover:text-fg"
                    }`}
                  >
                    {k === "compare" ? `compare ${worldCount}` : k}
                  </button>
                ))}
              </div>
            </div>

            {/* FAA operational status — one line */}
            <div className={`flex flex-wrap items-baseline gap-x-3 border-b border-line px-3 py-1.5 ${faa ? "bg-info/[0.05]" : ""}`}>
              <Label className="text-fg-4">faa</Label>
              {!capture ? <span className="text-[11.5px] text-fg-4">not ingested</span>
                : faa ? (
                  <>
                    <span className="font-mono text-[11.5px] text-info">{String(faa.props.kind).replace("_", " ")}</span>
                    <span className="text-[11.5px] text-fg-2">{String(faa.props.reason)}</span>
                    {Number(faa.props.avgMin) > 0 && <span className="nums font-mono text-[11px] text-fg-3">avg {String(faa.props.avgMin)}m</span>}
                    <span className="ml-auto font-mono text-[10.5px] text-fg-4">pressure ×{String(faa.props.pressure)}</span>
                  </>
                ) : <span className="text-[11.5px] text-fg-3">no delay programme — operating normally</span>}
            </div>

            {/* coverage gap → graft, compact */}
            {!curve && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-warn/[0.06] px-3 py-2">
                <Axis of="vongola" size={13} />
                <span className="text-[11.5px] text-fg"
                  title="One of sixteen airports on the board through FAA status with no queue feed at all. A number with no time-of-day shape cannot answer when to leave. Grafting borrows the shape — when the bank peaks and how wide — never the level.">
                  No queue feed. Borrow a bank shape:
                </span>
                <select value={graftSource} onChange={(e) => setGraftFrom(e.target.value)}
                  className="border border-line bg-panel px-1.5 py-0.5 font-mono text-[11px] text-fg">
                  {donors.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <button disabled={locked} onClick={() => act("GraftCurve", { to: iata, from: graftSource })}
                  className="btn btn-sm btn-primary disabled:opacity-40">
                  Graft →
                </button>
                <span className="ml-auto font-mono text-[10px] text-fg-4">GraftCurve · pure · conf 60%</span>
              </div>
            )}

            {showing === "trace" && derivation ? (
              <TraceView derivation={derivation} view={view} world={world} onClose={() => setTrace(null)} />
            ) : showing === "pipeline" ? (
              <PipelineStages view={view} world={world} />
            ) : showing === "compare" ? (
              <MareCompare
                store={store} activeWorld={world} airport={iata} onWorld={pickWorld}
                checkpoints={checkpoints.map((c) => ({ key: c.key, label: String(c.props.label) }))}
              />
            ) : (
              <>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-line text-left">
                      {["checkpoint", "lanes", "anchor", "crowd", "posted", "conf", "basis"].map((h) => (
                        <th key={h} className="px-3 py-1.5 font-mono text-[9.5px] font-normal uppercase tracking-[0.13em] text-fg-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {checkpoints.map((c) => {
                      const bk = String(c.props.basis) as SourceTier | "grafted";
                      const style = TIER_STYLE[bk] ?? TIER_STYLE.none;
                      const base = primaryHead.state.objects[objKey("Checkpoint", c.key)]?.props.postedMin;
                      const drift = world !== "primary" && base !== undefined && base !== c.props.postedMin;
                      const lanes = Number(c.props.lanes);
                      return (
                        <tr key={c.key} className="border-b border-line-soft last:border-b-0">
                          <td className="px-3 py-2">
                            <div className="text-[12.5px] text-fg">{String(c.props.label)}</div>
                            <div className="font-mono text-[9.5px] text-fg-4">{c.key}</div>
                          </td>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-1">
                              <button disabled={locked || lanes <= 1} onClick={() => act("SetStaffedLanes", { checkpoint: c.key, lanes: lanes - 1 })}
                                className="border border-line px-1 leading-4 font-mono text-[10px] text-fg-3 hover:border-fg-4 hover:text-fg disabled:opacity-30">−</button>
                              <span className="nums w-5 text-center font-mono text-[12px] text-fg">{lanes}</span>
                              <button disabled={locked || lanes >= 24} onClick={() => act("SetStaffedLanes", { checkpoint: c.key, lanes: lanes + 1 })}
                                className="border border-line px-1 leading-4 font-mono text-[10px] text-fg-3 hover:border-fg-4 hover:text-fg disabled:opacity-30">+</button>
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {c.props.anchoredOnFeed
                              ? <span className="nums font-mono text-[12px] text-ok" title="A direct feed reading is anchoring this number; the model is the projection from it.">
                                  {String(c.props.observedMin)}<span className="text-fg-4"> feed</span>
                                </span>
                              : <span className="nums font-mono text-[12px] text-fg-3">{String(c.props.modelMin)}</span>}
                          </td>
                          <td className="px-3 py-2">
                            {Number(c.props.reportsUsed) > 0
                              ? <span className="nums font-mono text-[12px] text-fg-3">{String(c.props.communityMin)}<span className="text-fg-4"> ·{String(c.props.reportsUsed)}r@{String(c.props.crowdWeightPct)}%</span></span>
                              : <span className="font-mono text-[11px] text-fg-4">—</span>}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => setTrace(c.key)}
                              title="Trace this number back to the bytes it came from."
                              className="flex items-baseline gap-1.5 text-left"
                            >
                              {drift && <span className="nums font-mono text-[10.5px] text-fg-4 line-through">{String(base)}</span>}
                              <span className={`nums font-mono text-[16px] underline decoration-line decoration-dotted underline-offset-4 hover:decoration-accent ${drift ? "text-mare" : "text-fg"}`}>
                                {String(c.props.postedMin)}
                              </span>
                              <span className="text-[9.5px] text-fg-4">min</span>
                            </button>
                          </td>
                          <td className="nums px-3 py-2 font-mono text-[11px] text-fg-3">{String(c.props.confidencePct)}%</td>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-1.5">
                              <span className={`inline-block h-1.5 w-1.5 rounded-full ${style.dot}`} />
                              <span className={`font-mono text-[10px] ${style.text}`}>
                                {bk === "grafted" ? "grafted" : TIERS[bk as SourceTier]?.label ?? "none"}
                              </span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="border-t border-line-soft px-3 py-1.5 font-mono text-[10px] text-fg-4"
                  title="Wait figures are modelled — no per-airport queue parser is wired yet. The tier, granularity and upstream URL are real, from the project's own source survey.">
                  posted = model×(1−w) + crowd×w · w = min(0.6, 0.2×reports) · model = baseLoad×demand×bank(local)×faa ÷ lanes · click any posted number to trace it
                </p>
              </>
            )}

            {/* reports, compact */}
            <div className="border-t border-line">
              <div className="flex items-baseline gap-2 px-3 py-1.5">
                <Label className="text-fg-4">reports</Label>
                <span className="font-mono text-[10px] text-fg-4">
                  {reports.filter((r) => r.props.current === true).length} in window · {reports.length} total
                </span>
                {reports.some((r) => r.props.current !== true) && (
                  <span className="font-mono text-[10px] text-fg-4"
                    title={`Outside the ${EVIDENCE_WINDOW_MIN}-minute evidence window: no longer counted, never deleted. A world is append-only (I2), so "not current" and "never happened" stay different claims.`}>
                    · aged out are kept
                  </span>
                )}
              </div>
              <div className="max-h-[92px] overflow-y-auto border-t border-line-soft">
                {reports.length === 0
                  ? <div className="px-3 py-2 text-[11px] text-fg-4">none in this world</div>
                  : reports.map((r) => {
                    const cur = r.props.current === true;
                    return (
                      <div key={r.key} className={`flex items-baseline gap-3 border-b border-line-soft px-3 py-1 last:border-b-0 ${cur ? "" : "bg-panel-2"}`}>
                        <span className="font-mono text-[10px] text-fg-4">{r.key}</span>
                        <span className={`font-mono text-[10.5px] ${cur ? "text-fg-2" : "text-fg-4 line-through"}`}>
                          {String(r.props.checkpoint)} · {String(r.props.waitMin)}m
                          {Number(r.props.photos) > 0 && <span className="text-fg-4"> · {String(r.props.photos)} ph</span>}
                        </span>
                        <span className={`ml-auto font-mono text-[10px] ${cur ? "text-ok" : "text-fg-4"}`}>
                          {cur ? `${r.props.ageMin}m` : `aged out ${r.props.ageMin}m`}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* ── ACT ──────────────────────────────────────────────────────── */}
          <div>
            <div className="border-b border-line px-3 py-2"><Label className="text-fg-4">act</Label></div>

            <div className="space-y-3 border-b border-line px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-fg-4">clock</span>
                {[30, 60, 120].map((m) => (
                  <button key={m} disabled={locked} onClick={() => act("AdvanceClock", { minutes: m })} className={chip}>+{m}m</button>
                ))}
                <span className="ml-auto font-mono text-[9.5px] text-fg-4"
                  title={curve ? `The bank peaks at ${String(curve.props.peak)} local — walk into it and the posted waits move on their own.` : "No shape — the clock changes nothing here, which is the complaint about the sixteen."}>
                  branchable
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-fg-4">demand</span>
                {["light", "normal", "heavy"].map((d) => (
                  <button key={d} disabled={locked} onClick={() => act("AssumeDemand", { airport: iata, demand: d })}
                    className={`border px-2 py-1 font-mono text-[11px] transition-colors disabled:opacity-30 ${
                      airport.props.demand === d ? "border-fg bg-fg text-bg" : "border-line text-fg-2 hover:border-fg-4 hover:text-fg"
                    }`}>{d}</button>
                ))}
              </div>
            </div>

            <div className="border-b border-line px-3 py-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-fg-4"
                title="Your observation counts toward the posted wait for 120 minutes, then ages out of the window — and is never deleted (I2).">
                report this queue
              </span>
              <div className="mt-1.5 grid grid-cols-[1fr_54px_46px] gap-1.5">
                <select value={reportTarget} onChange={(e) => setRCheckpoint(e.target.value)} className={field}>
                  {checkpoints.map((c) => <option key={c.key} value={c.key}>{c.key}</option>)}
                </select>
                <input value={rWait} onChange={(e) => setRWait(e.target.value)} inputMode="numeric" className={field} title="observed wait, minutes" />
                <input value={rPhotos} onChange={(e) => setRPhotos(e.target.value)} inputMode="numeric" className={field} title="photos attached — a report with a photo carries more confidence" />
              </div>
              <button disabled={locked} onClick={() => act("RecordReport", { checkpoint: reportTarget, waitMin: rWait, photos: rPhotos })}
                className="btn btn-sm mt-1.5 w-full text-center disabled:opacity-40">
                I&rsquo;m in this queue
              </button>
            </div>

            <div className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-fg-4">alert</span>
                <span className={`ml-auto font-mono text-[9px] uppercase tracking-wider ${world === "primary" ? "text-bad" : "text-warn"}`}
                  title={world === "primary"
                    ? "Declared irreversible. In primary the runtime lets it through — no notifier is wired in this build, so what is demonstrated is the rule, not a delivery."
                    : "PublishAlert is declared irreversible and this is not primary, so invoke() computes it and declines to emit. No component checks that."}>
                  {world === "primary" ? "irreversible · would emit" : "suppressed here"}
                </span>
              </div>
              <input value={alertMsg} onChange={(e) => setAlertMsg(e.target.value)} placeholder={defaultAlert}
                className={`${field} mt-1.5 placeholder:text-fg-4`} />
              <button disabled={locked} onClick={() => act("PublishAlert", { airport: iata, message: alertMsg || defaultAlert })}
                className="btn btn-sm mt-1.5 w-full text-center disabled:opacity-40">
                Publish alert
              </button>
              <p className="mt-2 text-[10.5px] leading-relaxed text-fg-4">
                {world === "primary"
                  ? "The only irreversible action here. Fork and press it again: same button, same declaration, refused — and the refusal recorded as a snapshot rather than swallowed."
                  : "Computed and withheld, by invoke() rather than by a disabled prop. Flip effect to \"pure\" in lib/tri/airport.ts and it starts going through, with no change to this component."}
              </p>
            </div>
          </div>
        </div>

        <VongolaStrip
          chain={chain} world={world} head={head} view={view}
          parent={store.worlds[world].parent} onPin={setPinned}
        />
      </section>

      {!knownWorld && (
        <div className="mt-3 border border-warn/40 bg-warn/[0.07] px-4 py-2 text-[11.5px] text-fg-2">
          <span className="font-mono text-warn">?w={initialWorld}</span> is not a world in this session — worlds
          live in memory in this build, so a fork link resolves only for whoever forked it.
        </div>
      )}

      <details className="mt-3 border border-line bg-panel-2">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2">
          <Label className="text-fg-4">the substrate underneath</Label>
          <span className="font-mono text-[11px] text-fg-3">
            same store · {Object.keys(view.state.objects).length} objects · {chain.length} snapshots
          </span>
          <span className="ml-auto font-mono text-[11px] text-accent">open ↓</span>
        </summary>
        <div className="border-t border-line bg-bg p-4">
          <p className="mb-3 max-w-[92ch] text-[11.5px] leading-relaxed text-fg-3">
            Everything above is this, with a traveller&rsquo;s vocabulary on top. Paste a recorded
            capture payload into <code className="font-mono text-fg-2">IngestFaaStatus</code> and the
            world replays to the address it had when that payload was live.
          </p>
          <WorldConsole
            onto={onto}
            store={store} setStore={setStore} world={world} pinned={pinned} setPinned={setPinned}
            focus={checkpoints[0] ? objKey("Checkpoint", checkpoints[0].key) : undefined}
          />
        </div>
      </details>
    </>
  );
}
