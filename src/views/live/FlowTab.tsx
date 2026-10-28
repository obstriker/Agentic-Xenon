import { useEffect, useState } from "react";
import { graphLinks, graphTools, usd } from "../../data";
import type { Agent } from "../../../shared/contract";
import { useBackend } from "../../api/backend";
import { StatusPill } from "../../StatusPill";
import { Button } from "../../ui/button";
import { GridBackground } from "../../ui/grid-background";
import { NumberTicker } from "../../ui/number-ticker";
import { ToolCallCard, ToolCallGroup } from "../../ui/tool-call-card";
import { AgentGraph } from "../../ui-xenon/agent-graph";
import type { PlanStep } from "../../ui-xenon/agent-plan";
import { costOf, progressOf } from "./plan";

const HUB = "hub";

type Props = {
  agent: Agent;
  plans: Record<string, PlanStep[]>;
  /** An agent node was tapped */
  onChoose: (index: number) => void;
  onOpenPlan: () => void;
  onNeeds: () => void;
};

export function FlowTab({ agent, plans, onChoose, onOpenPlan, onNeeds }: Props) {
  const { agents } = useBackend();
  // The selected node: the chosen agent, the coordinator, or a tool
  const [sel, setSel] = useState(agent.name);
  useEffect(() => setSel(agent.name), [agent.name]);

  const waiting = agents.filter((a) => a.status === "waiting").length;
  const working = agents.filter((a) => a.status === "working").length;
  const tool = graphTools.find((t) => t.id === sel);

  const select = (id: string) => {
    setSel(id);
    const index = agents.findIndex((a) => a.name === id);
    if (index >= 0) onChoose(index);
  };

  return (
    <div className="twoPane">
      <GridBackground className="panel graphPanel" size={44} speed={8} fade={85} reveal={false}>
        <div className="graphLabel">LIVE NETWORK · EVERY PULSE IS A TOOL CALL</div>
        <span className="liveBadge">
          ● {working} working · {agents.length - working - waiting} idle · {waiting} need you
        </span>
        <AgentGraph
          hub="Jarvis"
          agents={agents.map((a) => ({ id: a.name, label: a.name, state: a.status === "waiting" ? "waiting" : "working" }))}
          tools={graphTools}
          links={graphLinks}
          selected={sel}
          onSelect={select}
        />
      </GridBackground>

      <aside className="panel inspector" aria-live="polite">
        {sel === HUB ? (
          <HubInspector waiting={waiting} plans={plans} onNeeds={onNeeds} />
        ) : tool ? (
          <ToolInspector id={tool.id} label={tool.label} onSelectAgent={select} />
        ) : (
          <AgentInspector key={agent.name} agent={agent} steps={plans[agent.name]} onOpenPlan={onOpenPlan} onNeeds={onNeeds} />
        )}
      </aside>
    </div>
  );
}

function AgentInspector({ agent, steps, onOpenPlan, onNeeds }: { agent: Agent; steps: PlanStep[]; onOpenPlan: () => void; onNeeds: () => void }) {
  const waiting = agent.status === "waiting";
  const calls = steps.filter((s) => s.status !== "queued");
  const done = steps.filter((s) => s.status === "done").length;

  return (
    <>
      <div className="inspectorBody">
        <div className="eyebrow">AGENT</div>
        <h2>{agent.name}</h2>
        <StatusPill status={agent.status} label={agent.status === "waiting" ? "NEEDS YOU" : agent.status === "done" ? (steps.length ? "COMPLETE" : "IDLE") : "IN PROGRESS"} />
        <p>{agent.desc}</p>
        <div className="metric">
          <span>Active task</span>
          <b>{agent.step}</b>
        </div>
        <div className="metric">
          <span>Progress</span>
          <b>
            <NumberTicker value={progressOf(agent, steps)} />%
          </b>
        </div>
        <div className="metric">
          <span>Run cost</span>
          <b>
            <NumberTicker value={costOf(agent, steps)} format={usd} />
          </b>
        </div>
        <div className="metric">
          <span>Steps done</span>
          <b>
            {done} / {steps.length}
          </b>
        </div>
        {calls.length > 0 && (
          <ToolCallGroup label={`Used ${calls.length} ${calls.length === 1 ? "tool" : "tools"}`} defaultOpen>
            {calls.map((s, i) => (
              <ToolCallCard
                key={s.id}
                name={s.tool ?? "step"}
                summary={s.status === "waiting" ? `${s.label} · waiting for you` : s.label}
                status={s.status === "done" ? "success" : s.status === "failed" ? "error" : "running"}
                args={{ task: s.label, ...(s.detail ? { detail: s.detail } : {}) }}
                result={s.status === "done" ? { status: "completed" } : undefined}
                error={s.error}
                duration={s.status === "done" ? s.duration : undefined}
                startedAt={s.status === "running" ? s.startedAt : undefined}
                defaultOpen={i === calls.length - 1}
              />
            ))}
          </ToolCallGroup>
        )}
      </div>
      <div className="inspectorActions">
        <Button variant="secondary" size="lg" onClick={onOpenPlan}>
          {waiting ? "Open plan" : "Open plan & steer"}
        </Button>
        {waiting && (
          <Button size="lg" onClick={onNeeds} iconRight={<span aria-hidden="true">↗</span>}>
            Respond
          </Button>
        )}
      </div>
    </>
  );
}

function ToolInspector({ id, label, onSelectAgent }: { id: string; label: string; onSelectAgent: (name: string) => void }) {
  const callers = graphLinks.filter((l) => l.tool === id).sort((a, b) => b.load - a.load);

  return (
    <div className="inspectorBody">
      <div className="eyebrow">TOOL</div>
      <h2>{label}</h2>
      <p>
        Called by {callers.length} {callers.length === 1 ? "agent" : "agents"}. Thicker links in the network are busier ones.
      </p>
      <div className="callers">
        {callers.map((c) => (
          <button key={c.agent} type="button" className="caller" onClick={() => onSelectAgent(c.agent)}>
            <span className="callerName">{c.agent}</span>
            <span className="callerBar" aria-hidden="true">
              <i style={{ width: `${Math.round(c.load * 100)}%` }} />
            </span>
            <span className="callerLoad">{Math.round(c.load * 100)}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function HubInspector({ waiting, plans, onNeeds }: { waiting: number; plans: Record<string, PlanStep[]>; onNeeds: () => void }) {
  const { agents } = useBackend();
  const spend = agents.reduce((sum, a) => sum + costOf(a, plans[a.name]), 0);

  return (
    <>
      <div className="inspectorBody">
        <div className="eyebrow">COORDINATOR</div>
        <h2>Jarvis</h2>
        <p>Plans the missions and hands work to the agents around it.</p>
        <div className="metric">
          <span>Agents</span>
          <b>{agents.length}</b>
        </div>
        <div className="metric">
          <span>Working</span>
          <b>{agents.length - waiting}</b>
        </div>
        <div className="metric">
          <span>Need you</span>
          <b>{waiting}</b>
        </div>
        <div className="metric">
          <span>Spend, all agents</span>
          <b>
            <NumberTicker value={spend} format={usd} />
          </b>
        </div>
      </div>
      {waiting > 0 && (
        <div className="inspectorActions">
          <Button size="lg" onClick={onNeeds} iconRight={<span aria-hidden="true">↗</span>}>
            Human decisions
          </Button>
        </div>
      )}
    </>
  );
}
