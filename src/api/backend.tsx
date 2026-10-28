import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import type { Agent, HumanRequest, LedgerChange, PlanStep, Quota } from "../../shared/contract";
import type { Run, Steering } from "../views/live/useSteering";
import { useApi, useAgents, useQuotas, useRequests, useResource, useSteeringState, type Resource } from "./hooks";

/** Everything the screens read and every action they can take, in the shapes the views already use. */
export interface Backend {
  agents: Agent[];
  /** Keyed by agent name */
  plans: Record<string, PlanStep[]>;
  steering: Steering;
  requests: HumanRequest[];
  quotas: Quota[];
  /** Keyed by agent name */
  ledgers: Record<string, LedgerChange[]>;
  updatePlan: (agentName: string, steps: PlanStep[]) => void;
  answer: (requestId: string, value: string) => void;
  reopen: (requestId: string) => void;
  /** Undo the changes an agent made, by id (the server also undoes what builds on them) */
  undo: (ids: string[]) => void;
  /** Failed actions surface here as a sentence, for a toast */
  onError: (handler: (message: string) => void) => void;
}

const BackendContext = createContext<Backend | null>(null);

export const useBackend = (): Backend => {
  const b = useContext(BackendContext);
  if (!b) throw new Error("useBackend needs a <BackendProvider> above it");
  return b;
};

/** All agents' plans or ledgers in one resource, keyed by agent name. Fine for a handful of agents; add a bulk route if it grows. */
const useByAgent = <T,>(load: (api: ReturnType<typeof useApi>, id: string) => Promise<T>, topic: "plan" | "ledger") => {
  return useResource(
    async (api) => {
      const agents = await api.agents();
      return Object.fromEntries(await Promise.all(agents.map(async (a) => [a.name, await load(api, a.id)] as const))) as Record<string, T>;
    },
    (e) => e.topic === topic,
  );
};

const failed = (...rs: Resource<unknown>[]) => rs.find((r) => r.error)?.error;

export function BackendProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const agents = useAgents();
  const plans = useByAgent((a, id) => a.plan(id), "plan");
  const ledgers = useByAgent((a, id) => a.ledger(id), "ledger");
  const steering = useSteeringState();
  const requests = useRequests();
  const quotas = useQuotas();
  const all = [agents, plans, ledgers, steering, requests, quotas];
  const report = useRef<(m: string) => void>(() => {});

  const value = useMemo<Backend | null>(() => {
    if (!agents.data || !plans.data || !ledgers.data || !steering.data || !requests.data || !quotas.data) return null;
    const idOf = (name: string) => agents.data!.find((a) => a.name === name)!.id;
    const nameOf = new Map(agents.data.map((a) => [a.id, a.name]));
    // Actions are fire-and-forget: the server's change event refetches, and a failure is reported once
    const run = (p: Promise<unknown>) => void p.catch((e: Error) => report.current(e.message));

    const runs: Record<string, Run> = {};
    for (const r of steering.data.runs) runs[nameOf.get(r.agentId)!] = r;
    const queues: Record<string, Steering["queues"][string]> = {};
    for (const [id, notes] of Object.entries(steering.data.queues)) queues[nameOf.get(id)!] = notes;

    return {
      agents: agents.data,
      // An agent that appeared after the last plan or ledger fetch has none yet
      plans: Object.fromEntries(agents.data.map((a) => [a.name, plans.data![a.name] ?? []])),
      requests: requests.data,
      quotas: quotas.data,
      ledgers: Object.fromEntries(agents.data.map((a) => [a.name, ledgers.data![a.name] ?? []])),
      steering: {
        runs,
        queues,
        queue: (name, text) => run(api.steer(idOf(name), { text, mode: "queue" })),
        remove: (name, id) => run(api.removeNote(idOf(name), id)),
        interrupt: (name, text, queuedId) => run(api.steer(idOf(name), { text, mode: "interrupt", queuedId })),
        pause: (name) => run(api.pause(idOf(name))),
        resume: (name) => run(api.resume(idOf(name))),
      },
      updatePlan: (name, steps) => run(api.updatePlan(idOf(name), steps)),
      answer: (id, v) => run(api.answer(id, v)),
      reopen: (id) => run(api.reopen(id)),
      undo: (ids) => run(Promise.all(ids.map((id) => api.undo(id)))),
      onError: (h) => void (report.current = h),
    };
  }, [api, agents.data, plans.data, ledgers.data, steering.data, requests.data, quotas.data]);

  if (!value) {
    const error = failed(...all);
    return (
      <div role="status" style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 24, textAlign: "center", color: "#cfd4dc", background: "#0b0c0f", font: "14px/1.5 system-ui, sans-serif" }}>
        <div>
          <p>{error ? "Can't reach the Xenon server." : "Connecting to the Xenon server…"}</p>
          {error && (
            <>
              <p style={{ opacity: 0.7 }}>Start it with <code>npm run api</code>, then try again.</p>
              <button onClick={() => all.forEach((r) => void r.refetch())}>Try again</button>
            </>
          )}
        </div>
      </div>
    );
  }
  return <BackendContext.Provider value={value}>{children}</BackendContext.Provider>;
}
