import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ChangeEvent } from "../../shared/contract";
import { createHttpApi, type Api } from "./client";

const ApiContext = createContext<Api | null>(null);

/** Put the backend at the top of the app. `api` defaults to the same-origin server (Vite proxies /api in dev). */
export function ApiProvider({ api, children }: { api?: Api; children: ReactNode }) {
  const [value] = useState(() => api ?? createHttpApi());
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export const useApi = (): Api => {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi needs an <ApiProvider> above it");
  return api;
};

export type Resource<T> = { data?: T; error: Error | null; loading: boolean; refetch: () => Promise<void> };

/**
 * Loads a resource and keeps it fresh: refetches when the server reports a change that `matches`.
 * `load` and `matches` may change every render; the latest ones are used.
 */
export function useResource<T>(load: (api: Api) => Promise<T>, matches: (e: ChangeEvent) => boolean, deps: unknown[] = []): Resource<T> {
  const api = useApi();
  const [state, setState] = useState<{ data?: T; error: Error | null; loading: boolean }>({ error: null, loading: true });
  const latest = useRef({ load, matches });
  latest.current = { load, matches };

  const refetch = useCallback(async () => {
    try {
      const data = await latest.current.load(api);
      setState({ data, error: null, loading: false });
    } catch (e) {
      setState((s) => ({ ...s, error: e as Error, loading: false }));
    }
  }, [api]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void refetch(), [refetch, ...deps]);
  useEffect(() => api.subscribe((e) => latest.current.matches(e) && void refetch()), [api, refetch]);
  // Change events are the fast path; this is the safety net for a missed or dropped SSE connection
  // (e.g. the server restarted, or the tab was backgrounded) so the view can't go stale forever.
  useEffect(() => {
    const t = setInterval(() => void refetch(), 10_000);
    return () => clearInterval(t);
  }, [refetch]);
  return { ...state, refetch };
}

/* ---------- One hook per resource: these are what the views use instead of `data.ts` ---------- */

export const useAgents = () => useResource((a) => a.agents(), (e) => e.topic === "agents");
export const usePlan = (agentId: string) => useResource((a) => a.plan(agentId), (e) => e.topic === "plan" && e.agentId === agentId, [agentId]);
export const useSteeringState = () => useResource((a) => a.steering(), (e) => e.topic === "runs");
export const useLedger = (agentId: string) => useResource((a) => a.ledger(agentId), (e) => e.topic === "ledger" && e.agentId === agentId, [agentId]);
export const useRequests = () => useResource((a) => a.requests(), (e) => e.topic === "requests");
export const useQuotas = () => useResource((a) => a.quotas(), (e) => e.topic === "quotas");
