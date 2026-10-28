import { useEffect, useRef, useState } from "react";
import { agents } from "../../data";
import type { PlanStep } from "../../ui-xenon/agent-plan";
import type { SteerNote } from "../../ui-xenon/agent-steering";
import { stepMs } from "./plan";

/** What the app holds for the runs: queued notes, run state, and the actions on them */
export interface Steering {
  queues: Record<string, SteerNote[]>;
  runs: Record<string, Run>;
  queue: (agent: string, text: string) => void;
  remove: (agent: string, id: string) => void;
  /** `queuedId` promotes a queued note instead of sending a new one */
  interrupt: (agent: string, text: string, queuedId?: string) => void;
  pause: (agent: string) => void;
  resume: (agent: string) => void;
}
type PatchPlan = (agent: string, change: (steps: PlanStep[]) => PlanStep[]) => void;

export type Run = { status: "running" | "paused" | "done"; startedAt: number; pausedAt?: number; finishedAt?: number };

/** The step an interrupt lands on: the one in progress, else the last finished one */
const landingIndex = (steps: PlanStep[]) => {
  const active = steps.findIndex((s) => s.status === "running" || s.status === "waiting");
  if (active >= 0) return active;
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i].status === "done") return i;
  return 0;
};

/**
 * The runs behind the plans: agents work through their steps on their own, queued notes land on the step
 * that starts next ("Picked up"), interrupts land on the step in progress at once ("Interrupted"),
 * and a run can be paused. Lives at the top of the app so runs keep going while you look elsewhere.
 */
export function useSteering(plans: Record<string, PlanStep[]>, patchPlan: PatchPlan): Steering {
  const [queues, setQueues] = useState<Record<string, SteerNote[]>>({});
  const [runs, setRuns] = useState<Record<string, Run>>(() =>
    Object.fromEntries(agents.map((a) => [a.name, { status: "running", startedAt: Date.now() - (90_000 + a.progress * 1500) } satisfies Run])),
  );
  const seq = useRef(0);

  // The clock below reads the latest state without restarting every render
  const latest = useRef({ plans, queues, runs });
  latest.current = { plans, queues, runs };

  useEffect(() => {
    const id = window.setInterval(() => {
      const { plans, queues, runs } = latest.current;
      const t = Date.now();
      for (const a of agents) {
        if (runs[a.name].status !== "running") continue;
        const steps = plans[a.name];
        const at = steps.findIndex((s) => s.status === "running");
        const step = steps[at];
        if (!step || step.startedAt === undefined || t - step.startedAt < stepMs(step.label)) continue;

        const next = steps.findIndex((s, j) => j > at && s.status === "queued");
        const notes = (queues[a.name] ?? []).map((n) => ({ ...n, picked: "next" as const }));
        patchPlan(a.name, (all) =>
          all.map((s, j) => {
            if (j === at) return { ...s, status: "done", duration: t - (s.startedAt ?? t), startedAt: undefined };
            if (j === next) return { ...s, status: "running", startedAt: t, notes: [...(s.notes ?? []), ...notes] };
            return s;
          }),
        );
        if (next >= 0) setQueues((q) => ({ ...q, [a.name]: [] }));
        else setRuns((r) => ({ ...r, [a.name]: { ...r[a.name], status: "done", finishedAt: t } }));
      }
    }, 500);
    return () => window.clearInterval(id);
    // patchPlan only calls setState, so the first one is good for the life of the app
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queue = (agent: string, text: string) => setQueues((q) => ({ ...q, [agent]: [...(q[agent] ?? []), { id: `note-${++seq.current}`, text }] }));

  const remove = (agent: string, id: string) => setQueues((q) => ({ ...q, [agent]: (q[agent] ?? []).filter((n) => n.id !== id) }));

  /** `queuedId` promotes a queued note instead of sending a new one */
  const interrupt = (agent: string, text: string, queuedId?: string) => {
    if (queuedId) remove(agent, queuedId);
    const note = { id: queuedId ?? `note-${++seq.current}`, text, picked: "now" as const };
    patchPlan(agent, (steps) => {
      const at = landingIndex(steps);
      return steps.map((s, i) => (i === at ? { ...s, notes: [...(s.notes ?? []), note] } : s));
    });
  };

  const pause = (agent: string) => {
    const at = Date.now();
    setRuns((r) => ({ ...r, [agent]: { ...r[agent], status: "paused", pausedAt: at } }));
    patchPlan(agent, (steps) => steps.map((s) => (s.status === "running" ? { ...s, pausedAt: at } : s)));
  };

  // Time spent paused doesn't count: every clock moves forward by the pause
  const resume = (agent: string) => {
    const gap = Date.now() - (runs[agent].pausedAt ?? Date.now());
    setRuns((r) => ({ ...r, [agent]: { status: "running", startedAt: r[agent].startedAt + gap } }));
    patchPlan(agent, (steps) => steps.map((s) => (s.pausedAt !== undefined ? { ...s, startedAt: (s.startedAt ?? s.pausedAt) + gap, pausedAt: undefined } : s)));
  };

  return { queues, runs, queue, remove, interrupt, pause, resume };
}
