import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AgentTree, type AgentTreeProps, type TreeAgent, type TreeStatus } from "./ui-xenon/agent-tree";
import { VARIANTS, pageStyle, pillStyle, type Variant } from "./preview-config";

// Standalone preview of the Agent Tree, kept apart from the main app. Open /tree.html in the dev server.
// It replays the run in the reference recording: agents arrive, costs and clocks tick, states change, a branch folds.
// "Time" here is the run's own clock, played at SPEED times real time.
const SPEED = 4;
const END = 106;
const BASE = 1_700_000_000_000;

type Phase = { at: number; status: TreeStatus; ask?: string; error?: string };
type Spec = { id: string; parent?: string; name: string; model: string; task: string; tools: string[]; cost: number; spawn: number; phases: Phase[] };

// `cost` is what the agent itself spends over its working life; a card adds everything below it.
const SPECS: Spec[] = [
  { id: "orchestrator", name: "Orchestrator", model: "Opus 5.5", task: "Launch the new pricing page by Friday", tools: ["Slack", "Notion", "GitHub"], cost: 1.11, spawn: 0, phases: [{ at: 0, status: "running" }, { at: 101, status: "done" }] },
  { id: "researcher", parent: "orchestrator", name: "Researcher", model: "Sonnet 5.5", task: "Compare the pricing of five competitors", tools: ["Notion", "Slack"], cost: 0.18, spawn: 2, phases: [{ at: 2, status: "running" }, { at: 45, status: "done" }] },
  { id: "scraper", parent: "researcher", name: "Scraper", model: "Gemini 3.8 Flash", task: "Read the pricing pages of Linear, Notion and three more", tools: ["Notion"], cost: 0.03, spawn: 5, phases: [{ at: 5, status: "running" }, { at: 22, status: "done" }] },
  { id: "analyst", parent: "researcher", name: "Analyst", model: "Sonnet 5.5", task: "Summarize 120 G2 reviews that mention price", tools: ["HubSpot", "Notion"], cost: 0.08, spawn: 8, phases: [{ at: 8, status: "running" }, { at: 27, status: "done" }] },
  { id: "writer", parent: "orchestrator", name: "Writer", model: "Sonnet 5.5", task: "Write the copy for the three plans", tools: ["Notion", "Figma"], cost: 0.19, spawn: 2, phases: [{ at: 2, status: "running" }, { at: 35, status: "waiting", ask: "Which tone should the plan copy use?" }, { at: 49, status: "running" }, { at: 69, status: "done" }] },
  { id: "coder", parent: "orchestrator", name: "Coder", model: "GPT-6 Sol", task: "Build the page and wire up checkout", tools: ["GitHub", "Stripe", "Figma"], cost: 0.48, spawn: 2, phases: [{ at: 2, status: "running" }, { at: 90, status: "done" }] },
  { id: "tester-1", parent: "coder", name: "Tester", model: "GPT-6 Mini", task: "Write and run the checkout tests", tools: ["GitHub"], cost: 0.04, spawn: 14, phases: [{ at: 14, status: "running" }, { at: 54, status: "failed", error: "2 of 41 checkout tests failed" }] },
  { id: "tester-2", parent: "coder", name: "Tester", model: "GPT-6 Mini", task: "Fix the coupon test and run all again", tools: ["GitHub", "Stripe"], cost: 0.04, spawn: 56, phases: [{ at: 56, status: "running" }, { at: 86, status: "done" }] },
];

const FOLD_AT = 60;
const clamp = (n: number) => Math.min(Math.max(n, 0), 1);

/** The team as it stands `t` seconds into the run: agents that have not arrived yet are not in it */
function teamAt(t: number): TreeAgent {
  const build = (spec: Spec): TreeAgent => {
    const phase = [...spec.phases].reverse().find((p) => p.at <= t)!;
    const last = spec.phases[spec.phases.length - 1];
    const finished = phase.status === "done" || phase.status === "failed";
    return {
      id: spec.id,
      name: spec.name,
      model: spec.model,
      task: spec.task,
      tools: spec.tools,
      status: phase.status,
      ask: phase.ask,
      error: phase.error,
      cost: spec.cost * clamp((t - spec.spawn) / (last.at - spec.spawn)),
      started: BASE + spec.spawn * 1000,
      ended: finished ? BASE + phase.at * 1000 : undefined,
      selectable: false,
      children: SPECS.filter((c) => c.parent === spec.id && c.spawn <= t).map(build),
    };
  };
  return build(SPECS[0]);
}

const LIGHT = { "--xn-at-card": "#ffffff", "--xn-at-raised": "#f4f5f8", "--xn-at-idle": "#f1f2f6", "--xn-at-chip": "#e8e9ef", "--xn-at-border": "#dcdde4", "--xn-at-link": "#5a82d6", "--xn-at-text": "#16171b", "--xn-at-muted": "#6d707a", "--xn-at-task": "#26282e", "--xn-at-icon": "#3b3e48", "--xn-at-accent": "#3f55d8", "--xn-at-warning": "#b8671f", "--xn-at-critical": "#c0392b", "--xn-at-success": "#1e8f5a", "--xn-at-running-bg": "#e4e8fd", "--xn-at-waiting-bg": "#fbead8", "--xn-at-done-bg": "#dff3e8", "--xn-at-failed-bg": "#fbe1de", "--xn-at-waiting-note": "#fdf0e2", "--xn-at-failed-note": "#fde8e5", "--xn-at-waiting-border": "#e3b47c", "--xn-at-failed-border": "#e49a93", "--xn-at-avatar-bg": "#f1f2f6", "--xn-at-tools-bg": "#eef0f5", "--xn-at-menu-border": "#d8dae2", "--xn-at-menu-hover": "#eceef4", "--xn-at-shadow": "rgba(0,0,0,.18)", "--xn-at-hover": "rgba(0,0,0,.03)", "--xn-at-hover-strong": "rgba(0,0,0,.06)", "--xn-at-spin-track": "rgba(63,85,216,.25)", "--xn-at-flare": "rgba(63,85,216,.45)", color: "#16171b" } as React.CSSProperties;

const SPANISH: Partial<AgentTreeProps> = {
  title: "Agentes",
  labels: {
    status: { queued: "En cola", running: "En marcha", waiting: "Te necesita", paused: "En pausa", done: "Hecho", failed: "Falló" },
    agents: (n) => `${n} ${n === 1 ? "agente" : "agentes"}`,
    running: (n) => `${n} en marcha`,
    needYou: (n) => `${n} ${n === 1 ? "te necesita" : "te necesitan"}`,
    failed: (n) => `${n} ${n === 1 ? "falló" : "fallaron"}`,
    subFailed: "Un subagente falló",
    subNeedsYou: "Un subagente te necesita",
    openRun: "Abrir ejecución de ",
    tools: "Herramientas: ",
    cost: "Coste ",
    viewing: "Viendo",
    fold: (folded, n, name) => `${folded ? "Mostrar" : "Ocultar"} ${n} ${n === 1 ? "subagente" : "subagentes"} de ${name}`,
  },
};

/** Marks of your own: a coloured initial for the agent and a plain text chip for each tool */
const customAvatar = (a: TreeAgent) => <span style={{ fontWeight: 800, fontSize: 15, color: a.status === "failed" ? "#f2917e" : "#8fa3ff" }}>{a.name.slice(0, 2)}</span>;
const customTool = (t: string) => <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0 }}>{t.slice(0, 2).toUpperCase()}</span>;

const money = (n: number) => `$${n.toFixed(2)}`;
const btn = { font: "inherit", fontSize: 14, padding: "8px 14px", borderRadius: 10, cursor: "pointer", border: "1px solid #34343a", background: "#232326", color: "#d8d8de" } as const;

function Page() {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [run, setRun] = useState(0);
  const [variant, setVariant] = useState<Variant>("default");
  const [wide, setWide] = useState(false);
  const [bare, setBare] = useState(false);
  const [custom, setCustom] = useState(false);
  const folded = useRef(false);
  const last = useRef(performance.now());

  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - last.current) / 1000;
      last.current = now;
      setT((v) => Math.min(v + dt * SPEED, END));
    }, 200);
    return () => window.clearInterval(id);
  }, [playing, run]);

  // The researcher's branch folds itself once it has been done for a while
  useEffect(() => {
    if (t >= FOLD_AT && !folded.current) {
      folded.current = true;
      setCollapsed((c) => (c.includes("researcher") ? c : [...c, "researcher"]));
    }
  }, [t]);

  const replay = () => {
    folded.current = false;
    setCollapsed([]);
    setT(0);
    setPlaying(true);
    setRun((r) => r + 1);
  };

  return (
    <div style={pageStyle(variant, "#1b1b1e")}>
    <div style={{ maxWidth: 1500, margin: "0 auto" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
        {VARIANTS.map((v) => (
          <button key={v.id} style={pillStyle(variant === v.id)} onClick={() => setVariant(v.id)}>{v.label}</button>
        ))}
        <span style={{ width: 12 }} />
        <button style={pillStyle(wide)} onClick={() => setWide((w) => !w)}>Wider cards</button>
        <button style={pillStyle(bare)} onClick={() => setBare((b) => !b)}>No header, cost or time</button>
        <button style={pillStyle(custom)} onClick={() => setCustom((c) => !c)}>Custom marks</button>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
        <button style={btn} onClick={replay}>↺ Replay</button>
        <button style={btn} onClick={() => setPlaying((p) => !p)} disabled={t >= END}>{playing ? "Pause" : "Resume"}</button>
        <span style={{ marginLeft: 8, fontSize: 14, color: "#8f8f98", fontVariantNumeric: "tabular-nums" }}>
          Run clock {Math.floor(t / 60)}m {String(Math.floor(t % 60)).padStart(2, "0")}s · {SPEED}× speed{t >= END ? " · finished" : ""}
        </span>
      </div>
      <AgentTree
        key={run}
        root={teamAt(t)}
        now={BASE + t * 1000}
        formatCost={money}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        {...(variant === "spanish" ? SPANISH : {})}
        style={variant === "light" ? LIGHT : undefined}
        cardWidth={wide ? 400 : 332}
        showHeader={!bare}
        showCost={!bare}
        showTime={!bare}
        renderAvatar={custom ? customAvatar : undefined}
        renderTool={custom ? customTool : undefined}
      />
    </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Page />);
