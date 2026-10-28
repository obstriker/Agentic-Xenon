import type { Db } from "./db.ts";
import { getAgents, getLedger, getPlan, getQueue, getQuotas, getRequests, getRun } from "./db.ts";
import { createEngine } from "./engine.ts";
import { HttpError } from "./http-error.ts";
import type { Emit, Runtime } from "./runtime.ts";

/** The simulator: agents that step through seeded plans on a timer. Good for building the UI without herdr. */
export function createSim(db: Db, emit: Emit): Runtime {
  const engine = createEngine(db, emit);
  let clock: ReturnType<typeof setInterval> | undefined;
  return {
    name: "sim",
    agents: () => getAgents(db),
    hasAgent: (id) => !!db.prepare("SELECT 1 FROM agents WHERE id=?").get(id),
    plan: (id) => getPlan(db, id),
    updatePlan(id, steps) {
      const fixed = getPlan(db, id).filter((s) => s.status !== "queued");
      if (steps.slice(0, fixed.length).some((s, i) => s.id !== fixed[i].id)) throw new HttpError(409, "Finished, running and failed steps can't change");
      engine.editPlan(id, steps.slice(fixed.length).map((s) => ({ id: s.id, label: s.label, detail: s.detail, tool: s.tool })));
      return getPlan(db, id);
    },
    steering() {
      const ids = getAgents(db).map((a) => a.id);
      return { runs: ids.map((id) => getRun(db, id)), queues: Object.fromEntries(ids.map((id) => [id, getQueue(db, id)])) };
    },
    steer: (id, req) => engine.steer(id, req),
    removeNote: (id, noteId) => engine.removeNote(id, noteId),
    pause: (id) => engine.pause(id),
    resume: (id) => engine.resume(id),
    ledger: (id) => getLedger(db, id),
    undo: (changeId) => engine.undo(changeId),
    requests: () => getRequests(db),
    async answer(id, value) {
      const r = db.prepare("UPDATE requests SET answer=?, answered_at=? WHERE id=? AND answer IS NULL").run(value, Date.now(), id);
      if (!r.changes) throw new HttpError(409, "No open request with that id");
      emit({ topic: "requests" });
      return getRequests(db).find((q) => q.id === id)!;
    },
    reopen(id) {
      db.prepare("UPDATE requests SET answer=NULL, answered_at=NULL WHERE id=?").run(id);
      emit({ topic: "requests" });
    },
    quotas: () => getQuotas(db),
    output: async () => {
      throw new HttpError(501, "The simulator has no terminals. Run with RUNTIME=herdr.");
    },
    keys: async () => {
      throw new HttpError(501, "The simulator has no terminals. Run with RUNTIME=herdr.");
    },
    start: () => void (clock = setInterval(engine.tick, 500)),
    stop: () => clearInterval(clock),
  };
}
