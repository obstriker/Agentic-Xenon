import { useState } from "react";
import { ledgerSeed, type Agent } from "../data";
import { StatusPill } from "../StatusPill";
import { Button } from "../ui/button";
import { SegmentedControl, type SegmentOption } from "../ui/segmented-control";
import type { PlanStep } from "../ui-xenon/agent-plan";
import { FindingsTab } from "./live/FindingsTab";
import { FlowTab } from "./live/FlowTab";
import { StateTab } from "./live/StateTab";
import { TasksTab } from "./live/TasksTab";
import { TeamTab } from "./live/TeamTab";
import { statusOf } from "./live/plan";

import type { Steering } from "./live/useSteering";

type Tab = "flow" | "tasks" | "team" | "findings" | "state";

const TABS: SegmentOption<Tab>[] = [
  { value: "flow", label: "Live flow" },
  { value: "tasks", label: "Tasks" },
  { value: "team", label: "Team" },
  { value: "findings", label: "Findings" },
  { value: "state", label: "State" },
];

type Props = {
  active: boolean;
  agent: Agent;
  plans: Record<string, PlanStep[]>;
  patchPlan: (name: string, change: (steps: PlanStep[]) => PlanStep[]) => void;
  onChoose: (index: number) => void;
  onNeeds: () => void;
  onBack: () => void;
  steering: Steering;
};

export function Live({ active, agent, plans, patchPlan, steering, onChoose, onNeeds, onBack }: Props) {
  const [tab, setTab] = useState<Tab>("flow");
  // What each agent changed in your systems; an undo marks every change it takes with it
  const [ledgers, setLedgers] = useState(ledgerSeed);
  const undoChanges = (name: string, ids: string[]) =>
    setLedgers((l) => ({ ...l, [name]: l[name].map((c) => (ids.includes(c.id) ? { ...c, undone: true } : c)) }));

  const steps = plans[agent.name];
  const status = statusOf(agent, steps);

  return (
    <section className={`view screen${active ? " active" : ""}`}>
      <div className="screenTop">
        <Button variant="secondary" size="lg" onClick={onBack} icon={<span aria-hidden="true">←</span>}>
          Command
        </Button>
        <h1>{agent.name}</h1>
        <StatusPill status={status} label={status === "waiting" ? "NEEDS YOU" : status === "done" ? "COMPLETE" : "LIVE"} />
        <div className="stretch" />
        <SegmentedControl<Tab> aria-label="Run view" kind="tabs" size="lg" options={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === "flow" && <FlowTab agent={agent} plans={plans} onChoose={onChoose} onOpenPlan={() => setTab("tasks")} onNeeds={onNeeds} />}
      {tab === "tasks" && (
        <TasksTab
          agent={agent}
          steps={steps}
          onChange={(next) => patchPlan(agent.name, () => next)}
          changes={ledgers[agent.name]}
          onUndo={(ids) => undoChanges(agent.name, ids)}
          run={steering.runs[agent.name]}
          queue={steering.queues[agent.name] ?? []}
          onQueue={(text) => steering.queue(agent.name, text)}
          onInterrupt={(text, queuedId) => steering.interrupt(agent.name, text, queuedId)}
          onRemove={(id) => steering.remove(agent.name, id)}
          onPause={() => steering.pause(agent.name)}
          onResume={() => steering.resume(agent.name)}
        />
      )}
      {tab === "team" && <TeamTab agent={agent} plans={plans} runs={steering.runs} onChoose={onChoose} />}
      {tab === "findings" && <FindingsTab agent={agent} />}
      {tab === "state" && <StateTab agent={agent} steps={steps} onNeeds={onNeeds} />}
    </section>
  );
}
