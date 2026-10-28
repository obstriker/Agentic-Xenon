import type { Agent, ChangeEvent, HumanRequest, LedgerChange, PlanStep, Quota, SteerRequest, Steering } from "../shared/contract.ts";

export type Emit = (e: ChangeEvent) => void;

/**
 * What the API needs from whatever actually runs the agents. `sim.ts` simulates them; `herdr.ts` controls
 * the real ones through the herdr CLI. Throw `HttpError` for anything the caller should see.
 */
export interface Runtime {
  readonly name: string;
  agents(): Agent[];
  /** Ids are opaque: a slug for the simulator, a herdr pane id for herdr */
  hasAgent(id: string): boolean;
  plan(id: string): PlanStep[];
  updatePlan(id: string, steps: PlanStep[]): PlanStep[];
  steering(): Steering;
  steer(id: string, req: SteerRequest): string | Promise<string>;
  removeNote(id: string, noteId: string): void;
  pause(id: string): void;
  resume(id: string): void;
  ledger(id: string): LedgerChange[];
  /** Returns the ids undone, or why it was blocked */
  undo(changeId: string): string[] | { blocked: string };
  requests(): HumanRequest[];
  answer(requestId: string, value: string): Promise<HumanRequest>;
  reopen(requestId: string): void;
  quotas(): Quota[];
  output(id: string, lines: number): Promise<string>;
  keys(id: string, keys: string[]): Promise<void>;
  start(): void;
  stop(): void;
}
