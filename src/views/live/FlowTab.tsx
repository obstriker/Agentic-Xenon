import { useMemo, useState } from "react";
import { usd } from "../../data";
import type { Agent, HumanRequest } from "../../../shared/contract";
import { useBackend } from "../../api/backend";
import { CliIcon } from "../../CliIcon";
import { StatusPill } from "../../StatusPill";
import { Button } from "../../ui/button";
import { NumberTicker } from "../../ui/number-ticker";
import { ToolCallCard, ToolCallGroup } from "../../ui/tool-call-card";
import { AgentFlow, type FlowAgent, type FlowStep, type FlowStepStatus } from "../../ui-xenon/agent-flow";
import { DecisionTree } from "../../ui-xenon/decision-tree";
import type { PlanStatus, PlanStep } from "../../ui-xenon/agent-plan";
import { decisionTrees } from "../needs-trees";
import { costOf, progressOf } from "./plan";

type TreeRequest = Extract<HumanRequest, { type: "tree" }>;

type Props = {
  agent: Agent;
  plans: Record<string, PlanStep[]>;
  /** An agent was picked in the switcher */
  onChoose: (index: number) => void;
  onOpenPlan: () => void;
  onNeeds: () => void;
};

const STEP_STATUS: Record<PlanStatus, FlowStepStatus> = { done: "done", running: "active", waiting: "waiting", failed: "failed", queued: "pending" } as Record<PlanStatus, FlowStepStatus>;

/**
 * The agent's decision flow: where it is, which steps it has been through, what it is on now and what is still to come.
 * Agents that report no plan show the one thing they are doing, so there is always a place to read their status.
 */
export function FlowTab({ agent, plans, onChoose, onOpenPlan, onNeeds }: Props) {
  const { agents, requests, answer, steering } = useBackend();
  const run = steering.runs[agent.name];

  // A decision this agent is waiting on: its options show on the waiting step, and "Respond" opens them to answer
  const ask = useMemo(() => requests.find((r): r is TreeRequest => r.type === "tree" && r.agent === agent.name && !r.answer), [requests, agent.name]);
  const tree = ask ? (decisionTrees.find((t) => t.id === ask.tree.id) ?? ask.tree) : undefined;
  const [open, setOpen] = useState(false);

  const plan = plans[agent.name] ?? [];
  const steps = useMemo<FlowStep[]>(() => {
    if (plan.length > 0) {
      return plan.map((s) => ({
        id: s.id,
        title: s.label,
        status: STEP_STATUS[s.status] ?? "pending",
        detail: s.detail,
        tool: s.tool,
        duration: s.duration,
        startedAt: s.startedAt,
        error: s.error,
        ask: s.status === "waiting" ? agent.step : undefined,
        notes: s.notes?.map((n) => ({ id: n.id, text: n.text, picked: n.picked })),
      }));
    }
    const status: FlowStepStatus = agent.status === "done" ? "done" : agent.status === "waiting" ? "waiting" : "active";
    return [{ id: "now", title: agent.step || agent.desc, status, startedAt: status === "active" ? run?.startedAt : undefined, ask: status === "waiting" ? agent.step : undefined }];
  }, [plan, agent.step, agent.desc, agent.status, run?.startedAt]);

  const current = steps.find((s) => s.status === "active" || s.status === "waiting" || s.status === "failed");
  const flowAgent: FlowAgent = {
    name: agent.name,
    model: agent.model,
    task: current?.title ?? agent.step ?? agent.desc,
    details: agent.desc && agent.desc !== (current?.title ?? agent.step) ? agent.desc : undefined,
    status: run?.status === "paused" ? "paused" : agent.status,
    progress: progressOf(agent, plan),
    cost: costOf(agent, plan),
  };

  return (
    <div className="twoPane">
      <div className="panel flowPanel">
        <AgentFlow
          agent={flowAgent}
          steps={steps}
          title="Decision flow"
          icon={agent.kind ? <CliIcon kind={agent.kind} state={agent.status === "waiting" ? "waiting" : agent.status === "working" ? "working" : "done"} size={26} /> : undefined}
          decision={tree ? { question: tree.question, options: tree.options.filter((o) => !o.other).map((o) => ({ id: o.id, label: o.label, agentPick: o.agentPick })) } : undefined}
          onRespond={() => (ask ? setOpen(true) : onNeeds())}
          formatCost={(n) => new Intl.NumberFormat("en-US", usd).format(n)}
          headerRight={
            <div className="flowSwitch" role="group" aria-label="Agent">
              {agents.map((a, i) => (
                <button key={a.id} ref={(el) => { if (el && a.id === agent.id) el.scrollIntoView?.({ inline: "nearest", block: "nearest" }); }} type="button" className="flowChip" data-state={a.status} aria-pressed={a.id === agent.id} onClick={() => onChoose(i)} title={a.name}>
                  <i aria-hidden="true" />
                  {a.name}
                </button>
              ))}
            </div>
          }
        />
        {open && tree && ask && (
          <div className="flowDecision" role="dialog" aria-label="Decision">
            <button type="button" className="flowDecisionClose" aria-label="Hide the decision" onClick={() => setOpen(false)}>
              ×
            </button>
            <DecisionTree
              compact
              decisions={[tree]}
              onResolve={(a) => {
                const reply = a.choice ? `${a.option.label} → ${a.choice.title}` : a.option.label;
                // let the tree show "Approved · running" before the answer goes in and the panel closes
                setTimeout(() => {
                  answer(ask.id, reply);
                  setOpen(false);
                }, 1100);
              }}
            />
          </div>
        )}
      </div>

      <aside className="panel inspector" aria-live="polite">
        <AgentInspector key={agent.name} agent={agent} steps={plan} onOpenPlan={onOpenPlan} onRespond={ask ? () => setOpen(true) : onNeeds} />
      </aside>
    </div>
  );
}

function AgentInspector({ agent, steps, onOpenPlan, onRespond }: { agent: Agent; steps: PlanStep[]; onOpenPlan: () => void; onRespond: () => void }) {
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
          <Button size="lg" onClick={onRespond} iconRight={<span aria-hidden="true">↗</span>}>
            Respond
          </Button>
        )}
      </div>
    </>
  );
}
