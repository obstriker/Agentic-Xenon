import type { Agent } from "../../data";
import { AgentLedger, type LedgerChange } from "../../ui-xenon/agent-ledger";
import { AgentPlan, type PlanStep } from "../../ui-xenon/agent-plan";
import { AgentSteering, type SteerNote, type SteerStep } from "../../ui-xenon/agent-steering";
import type { Run } from "./useSteering";

type Props = {
  agent: Agent;
  steps: PlanStep[];
  onChange: (steps: PlanStep[]) => void;
  changes: LedgerChange[];
  onUndo: (ids: string[]) => void;
  run: Run;
  queue: SteerNote[];
  onQueue: (text: string) => void;
  onInterrupt: (text: string, queuedId?: string) => void;
  onRemove: (id: string) => void;
  onPause: () => void;
  onResume: () => void;
};

/** The plan as the steering card shows it: running or waiting steps are the active one */
const toSteerSteps = (steps: PlanStep[]): SteerStep[] =>
  steps.map((s) => ({
    id: s.id,
    title: s.label,
    status: s.status === "done" ? "done" : s.status === "running" || s.status === "waiting" ? "active" : "pending",
    duration: s.duration,
    startedAt: s.startedAt,
    notes: s.notes,
  }));

export function TasksTab({ agent, steps, onChange, changes, onUndo, run, queue, onQueue, onInterrupt, onRemove, onPause, onResume }: Props) {
  return (
    <div className="planWrap">
      <div className="planCol">
        <AgentPlan goal={agent.desc} steps={steps} onChange={onChange} />
        <AgentLedger agent={agent.name} changes={changes} onUndo={onUndo} />
      </div>
      <AgentSteering
        className="steerSticky"
        title={agent.name}
        agent="Jarvis"
        status={run.status}
        startedAt={run.startedAt}
        finishedAt={run.finishedAt}
        steps={toSteerSteps(steps)}
        queue={queue}
        onQueue={onQueue}
        onInterrupt={onInterrupt}
        onRemove={onRemove}
        onPause={onPause}
        onResume={onResume}
      />
    </div>
  );
}
