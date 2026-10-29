import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { Agent, HumanRequest, LedgerChange, PlanStep, Quota, Run, SteerNote } from "../shared/contract.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, desc TEXT NOT NULL, step TEXT NOT NULL, cost REAL NOT NULL, progress REAL NOT NULL,
  status TEXT NOT NULL, model TEXT NOT NULL, tasks TEXT NOT NULL, findings TEXT NOT NULL, limits TEXT NOT NULL, pos INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plan_steps (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE, pos INTEGER NOT NULL, id TEXT NOT NULL, label TEXT NOT NULL,
  status TEXT NOT NULL, detail TEXT, tool TEXT, duration INTEGER, started_at INTEGER, paused_at INTEGER, error TEXT,
  PRIMARY KEY (agent_id, pos)
);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE, step_id TEXT, text TEXT NOT NULL,
  picked TEXT, seq INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  agent_id TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE, status TEXT NOT NULL, started_at INTEGER NOT NULL,
  paused_at INTEGER, finished_at INTEGER
);
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY, pos INTEGER NOT NULL, body TEXT NOT NULL, answer TEXT, answered_at INTEGER
);
CREATE TABLE IF NOT EXISTS quotas (name TEXT PRIMARY KEY, pos INTEGER NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE, pos INTEGER NOT NULL, body TEXT NOT NULL, undone INTEGER NOT NULL DEFAULT 0
);`;

export type Db = DatabaseSync;

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function openDb(file = process.env.DB_FILE ?? "server/xenon.db"): Db {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  if (!(db.prepare("PRAGMA table_info(agents)").all() as { name: string }[]).some((c) => c.name === "kind")) {
    db.exec("ALTER TABLE agents ADD COLUMN kind TEXT");
  }
  if (!db.prepare("SELECT 1 FROM agents LIMIT 1").get()) seed(db);
  // Older simulator databases predate CLI marks. Fill only missing metadata, preserving run state.
  const demo = JSON.parse(readFileSync(new URL("./seed.json", import.meta.url), "utf8"));
  const setKind = db.prepare("UPDATE agents SET kind=? WHERE id=? AND kind IS NULL");
  for (const a of demo.agents) if (a.kind) setKind.run(a.kind, slug(a.name));
  return db;
}

/** Fills an empty database from server/seed.json (made by `npm run seed`) */
function seed(db: Db) {
  const s = JSON.parse(readFileSync(new URL("./seed.json", import.meta.url), "utf8"));
  const now = Date.now();
  db.exec("BEGIN");
  s.agents.forEach((a: any, i: number) => {
    const id = slug(a.name);
    db.prepare("INSERT INTO agents (id,name,desc,step,cost,progress,status,model,tasks,findings,limits,pos,kind) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      id, a.name, a.desc, a.step, a.cost, a.progress, a.status, s.models[a.name] ?? "", JSON.stringify(a.tasks), JSON.stringify(a.findings), JSON.stringify(s.limits[a.name]), i, a.kind ?? null,
    );
    // The plan an agent starts with: finished steps, the one running (or waiting on a person), then the queue
    const done = Math.floor(a.progress / 25);
    a.tasks.forEach((label: string, j: number) => {
      const meta = s.taskMeta[label] ?? {};
      const status = j < done ? "done" : j === done ? (a.status === "waiting" ? "waiting" : "running") : "queued";
      db.prepare("INSERT INTO plan_steps (agent_id,pos,id,label,status,detail,tool,duration,started_at) VALUES (?,?,?,?,?,?,?,?,?)").run(
        id, j, `${id}-${j}`, label, status, meta.detail ?? null, meta.tool ?? null,
        j < done ? 1100 + ((j * 7 + a.name.length) % 9) * 130 : null, j === done && a.status !== "waiting" ? now - 2500 : null,
      );
    });
    db.prepare("INSERT INTO runs (agent_id,status,started_at) VALUES (?,?,?)").run(id, a.status === "done" ? "done" : "running", now - (90_000 + a.progress * 1500));
    (s.ledger[a.name] ?? []).forEach((c: LedgerChange, k: number) => db.prepare("INSERT INTO ledger VALUES (?,?,?,?,0)").run(c.id, id, k, JSON.stringify(c)));
  });
  s.requests.forEach((r: any, i: number) => db.prepare("INSERT INTO requests (id,pos,body) VALUES (?,?,?)").run(`req-${i + 1}`, i, JSON.stringify(r)));
  s.quotas.forEach((q: Quota, i: number) => db.prepare("INSERT INTO quotas VALUES (?,?,?)").run(q.name, i, JSON.stringify(q)));
  db.exec("COMMIT");
}

/* ---------- Row → DTO ---------- */

const opt = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

export const getAgents = (db: Db): Agent[] =>
  (db.prepare("SELECT * FROM agents ORDER BY pos").all() as any[]).map((r) => ({
    id: r.id, name: r.name, desc: r.desc, step: r.step, cost: r.cost, progress: r.progress, status: r.status, model: r.model,
    kind: opt(r.kind), tasks: JSON.parse(r.tasks), findings: JSON.parse(r.findings), limits: JSON.parse(r.limits),
  }));

export const getPlan = (db: Db, agentId: string): PlanStep[] => {
  const notes = db.prepare("SELECT * FROM notes WHERE agent_id = ? AND step_id IS NOT NULL ORDER BY seq").all(agentId) as any[];
  return (db.prepare("SELECT * FROM plan_steps WHERE agent_id = ? ORDER BY pos").all(agentId) as any[]).map((r) => {
    const mine = notes.filter((n) => n.step_id === r.id).map((n): SteerNote => ({ id: n.id, text: n.text, picked: opt(n.picked) }));
    return {
      id: r.id, label: r.label, status: r.status, detail: opt(r.detail), tool: opt(r.tool), duration: opt(r.duration),
      startedAt: opt(r.started_at), pausedAt: opt(r.paused_at), error: opt(r.error), ...(mine.length ? { notes: mine } : {}),
    };
  });
};

export const getQueue = (db: Db, agentId: string): SteerNote[] =>
  (db.prepare("SELECT id, text FROM notes WHERE agent_id = ? AND step_id IS NULL ORDER BY seq").all(agentId) as any[]).map((n) => ({ id: n.id, text: n.text }));

export const getRun = (db: Db, agentId: string): Run => {
  const r = db.prepare("SELECT * FROM runs WHERE agent_id = ?").get(agentId) as any;
  return { agentId, status: r.status, startedAt: r.started_at, pausedAt: opt(r.paused_at), finishedAt: opt(r.finished_at) };
};

export const getRequests = (db: Db): HumanRequest[] =>
  (db.prepare("SELECT * FROM requests ORDER BY pos").all() as any[]).map((r) => ({
    ...JSON.parse(r.body), id: r.id, ...(r.answer !== null ? { answer: { value: r.answer, at: r.answered_at } } : {}),
  }));

export const getQuotas = (db: Db): Quota[] => (db.prepare("SELECT body FROM quotas ORDER BY pos").all() as any[]).map((r) => JSON.parse(r.body));

export const getLedger = (db: Db, agentId: string): LedgerChange[] =>
  (db.prepare("SELECT body, undone FROM ledger WHERE agent_id = ? ORDER BY pos").all(agentId) as any[]).map((r) => ({ ...JSON.parse(r.body), undone: !!r.undone }));
