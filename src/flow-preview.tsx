import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AgentFlow, type AgentFlowProps, type FlowStep } from "./ui-xenon/agent-flow";
import { VARIANTS, pageStyle, pillStyle, type Variant } from "./preview-config";

// Standalone preview of the Agent Flow, kept apart from the main app. Open /flow.html in the dev server.
// The buttons show the states an agent can be in; the bar above reconfigures it (a light theme through CSS variables,
// the words through `labels`).
type Scenario = "running" | "needs" | "failed" | "finished" | "noplan";
const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: "running", label: "Running" },
  { id: "needs", label: "Needs you" },
  { id: "failed", label: "Failed" },
  { id: "finished", label: "Finished" },
  { id: "noplan", label: "No plan yet" },
];

const T = Date.now();
const titles = ["Read schema and 14 migrations", "Plan the split into accounts and profiles", "Write migration 0042_split_users", "Dry run on staging", "Open a pull request for review"];
const meta: Record<number, Partial<FlowStep>> = {
  0: { tool: "db.schema", detail: "Found 14 migrations, users table has 9 columns", duration: 1400 },
  1: { tool: "plan.split", detail: "Accounts keep auth, profiles take the rest", duration: 4600 },
  2: { tool: "fs.write", detail: "Writing migration for Postgres 16" },
  3: { tool: "staging.run", detail: "Apply, then roll back to check it is reversible" },
  4: { tool: "gh.pr", detail: "Open for review with the schema diff" },
};

const build = (scenario: Scenario): { agent: AgentFlowProps["agent"]; steps: FlowStep[]; decision?: AgentFlowProps["decision"] } => {
  const at = (n: number, status: FlowStep["status"], extra: Partial<FlowStep> = {}): FlowStep[] =>
    titles.map((title, i) => ({ id: `s${i}`, title, status: i < n ? "done" : i === n ? status : "pending", ...meta[i], ...(i === n ? extra : {}), ...(i < n ? { duration: meta[i].duration ?? 3000 + i * 900 } : {}) }));
  switch (scenario) {
    case "running":
      return {
        agent: { name: "Migrate users table", model: "Opus 5.5", task: "Write migration 0042_split_users", details: "Splitting users into accounts and profiles", status: "working", progress: 44, cost: 0.31 },
        steps: at(2, "active", { startedAt: T - 12_000, notes: [{ id: "n", text: "Use Postgres 16 syntax – prod isn't on 17 yet", picked: "next" }] }),
      };
    case "needs":
      return {
        agent: { name: "Migrate users table", model: "Opus 5.5", task: "Drop the old users view?", details: "Blocked until you answer", status: "waiting", progress: 62, cost: 0.38 },
        steps: at(3, "waiting", { ask: "Needs your call before it touches staging", detail: "Dropping the view breaks two dashboards" }),
        decision: {
          question: "What should happen to the old users view?",
          options: [
            { id: "keep", label: "Keep it for a week", agentPick: true },
            { id: "drop", label: "Drop it now" },
            { id: "alias", label: "Replace with an alias" },
          ],
        },
      };
    case "failed":
      return {
        agent: { name: "Migrate users table", model: "Opus 5.5", task: "Dry run on staging", details: "Stopped on an error", status: "paused", progress: 62, cost: 0.4 },
        steps: at(3, "failed", { error: "Foreign key accounts_profile_id_fkey violates on 212 rows" }),
      };
    case "finished":
      return {
        agent: { name: "Migrate users table", model: "Opus 5.5", task: "Migration merged", details: "All five steps finished", status: "done", progress: 100, cost: 0.52 },
        steps: titles.map((title, i) => ({ id: `s${i}`, title, status: "done", ...meta[i], duration: [1400, 4600, 5200, 2600, 1800][i] })),
      };
    default:
      return {
        agent: { name: "agent-CNC", model: "claude", task: "Orange waiting-state flicker in agent boxes", details: "No plan reported – showing what it is doing now", status: "working", progress: 0, cost: 0 },
        steps: [{ id: "now", title: "Orange waiting-state flicker in agent boxes", status: "active", startedAt: T - 95_000 }],
      };
  }
};

const LIGHT = { "--xaf-bg": "#ffffff", "--xaf-panel": "#f6f7fa", "--xaf-surface": "#f3f4f8", "--xaf-surface-hover": "#eceef4", "--xaf-tile": "#ffffff", "--xaf-line": "#dfe1e8", "--xaf-line-strong": "#c9ccd6", "--xaf-text": "#16171b", "--xaf-muted": "#6d707a", "--xaf-kbd": "#e6e8ef", "--xaf-accent": "#3f55d8", "--xaf-route": "#5468e8", "--xaf-active": "#3f55d8", "--xaf-active-bg": "#eef1ff", "--xaf-glow": "rgba(63,85,216,.3)", "--xaf-done": "#1e8f5a", "--xaf-done-bg": "#dff3e8", "--xaf-wait": "#b8671f", "--xaf-wait-bg": "#fbead8", "--xaf-wait-line": "#e3b47c", "--xaf-fail": "#c0392b", "--xaf-fail-bg": "#fbe1de", "--xaf-fail-line": "#e49a93", "--xaf-code": "#e6e8ef", "--xaf-dim-text": "#3b3e48", "--xaf-soft": "#2a2d35", "--xaf-badge": "#e6e8ef", "--xaf-on-wait": "#ffffff" } as React.CSSProperties;

const SPANISH: Partial<AgentFlowProps> = {
  title: "Flujo de decisiones",
  labels: {
    agentStatus: { working: "Trabajando", waiting: "Te necesita", done: "Hecho", paused: "En pausa" },
    stepStatus: { done: "Hecho", active: "En curso", waiting: "Te necesita", pending: "En cola", failed: "Falló" },
    position: (i, n) => `Paso ${i} de ${n}`,
    doneCount: (d, n) => `${d} de ${n} hechos`,
    progress: "Progreso",
    running: (c) => `En curso · ${c}`,
    respond: "Responder",
    agentPick: "Elección del agente",
    pickedUp: "Recibida",
    interrupted: "Interrumpió",
    legend: { done: "Hecho", active: "En curso", waiting: "Te necesita", pending: "En cola", failed: "Falló" },
    empty: "Aún no hay pasos",
  },
};

function Page() {
  const [variant, setVariant] = useState<Variant>("default");
  const [scenario, setScenario] = useState<Scenario>("running");
  const [clicked, setClicked] = useState("");
  const { agent, steps, decision } = build(scenario);
  return (
    <div style={pageStyle(variant, "#111")}>
      <div style={{ maxWidth: 1500, margin: "0 auto" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {SCENARIOS.map((s) => (
            <button key={s.id} style={pillStyle(scenario === s.id)} onClick={() => setScenario(s.id)}>
              {s.label}
            </button>
          ))}
          <span style={{ width: 12 }} />
          {VARIANTS.map((v) => (
            <button key={v.id} style={pillStyle(variant === v.id)} onClick={() => setVariant(v.id)}>
              {v.label}
            </button>
          ))}
          {clicked && <span style={{ alignSelf: "center", fontSize: 14, color: "#8d8d96" }}>{clicked}</span>}
        </div>
        <AgentFlow
          key={scenario}
          agent={agent}
          steps={steps}
          decision={decision}
          onRespond={(s) => setClicked(`Respond pressed on “${s.title}”`)}
          style={variant === "light" ? LIGHT : undefined}
          {...(variant === "spanish" ? SPANISH : {})}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Page />);
