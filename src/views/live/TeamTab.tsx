import { agentModels, agents, coordinator, graphLinks, graphTools, subAgents, usd, type Agent } from "../../data";
import { AgentTree, type TreeAgent, type TreeStatus } from "../../ui-xenon/agent-tree";
import type { PlanStep } from "../../ui-xenon/agent-plan";
import { costOf, summarizeRun } from "./plan";
import type { Run } from "./useSteering";

const money = new Intl.NumberFormat("en-US", usd);
const formatMoney = (n: number) => money.format(n);

type Props = {
  agent: Agent;
  plans: Record<string, PlanStep[]>;
  runs: Record<string, Run>;
  /** A card was tapped: the agent it belongs to becomes the chosen one */
  onChoose: (index: number) => void;
};

/** Gap between an agent starting and handing work to each next sub-agent – sample */
const HANDOFF_MS = 12_000;
/** How long a finished sub-agent worked while its agent is still going – sample */
const SUB_RUN_MS = 45_000;

const toolsOf = (a: Agent) => graphLinks.filter((l) => l.agent === a.name).map((l) => graphTools.find((t) => t.id === l.tool)!.label);

/** The team as the tree shows it: Jarvis, the research agents under it, and the sub-agents they handed work to */
function buildTeam(plans: Record<string, PlanStep[]>, runs: Record<string, Run>): TreeAgent {
  const children = agents.map((a): TreeAgent => {
    const steps = plans[a.name];
    const run = runs[a.name];
    const summary = summarizeRun(steps, run);
    const status: TreeStatus = summary.status === "empty" ? "queued" : summary.status;
    const ended = status === "done" ? run.finishedAt : status === "paused" ? run.pausedAt : undefined;

    // Sub-agents are sample detail: they follow their agent's run and don't open a run of their own
    const subs = (subAgents[a.name] ?? []).map((s, i): TreeAgent => {
      const subStatus: TreeStatus = status === "done" ? "done" : s.status === "running" && status === "paused" ? "paused" : s.status;
      const started = subStatus === "queued" ? undefined : run.startedAt + (i + 1) * HANDOFF_MS;
      const subEnded = started === undefined ? undefined : subStatus === "done" ? (run.finishedAt ?? started + SUB_RUN_MS) : subStatus === "paused" ? run.pausedAt : undefined;
      return { id: `${a.name}/${s.name}`, name: s.name, model: s.model, task: s.task, tools: s.tools, status: subStatus, cost: s.cost, ask: s.ask, started, ended: subEnded, selectable: false };
    });
    const subCost = subs.reduce((sum, s) => sum + (s.cost ?? 0), 0);

    return {
      id: a.name,
      name: a.name,
      model: agentModels[a.name],
      // What it is doing now; a finished or idle run says what it is for
      task: summary.currentStep?.label ?? a.desc,
      tools: toolsOf(a),
      status,
      ask: status === "waiting" || (status === "paused" && summary.currentStep?.status === "waiting") ? a.step : undefined,
      // costOf is the agent's whole spend and the tree adds the sub-agents on top, so take them off here
      cost: Math.max(costOf(a, steps) - subCost, 0),
      started: run.startedAt,
      ended,
      children: subs,
    };
  });

  // The coordinator mirrors its agents: anything failed first, then anything running, waiting or paused, done only when all are
  const has = (s: TreeStatus) => children.some((c) => c.status === s);
  const status: TreeStatus = has("failed")
    ? "failed"
    : has("running")
      ? "running"
      : has("waiting")
        ? "waiting"
        : has("paused")
          ? "paused"
          : children.length > 0 && children.every((c) => c.status === "done")
            ? "done"
            : "queued";

  return {
    id: "jarvis",
    name: coordinator.name,
    model: coordinator.model,
    task: coordinator.task,
    tools: coordinator.tools,
    status,
    cost: coordinator.cost,
    selectable: false,
    children,
  };
}

export function TeamTab({ agent, plans, runs, onChoose }: Props) {
  return (
    <div className="tabBody tabBody--wide">
      <AgentTree
        title="Team"
        root={buildTeam(plans, runs)}
        selected={agent.name}
        formatCost={formatMoney}
        onSelect={(node) => {
          const index = agents.findIndex((a) => a.name === node.id);
          if (index >= 0) onChoose(index);
        }}
      />
    </div>
  );
}
