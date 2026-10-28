import type { ChangeEvent, LedgerChange, SteerRequest } from "../shared/contract.ts";
import { getAgents, getLedger, getPlan, getRun, type Db } from "./db.ts";

type Emit = (e: ChangeEvent) => void;

/** Mock: how long a running step takes before the agent moves on, 40 to 72 seconds, steady per step. Replace with your agent runtime. */
export const stepMs = (label: string) => 40_000 + (label.length % 5) * 8_000;
/** Sample spend added for every finished step */
const STEP_COST = 0.35;
/** Sample growth in tokens and tool calls for every finished step */
const TOKENS_PER_STEP = 6_000;
const CALLS_PER_STEP = 14;

let seq = Date.now();
const noteId = () => `note-${++seq}`;

/**
 * The run engine. It owns everything that used to live in the app's `useSteering` hook: agents work through their
 * steps, queued notes land on the step that starts next ("next"), interrupts land on the step in progress ("now"),
 * and a run can be paused. Swap `tick` for a real agent runtime and the rest of the API stays the same.
 */
export function createEngine(db: Db, emit: Emit) {
  const tx = <T>(fn: () => T): T => {
    db.exec("BEGIN");
    try {
      const out = fn();
      db.exec("COMMIT");
      return out;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };

  const tick = () => {
    const t = Date.now();
    for (const a of getAgents(db)) {
      if (getRun(db, a.id).status !== "running") continue;
      const steps = getPlan(db, a.id);
      const at = steps.findIndex((s) => s.status === "running");
      const step = steps[at];
      if (!step || step.startedAt === undefined || t - step.startedAt < stepMs(step.label)) continue;
      const next = steps.findIndex((s, j) => j > at && s.status === "queued");
      tx(() => {
        db.prepare("UPDATE plan_steps SET status='done', duration=?, started_at=NULL WHERE agent_id=? AND id=?").run(t - step.startedAt!, a.id, step.id);
        const { context, calls } = a.limits;
        const limits = { ...a.limits, context: { ...context, used: Math.min(context.max, context.used + TOKENS_PER_STEP) }, calls: { ...calls, used: Math.min(calls.max, calls.used + CALLS_PER_STEP) } };
        db.prepare("UPDATE agents SET cost = cost + ?, progress = ?, limits = ? WHERE id = ?").run(STEP_COST, Math.round(((at + 1) / steps.length) * 100), JSON.stringify(limits), a.id);
        if (next >= 0) {
          db.prepare("UPDATE plan_steps SET status='running', started_at=? WHERE agent_id=? AND id=?").run(t, a.id, steps[next].id);
          db.prepare("UPDATE notes SET step_id=?, picked='next' WHERE agent_id=? AND step_id IS NULL").run(steps[next].id, a.id);
        } else {
          db.prepare("UPDATE runs SET status='done', finished_at=? WHERE agent_id=?").run(t, a.id);
          db.prepare("UPDATE agents SET status='done', progress=100 WHERE id=?").run(a.id);
        }
      });
      emit({ topic: "plan", agentId: a.id });
      emit({ topic: "runs", agentId: a.id });
      emit({ topic: "agents", agentId: a.id });
    }
  };

  /** The step an interrupt lands on: the one in progress, else the last finished one */
  const landing = (agentId: string) => {
    const steps = getPlan(db, agentId);
    const active = steps.find((s) => s.status === "running" || s.status === "waiting");
    return active ?? [...steps].reverse().find((s) => s.status === "done") ?? steps[0];
  };

  const queueNote = (agentId: string, text: string) => {
    const id = noteId();
    db.prepare("INSERT INTO notes (id,agent_id,step_id,text,picked,seq) VALUES (?,?,NULL,?,NULL,?)").run(id, agentId, text, seq);
    emit({ topic: "runs", agentId });
    return id;
  };

  const removeNote = (agentId: string, id: string) => {
    db.prepare("DELETE FROM notes WHERE id=? AND agent_id=? AND step_id IS NULL").run(id, agentId);
    emit({ topic: "runs", agentId });
  };

  const steer = (agentId: string, { text, mode, queuedId }: SteerRequest) => {
    if (mode === "queue") return queueNote(agentId, text);
    const step = landing(agentId);
    if (!step) throw new Error("This agent has no steps");
    const id = queuedId ?? noteId();
    tx(() => {
      if (queuedId) removeNote(agentId, queuedId);
      db.prepare("INSERT INTO notes (id,agent_id,step_id,text,picked,seq) VALUES (?,?,?,?,'now',?)").run(id, agentId, step.id, text, ++seq);
    });
    emit({ topic: "plan", agentId });
    return id;
  };

  const pause = (agentId: string) => {
    const at = Date.now();
    tx(() => {
      db.prepare("UPDATE runs SET status='paused', paused_at=? WHERE agent_id=? AND status='running'").run(at, agentId);
      db.prepare("UPDATE plan_steps SET paused_at=? WHERE agent_id=? AND status='running'").run(at, agentId);
    });
    emit({ topic: "runs", agentId });
    emit({ topic: "plan", agentId });
  };

  /** Time spent paused doesn't count: every clock moves forward by the pause */
  const resume = (agentId: string) => {
    const run = getRun(db, agentId);
    if (run.status !== "paused") return;
    const gap = Date.now() - (run.pausedAt ?? Date.now());
    tx(() => {
      db.prepare("UPDATE runs SET status='running', started_at=started_at+?, paused_at=NULL WHERE agent_id=?").run(gap, agentId);
      db.prepare("UPDATE plan_steps SET started_at=COALESCE(started_at, paused_at)+?, paused_at=NULL WHERE agent_id=? AND paused_at IS NOT NULL").run(gap, agentId);
    });
    emit({ topic: "runs", agentId });
    emit({ topic: "plan", agentId });
  };

  /** Replaces the queued tail of a plan. Steps that are done, running, waiting or failed can't change. */
  const editPlan = (agentId: string, steps: { id: string; label: string; detail?: string; tool?: string }[]) => {
    const current = getPlan(db, agentId);
    const fixed = current.filter((s) => s.status !== "queued");
    tx(() => {
      db.prepare("DELETE FROM plan_steps WHERE agent_id=? AND status='queued'").run(agentId);
      steps.forEach((s, i) =>
        db.prepare("INSERT INTO plan_steps (agent_id,pos,id,label,status,detail,tool) VALUES (?,?,?,?,'queued',?,?)").run(agentId, fixed.length + i, s.id, s.label, s.detail ?? null, s.tool ?? null),
      );
    });
    emit({ topic: "plan", agentId });
  };

  /** Marks a change and everything built on it as undone. Irreversible changes block the undo. */
  const undo = (changeId: string): string[] | { blocked: string } => {
    const row = db.prepare("SELECT agent_id FROM ledger WHERE id=?").get(changeId) as { agent_id: string } | undefined;
    if (!row) throw new Error("No such change");
    const all = getLedger(db, row.agent_id);
    const hit = new Set([changeId]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const c of all) if (!hit.has(c.id) && c.dependsOn?.some((d) => hit.has(d))) hit.add(c.id), (grew = true);
    }
    const target = all.find((c) => c.id === changeId) as LedgerChange;
    if (target.irreversible) return { blocked: "This change can't be taken back" };
    const ids = [...hit].filter((id) => !all.find((c) => c.id === id)?.irreversible);
    for (const id of ids) db.prepare("UPDATE ledger SET undone=1 WHERE id=?").run(id);
    emit({ topic: "ledger", agentId: row.agent_id });
    return ids;
  };

  return { tick, steer, removeNote, pause, resume, editPlan, undo };
}
