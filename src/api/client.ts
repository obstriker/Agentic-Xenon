import {
  routes, type Agent, type AnswerRequest, type ApiError, type ChangeEvent, type HumanRequest, type LedgerChange, type PlanStep, type PlanUpdate,
  type KeysRequest, type OutputResponse, type Quota, type SteerRequest, type Steering, type UndoResult,
} from "../../shared/contract";

/** Thrown for every non-2xx answer; `message` is the server's own sentence, safe to show */
export class ApiFailure extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * The one place the app talks to a backend. Every view and hook takes an `Api`, so tests can pass a fake
 * and a different backend only has to satisfy this interface.
 */
export interface Api {
  agents(): Promise<Agent[]>;
  plan(agentId: string): Promise<PlanStep[]>;
  updatePlan(agentId: string, steps: PlanStep[]): Promise<PlanStep[]>;
  steering(): Promise<Steering>;
  steer(agentId: string, req: SteerRequest): Promise<{ id: string }>;
  removeNote(agentId: string, noteId: string): Promise<void>;
  pause(agentId: string): Promise<void>;
  resume(agentId: string): Promise<void>;
  ledger(agentId: string): Promise<LedgerChange[]>;
  undo(changeId: string): Promise<UndoResult>;
  requests(): Promise<HumanRequest[]>;
  answer(requestId: string, value: string): Promise<HumanRequest>;
  reopen(requestId: string): Promise<void>;
  quotas(): Promise<Quota[]>;
  /** Recent terminal output of an agent (herdr runtime only) */
  output(agentId: string, lines?: number): Promise<string>;
  /** Send logical keys to an agent's terminal, e.g. ["esc"] (herdr runtime only) */
  keys(agentId: string, keys: string[]): Promise<void>;
  /** Calls `onChange` whenever the server says a resource changed. Returns the unsubscribe. */
  subscribe(onChange: (e: ChangeEvent) => void): () => void;
}

export function createHttpApi(base = ""): Api {
  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetch(base + path, { method, headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) {
      const msg = ((await res.json().catch(() => null)) as ApiError | null)?.error;
      throw new ApiFailure(res.status, msg ?? `The server answered ${res.status}`);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  };
  const listeners = new Set<(e: ChangeEvent) => void>();
  let stream: EventSource | undefined;
  return {
    agents: () => call("GET", routes.agents),
    plan: (id) => call("GET", routes.plan(id)),
    updatePlan: (id, steps) => call("PUT", routes.plan(id), { steps } satisfies PlanUpdate),
    steering: () => call("GET", routes.steering),
    steer: (id, req) => call("POST", routes.steer(id), req),
    removeNote: (id, noteId) => call("DELETE", routes.note(id, noteId)),
    pause: (id) => call("POST", routes.pause(id)),
    resume: (id) => call("POST", routes.resume(id)),
    ledger: (id) => call("GET", routes.ledger(id)),
    undo: (changeId) => call("POST", routes.undo(changeId)),
    requests: () => call("GET", routes.requests),
    answer: (id, value) => call("POST", routes.answer(id), { value } satisfies AnswerRequest),
    reopen: (id) => call("DELETE", routes.answer(id)),
    quotas: () => call("GET", routes.quotas),
    output: async (id, lines) => (await call<OutputResponse>("GET", routes.output(id, lines))).text,
    keys: (id, keys) => call("POST", routes.keys(id), { keys } satisfies KeysRequest),
    // One shared stream for every subscriber: browsers allow only 6 connections per host
    subscribe: (onChange) => {
      listeners.add(onChange);
      if (!stream) {
        stream = new EventSource(base + routes.events);
        stream.addEventListener("change", (e) => {
          const event = JSON.parse((e as MessageEvent).data) as ChangeEvent;
          listeners.forEach((l) => l(event));
        });
      }
      return () => {
        listeners.delete(onChange);
        if (!listeners.size) {
          stream?.close();
          stream = undefined;
        }
      };
    },
  };
}
