import type { Run as ApiRun, SteerNote } from "../../../shared/contract";

/** A run as the views read it. The server owns the clock; see server/engine.ts. */
export type Run = Omit<ApiRun, "agentId">;

/** What the views hold for the runs: queued notes, run state, and the actions on them. Provided by `useBackend()`. */
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
