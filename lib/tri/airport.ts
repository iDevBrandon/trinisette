/**
 * The airport ontology — the schema layer for the workbench.
 *
 * Object types, link types and action types are DECLARED here and nowhere else. The UI
 * renders itself from these declarations: the parameter forms, the validation messages
 * and the suppression behaviour are all consequences of this file, not of component
 * code. That is the property being demonstrated — change an action's `effect` to
 * `irreversible` here and the button starts being refused outside the primary world,
 * with no UI change at all.
 */
import { makeObject, objKey, type Ontology, type Provenance, type WorldState } from "./runtime";

/** Deterministic queue model. Wait falls as lanes open and rises with demand. */
export const DEMAND: Record<string, number> = { low: 0.7, normal: 1.0, high: 1.5 };

function recompute(draft: WorldState, terminalKey: string, prov: Provenance) {
  const terminal = draft.objects[objKey("Terminal", terminalKey)];
  if (!terminal) return;
  const factor = DEMAND[String(terminal.props.demand)] ?? 1;

  for (const o of Object.values(draft.objects)) {
    if (o.typeId !== "Checkpoint" || o.props.terminal !== terminalKey) continue;
    const lanes = Math.max(1, Number(o.props.lanes));
    const load = Number(o.props.baseLoad);
    const wait = Math.round((load * factor) / lanes);
    draft.objects[objKey("Checkpoint", o.key)] = makeObject(
      "Checkpoint", o.key, { ...o.props, waitMin: wait }, o.prov,
    );
  }
  void prov;
}

export const AIRPORT_ONTOLOGY: Ontology = {
  version: "airport-v1",

  objects: [
    { id: "Terminal", label: "Terminal", keyProp: "code", display: ["airport", "demand"] },
    { id: "Checkpoint", label: "Checkpoint", keyProp: "code", display: ["terminal", "lanes", "waitMin"] },
    { id: "Report", label: "Traveller report", keyProp: "id", display: ["checkpoint", "waitMin"] },
    { id: "Alert", label: "Alert", keyProp: "id", display: ["terminal", "message"] },
  ],

  links: [
    { id: "in_terminal", label: "is in", from: "Checkpoint", to: "Terminal" },
    { id: "reports_on", label: "reports on", from: "Report", to: "Checkpoint" },
    { id: "posted_to", label: "posted to", from: "Alert", to: "Terminal" },
  ],

  actions: [
    {
      id: "SetStaffedLanes",
      label: "Set staffed lanes",
      effect: "branchable",
      touches: ["Checkpoint"],
      note: "Opening or closing lanes changes the wait. Branchable: the roster can be forked alongside the world.",
      params: {
        checkpoint: { type: "string", label: "Checkpoint", options: ["A", "B", "C"] },
        lanes: { type: "number", label: "Lanes", min: 1, max: 12 },
      },
      requires: [{ objectType: "Checkpoint", keyFromParam: "checkpoint" }],
      handler: (draft, p, prov) => {
        const k = objKey("Checkpoint", p.checkpoint);
        const c = draft.objects[k];
        draft.objects[k] = makeObject("Checkpoint", c.key, { ...c.props, lanes: Number(p.lanes) }, prov);
        recompute(draft, String(c.props.terminal), prov);
      },
    },
    {
      id: "AssumeDemand",
      label: "Assume demand regime",
      effect: "pure",
      touches: ["Terminal"],
      note: "The exogenous knob. Setting it is itself a declared action, so the assumption is auditable rather than smuggled in as setup.",
      params: {
        terminal: { type: "string", label: "Terminal", options: ["T1"] },
        demand: { type: "string", label: "Demand", options: ["low", "normal", "high"] },
      },
      requires: [{ objectType: "Terminal", keyFromParam: "terminal" }],
      handler: (draft, p, prov) => {
        const k = objKey("Terminal", p.terminal);
        const t = draft.objects[k];
        draft.objects[k] = makeObject("Terminal", t.key, { ...t.props, demand: String(p.demand) }, prov);
        recompute(draft, t.key, prov);
      },
    },
    {
      id: "RecordReport",
      label: "Record traveller report",
      effect: "pure",
      touches: ["Report"],
      note: "A crowd observation. Pure: it adds evidence, it changes nothing outside the system.",
      params: {
        checkpoint: { type: "string", label: "Checkpoint", options: ["A", "B", "C"] },
        waitMin: { type: "number", label: "Reported wait", min: 0, max: 240 },
      },
      requires: [{ objectType: "Checkpoint", keyFromParam: "checkpoint" }],
      handler: (draft, p, prov) => {
        const n = Object.values(draft.objects).filter((o) => o.typeId === "Report").length + 1;
        const id = `R${n}`;
        draft.objects[objKey("Report", id)] = makeObject(
          "Report", id,
          { id, checkpoint: String(p.checkpoint), waitMin: Number(p.waitMin) },
          { ...prov, source: "community" },
        );
        draft.links.push({ typeId: "reports_on", from: objKey("Report", id), to: objKey("Checkpoint", String(p.checkpoint)) });
      },
    },
    {
      id: "PublishAlert",
      label: "Publish departure alert",
      effect: "irreversible",
      touches: ["Alert"],
      note: "This pushes a notification to real travellers. It cannot be unsent, so outside the primary world the runtime refuses to emit it and records the attempt as suppressed.",
      params: {
        terminal: { type: "string", label: "Terminal", options: ["T1"] },
        message: { type: "string", label: "Message" },
      },
      requires: [{ objectType: "Terminal", keyFromParam: "terminal" }],
      handler: (draft, p, prov) => {
        const n = Object.values(draft.objects).filter((o) => o.typeId === "Alert").length + 1;
        const id = `A${n}`;
        draft.objects[objKey("Alert", id)] = makeObject(
          "Alert", id, { id, terminal: String(p.terminal), message: String(p.message) }, prov,
        );
        draft.links.push({ typeId: "posted_to", from: objKey("Alert", id), to: objKey("Terminal", String(p.terminal)) });
      },
    },
  ],
};

export function seedAirport(prov: Provenance): WorldState {
  const state: WorldState = { objects: {}, links: [] };

  state.objects[objKey("Terminal", "T1")] = makeObject(
    "Terminal", "T1", { code: "T1", airport: "YYZ", demand: "normal" }, prov,
  );

  const checkpoints: [string, number, number][] = [
    ["A", 4, 100],
    ["B", 3, 84],
    ["C", 2, 46],
  ];
  for (const [code, lanes, baseLoad] of checkpoints) {
    state.objects[objKey("Checkpoint", code)] = makeObject(
      "Checkpoint", code,
      { code, terminal: "T1", lanes, baseLoad, waitMin: Math.round(baseLoad / lanes) },
      prov,
    );
    state.links.push({ typeId: "in_terminal", from: objKey("Checkpoint", code), to: objKey("Terminal", "T1") });
  }

  return state;
}
