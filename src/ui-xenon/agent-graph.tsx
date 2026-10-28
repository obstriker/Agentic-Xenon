"use client";

import { useState, type KeyboardEvent } from "react";

/*
 * Agent Graph – agents and the tools they call as a living network, in a single self-contained file.
 * Original Xenon component, written from the public one-line description of the affectUI Pro "Agent Graph".
 * It is not affectUI code. The styles are injected below, so no extra files are needed.
 *
 * A pulse runs along a link for every call and a fainter one back for the answer, busy links are thicker,
 * working agents breathe, and agents that need you turn amber.
 */

export type GraphAgentState = "working" | "waiting" | "idle";

export type GraphAgent = { id: string; label: string; state: GraphAgentState };
export type GraphTool = { id: string; label: string };
/** load: 0 = quiet, 1 = saturated */
export type GraphLink = { agent: string; tool: string; load: number };

export type AgentGraphProps = {
  hub: string;
  agents: GraphAgent[];
  tools: GraphTool[];
  links: GraphLink[];
  /** Selected node: an agent or tool id, or "hub". Pass it to control the selection; leave it out and taps toggle a highlight */
  selected?: string | null;
  /** Called with the tapped node's id when the selection is controlled */
  onSelect?: (id: string) => void;
  className?: string;
};

const VIEW_W = 1160;
const VIEW_H = 520;
const HUB = { x: 40, w: 190, h: 70 };
const AGENT = { x: 420, w: 220, h: 56 };
const TOOL = { x: 930, w: 190, h: 50 };
const PAD_Y = 52;

const spread = (count: number, i: number) => (count === 1 ? VIEW_H / 2 : PAD_Y + (i * (VIEW_H - PAD_Y * 2)) / (count - 1));

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
};

const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Edge = { key: string; from: string; to: string; d: string; load: number; busy: boolean };

export function AgentGraph({ hub, agents, tools, links, selected, onSelect, className }: AgentGraphProps) {
  const [inner, setInner] = useState<string | null>(null);
  const controlled = selected !== undefined;
  const focus = controlled ? selected : inner;

  const hubY = VIEW_H / 2;
  const agentY = new Map(agents.map((a, i) => [a.id, spread(agents.length, i)]));
  const toolY = new Map(tools.map((t, i) => [t.id, spread(tools.length, i)]));

  const edges: Edge[] = [
    ...agents.map((a) => ({
      key: `hub-${a.id}`,
      from: "hub",
      to: a.id,
      d: curve(HUB.x + HUB.w, hubY, AGENT.x, agentY.get(a.id)!),
      load: a.state === "working" ? 0.55 : a.state === "waiting" ? 0.12 : 0,
      busy: a.state !== "idle",
    })),
    ...links.flatMap((l) => {
      const ay = agentY.get(l.agent);
      const ty = toolY.get(l.tool);
      if (ay === undefined || ty === undefined) return [];
      const state = agents.find((a) => a.id === l.agent)?.state;
      return [
        {
          key: `${l.agent}-${l.tool}`,
          from: l.agent,
          to: l.tool,
          d: curve(AGENT.x + AGENT.w, ay, TOOL.x, ty),
          load: state === "idle" ? 0 : l.load,
          busy: state !== "idle" && l.load > 0,
        },
      ];
    }),
  ];

  // Selecting a node lights its own links and dims the rest
  const linked = (e: Edge) => !focus || e.from === focus || e.to === focus;
  const toggle = (id: string) => (controlled ? onSelect?.(id) : setInner((f) => (f === id ? null : id)));
  const nodeKey = (e: KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(id);
    }
  };

  return (
    <>
      <style href="xn-agent-graph" precedence="default">
        {css}
      </style>
      <div className={["xn-ag", className].filter(Boolean).join(" ")}>
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="group" aria-label="Agents and the tools they call">
          <g className="xn-ag__links">
            {edges.map((e, i) => (
              <g key={e.key} className="xn-ag__link" data-dim={!linked(e) || undefined} data-busy={e.busy || undefined}>
                <path d={e.d} className="xn-ag__line" style={{ strokeWidth: 1.5 + e.load * 4 }} />
                {e.busy && !reduced && (
                  <>
                    <circle r={3 + e.load * 2} className="xn-ag__pulse">
                      <animateMotion dur={`${(3.4 - e.load * 2.4).toFixed(2)}s`} begin={`-${((i * 0.37) % 3).toFixed(2)}s`} repeatCount="indefinite" path={e.d} calcMode="linear" />
                    </circle>
                    <circle r="2.5" className="xn-ag__pulse xn-ag__pulse--answer">
                      <animateMotion
                        dur={`${(4.2 - e.load * 2.4).toFixed(2)}s`}
                        begin={`-${((i * 0.53 + 1.1) % 3).toFixed(2)}s`}
                        repeatCount="indefinite"
                        path={e.d}
                        keyPoints="1;0"
                        keyTimes="0;1"
                        calcMode="linear"
                      />
                    </circle>
                  </>
                )}
              </g>
            ))}
          </g>

          <g
            className="xn-ag__node xn-ag__node--hub"
            data-dim={(focus && focus !== "hub") || undefined}
            tabIndex={0}
            role="button"
            aria-pressed={focus === "hub"}
            aria-label={hub}
            onClick={() => toggle("hub")}
            onKeyDown={(e) => nodeKey(e, "hub")}
          >
            <rect x={HUB.x} y={hubY - HUB.h / 2} width={HUB.w} height={HUB.h} rx="16" />
            <text x={HUB.x + HUB.w / 2} y={hubY + 6} textAnchor="middle">
              {hub}
            </text>
          </g>

          {agents.map((a) => {
            const y = agentY.get(a.id)!;
            const related = !focus || focus === a.id || links.some((l) => l.agent === a.id && l.tool === focus) || focus === "hub";
            return (
              <g
                key={a.id}
                className="xn-ag__node xn-ag__node--agent"
                data-state={a.state}
                data-dim={!related || undefined}
                tabIndex={0}
                role="button"
                aria-pressed={focus === a.id}
                aria-label={`${a.label}, ${a.state === "waiting" ? "needs you" : a.state}`}
                onClick={() => toggle(a.id)}
                onKeyDown={(e) => nodeKey(e, a.id)}
              >
                <rect className="xn-ag__halo" x={AGENT.x} y={y - AGENT.h / 2} width={AGENT.w} height={AGENT.h} rx="14" />
                <rect className="xn-ag__body" x={AGENT.x} y={y - AGENT.h / 2} width={AGENT.w} height={AGENT.h} rx="14" />
                <circle className="xn-ag__dot" cx={AGENT.x + 22} cy={y} r="5" />
                <text x={AGENT.x + 38} y={y + 6}>
                  {a.label}
                </text>
              </g>
            );
          })}

          {tools.map((t) => {
            const y = toolY.get(t.id)!;
            const related = !focus || focus === t.id || links.some((l) => l.tool === t.id && l.agent === focus);
            return (
              <g
                key={t.id}
                className="xn-ag__node xn-ag__node--tool"
                data-dim={!related || undefined}
                tabIndex={0}
                role="button"
                aria-pressed={focus === t.id}
                aria-label={t.label}
                onClick={() => toggle(t.id)}
                onKeyDown={(e) => nodeKey(e, t.id)}
              >
                <rect x={TOOL.x} y={y - TOOL.h / 2} width={TOOL.w} height={TOOL.h} rx="12" />
                <text x={TOOL.x + TOOL.w / 2} y={y + 5} textAnchor="middle">
                  {t.label}
                </text>
              </g>
            );
          })}
        </svg>

        <ul className="xn-ag__legend" aria-label="Legend">
          <li>
            <i data-k="working" />
            Working
          </li>
          <li>
            <i data-k="waiting" />
            Needs you
          </li>
          <li>
            <i data-k="idle" />
            Idle
          </li>
          <li>Pulse = a call and its answer · thicker link = busier</li>
        </ul>
      </div>
    </>
  );
}

const css = /* css */ `
.xn-ag {
  --xn-ag-line: #4c6a8f;
  --xn-ag-ink: #f0f5fc;
  --xn-ag-node: #1c3046;
  --xn-ag-edge: #627d9f;
  --xn-ag-work: #91e1bb;
  --xn-ag-wait: #ffcd84;
  --xn-ag-pulse: #bfe3ff;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--xn-ag-ink);
}
.xn-ag svg { flex: 1; min-height: 0; width: 100%; }

.xn-ag__link { transition: opacity 280ms ease; }
.xn-ag__line { fill: none; stroke: var(--xn-ag-line); stroke-linecap: round; opacity: 0.55; transition: stroke-width 600ms ease; }
.xn-ag__link[data-busy] .xn-ag__line { opacity: 0.9; }
.xn-ag__pulse { fill: var(--xn-ag-pulse); filter: drop-shadow(0 0 4px var(--xn-ag-pulse)); }
.xn-ag__pulse--answer { fill: var(--xn-ag-work); opacity: 0.6; filter: none; }
.xn-ag__link[data-dim], .xn-ag__node[data-dim] { opacity: 0.32; }

.xn-ag__node { cursor: pointer; transition: opacity 280ms ease; }
.xn-ag__node:focus { outline: none; }
.xn-ag__node:focus-visible rect:not(.xn-ag__halo) { stroke: #fff; stroke-width: 3; }
.xn-ag__node rect { fill: var(--xn-ag-node); stroke: var(--xn-ag-edge); stroke-width: 2; }
.xn-ag__node text { fill: var(--xn-ag-ink); font-size: 17px; font-weight: 650; pointer-events: none; }
.xn-ag__node--tool rect { fill: #14212f; stroke-dasharray: 5 5; }
.xn-ag__node--tool text { font-size: 15px; font-weight: 600; fill: #c5d5e5; }
.xn-ag__node--hub rect { fill: #284668; stroke: #b8ddff; stroke-width: 2.5; }
.xn-ag__node[aria-pressed="true"] rect:not(.xn-ag__halo) { stroke: #fff; stroke-width: 3; }

/* Agents breathe while they work; one that needs you turns amber and pulses harder */
.xn-ag__halo { fill: none !important; stroke-width: 0 !important; transform-box: fill-box; transform-origin: center; }
.xn-ag__node--agent[data-state="working"] .xn-ag__halo { stroke: var(--xn-ag-work) !important; stroke-width: 2 !important; animation: xn-ag-breathe 3.2s ease-in-out infinite; }
.xn-ag__node--agent[data-state="waiting"] .xn-ag__halo { stroke: var(--xn-ag-wait) !important; stroke-width: 2.5 !important; animation: xn-ag-breathe 1.8s ease-in-out infinite; }
.xn-ag__node--agent[data-state="waiting"] .xn-ag__body { stroke: var(--xn-ag-wait); fill: #3a3126; }
.xn-ag__node--agent[data-state="idle"] { opacity: 0.7; }
.xn-ag__dot { fill: #7d90a8; }
.xn-ag__node--agent[data-state="working"] .xn-ag__dot { fill: var(--xn-ag-work); }
.xn-ag__node--agent[data-state="waiting"] .xn-ag__dot { fill: var(--xn-ag-wait); }

.xn-ag__legend { display: flex; flex-wrap: wrap; gap: 6px 20px; margin: 0; padding: 10px 20px 14px; list-style: none; font-size: 14px; color: #b2c7dc; }
.xn-ag__legend li { display: inline-flex; align-items: center; gap: 8px; }
.xn-ag__legend i { width: 10px; height: 10px; border-radius: 50%; background: #7d90a8; }
.xn-ag__legend i[data-k="working"] { background: var(--xn-ag-work); }
.xn-ag__legend i[data-k="waiting"] { background: var(--xn-ag-wait); }

@keyframes xn-ag-breathe {
  0%, 100% { transform: scale(1); opacity: 0.1; }
  50% { transform: scale(1.09, 1.28); opacity: 0.75; }
}

@media (prefers-reduced-motion: reduce) {
  .xn-ag__node--agent .xn-ag__halo { animation: none !important; opacity: 0.4; }
}
`;
