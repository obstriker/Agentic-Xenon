import type { Agent, AgentStatus } from "../../../shared/contract";
import type { PlanStep } from "../../ui-xenon/agent-plan";
import type { Run } from "./useSteering";

/** Preview only: scales step time so a short demo shows tasks finishing (1 = real pace) */
export const demo = { speed: 1 };

export const doneSteps = (steps: PlanStep[]) => steps.filter((s) => s.status === "done").length;

export const isFinished = (steps: PlanStep[]) => steps.length > 0 && steps.every((s) => s.status === "done");

/** Progress shown on cards: the agent's own figure, but never behind the steps actually done */
export const progressOf = (a: Agent, steps: PlanStep[]) => Math.max(a.progress, steps.length ? Math.round((doneSteps(steps) / steps.length) * 100) : 0);

/** The agent's status, with finished runs shown as complete */
export const statusOf = (a: Agent, steps: PlanStep[]): AgentStatus => (isFinished(steps) ? "done" : a.status);

export type RunSummary = {
  status: "running" | "paused" | "waiting" | "failed" | "done" | "queued" | "empty";
  label: string;
  currentStep?: PlanStep;
};

export const RUN_LABELS: Record<RunSummary["status"], string> = {
  empty: "No steps",
  done: "Complete",
  failed: "Failed",
  paused: "Paused",
  waiting: "Needs a decision",
  running: "Running",
  queued: "Queued",
};

/** One coherent state for a run, from its steps and its simulator state. A presentation adapter, not a store. */
export const summarizeRun = (steps: PlanStep[], run: Run): RunSummary => {
  const failed = steps.find((s) => s.status === "failed");
  const waiting = steps.find((s) => s.status === "waiting");
  const running = steps.find((s) => s.status === "running");
  const current = failed ?? waiting ?? running;
  const status: RunSummary["status"] = !steps.length
    ? "empty"
    : isFinished(steps)
      ? "done"
      : failed
        ? "failed"
        : run.status === "paused"
          ? "paused"
          : waiting
            ? "waiting"
            : running
              ? "running"
              : "queued";
  // A paused run keeps its waiting/running step; a finished or empty one has none
  return { status, label: RUN_LABELS[status], currentStep: status === "done" || status === "empty" ? undefined : current };
};

/** Spend so far. The server adds to the agent's own figure as steps finish. */
export const costOf = (a: Agent, _steps?: PlanStep[]) => a.cost;
