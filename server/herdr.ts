import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Agent, AgentStatus, HumanRequest, Quota, Run, SteerNote } from "../shared/contract.ts";
import { HttpError } from "./http-error.ts";
import type { Emit, Runtime } from "./runtime.ts";

/** One entry of `herdr agent list` (the fields we use) */
type HerdrAgent = {
  agent: string;
  agent_status: "idle" | "working" | "blocked" | "done" | "unknown";
  cwd: string;
  pane_id: string;
  state_change_seq: number;
  terminal_title?: string;
  terminal_title_stripped?: string;
};

/** Runs the herdr CLI without a shell, so prompt text can never become a command */
const herdr = (args: string[], timeout = 15_000) =>
  new Promise<string>((resolve, reject) => {
    execFile("herdr", args, { timeout, maxBuffer: 4_000_000 }, (err, stdout, stderr) => {
      if (!err) return resolve(stdout);
      let msg = stderr.trim();
      try {
        msg = JSON.parse(stderr).error?.message ?? msg;
      } catch {}
      reject(new HttpError(502, `herdr: ${msg || err.message}`));
    });
  });
const herdrJson = async (args: string[]) => JSON.parse(await herdr(args));

const STATUS: Record<HerdrAgent["agent_status"], AgentStatus> = { working: "working", unknown: "working", blocked: "waiting", idle: "done", done: "done" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Answered or open requests stay listed for this long after the agent stops being blocked */
const KEEP_ANSWERED_MS = 10 * 60_000;

type Ask = { id: string; pane: string; seq: number; details: string; open: boolean };

/**
 * Controls the live agents in your herdr session. Herdr is the source of truth for what each agent is doing;
 * this keeps only what herdr cannot: notes queued for later, which agents are held, and answers given.
 *
 *   agent list      -> Agent + Run      (polled every second; changes become change events)
 *   status blocked  -> a human request  (Approve = Enter, Deny = Esc)
 *   queue a note    -> sent with `agent prompt` as soon as the agent is idle and not held
 *   interrupt       -> Esc, then `agent prompt`
 *   hold / release  -> stops or resumes our own sending; the agent itself is not touched
 */
export function createHerdr(emit: Emit, dbFile = process.env.HERDR_DB_FILE ?? "server/herdr.db"): Runtime {
  const db = new DatabaseSync(dbFile);
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, pane TEXT NOT NULL, text TEXT NOT NULL, seq INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS answers (request_id TEXT PRIMARY KEY, pane TEXT NOT NULL, value TEXT NOT NULL, at INTEGER NOT NULL);`);
  const quotas = JSON.parse(readFileSync(new URL("./seed.json", import.meta.url), "utf8")).quotas as Quota[];

  let raw = new Map<string, HerdrAgent>();
  let agents: Agent[] = [];
  const since = new Map<string, { status: string; at: number; first: number }>();
  const held = new Set<string>();
  const sending = new Set<string>();
  const asks = new Map<string, Ask>();
  let seq = Date.now();

  const toAgents = (list: HerdrAgent[]): Agent[] => {
    // Named after the project folder; a second agent in the same folder gets " 2", and so on
    const label = (h: HerdrAgent) => basename(h.cwd) || h.cwd;
    const seen = new Map<string, number>();
    return list.map((h) => {
      const nth = (seen.get(label(h)) ?? 0) + 1;
      seen.set(label(h), nth);
      const title = h.terminal_title_stripped || h.terminal_title || label(h);
      const status = STATUS[h.agent_status] ?? "working";
      return {
        id: h.pane_id,
        name: nth > 1 ? `${label(h)} ${nth}` : label(h),
        desc: title,
        step: title,
        // Herdr doesn't report spend or progress; these stay at their neutral values
        cost: 0,
        progress: status === "done" ? 100 : 0,
        status,
        model: h.agent,
        kind: h.agent,
        tasks: [],
        findings: [],
      };
    });
  };

  const noteRows = (pane: string) => db.prepare("SELECT id, text FROM notes WHERE pane=? ORDER BY seq").all(pane) as unknown as SteerNote[];

  const poll = async () => {
    const res = await herdrJson(["agent", "list"]);
    const list = (res.result.agents as HerdrAgent[]).sort((a, b) => a.pane_id.localeCompare(b.pane_id, undefined, { numeric: true }));
    const now = Date.now();
    const prev = new Map(agents.map((a) => [a.id, JSON.stringify(a)]));
    const prevRaw = raw;
    raw = new Map(list.map((h) => [h.pane_id, h]));
    agents = toAgents(list);

    let roster = agents.length !== prev.size;
    for (const a of agents) {
      const h = raw.get(a.id)!;
      const was = since.get(a.id);
      if (!was) since.set(a.id, { status: h.agent_status, at: now, first: now });
      else if (was.status !== h.agent_status) since.set(a.id, { ...was, status: h.agent_status, at: now });
      if (!prev.has(a.id)) roster = true;
      else if (prev.get(a.id) !== JSON.stringify(a)) emit({ topic: "agents", agentId: a.id });
      if (prevRaw.get(a.id)?.agent_status !== h.agent_status) emit({ topic: "runs", agentId: a.id });
    }
    for (const id of since.keys()) if (!raw.has(id)) (since.delete(id), held.delete(id));
    if (roster) {
      emit({ topic: "agents" });
      emit({ topic: "runs" });
    }

    await trackAsks(now);
    await dispatch();
  };

  /** A blocked agent becomes a request; it stays listed once answered, then expires */
  const trackAsks = async (now: number) => {
    let changed = false;
    for (const h of raw.values()) {
      if (h.agent_status !== "blocked") continue;
      const id = `blocked-${h.pane_id.replace(/\W/g, "-")}-${h.state_change_seq}`;
      if (asks.has(id)) continue;
      let details = "";
      try {
        details = (await herdr(["agent", "read", h.pane_id, "--source", "detection", "--lines", "40"])).trimEnd();
      } catch {}
      asks.set(id, { id, pane: h.pane_id, seq: h.state_change_seq, details, open: true });
      changed = true;
    }
    for (const a of asks.values()) {
      if (!a.open || raw.get(a.pane)?.agent_status === "blocked") continue;
      a.open = false;
      changed = true;
    }
    for (const [id, a] of asks) {
      const answer = db.prepare("SELECT at FROM answers WHERE request_id=?").get(id) as { at: number } | undefined;
      // Settled without us (answered in the terminal) or answered long ago: drop it
      if (!a.open && (!answer || now - answer.at > KEEP_ANSWERED_MS)) (asks.delete(id), (changed = true));
    }
    if (changed) emit({ topic: "requests" });
  };

  /** Sends the next queued note to every agent that can take it */
  const dispatch = async () => {
    for (const h of raw.values()) {
      if (!["idle", "done"].includes(h.agent_status) || held.has(h.pane_id) || sending.has(h.pane_id)) continue;
      const note = db.prepare("SELECT id, text FROM notes WHERE pane=? ORDER BY seq LIMIT 1").get(h.pane_id) as { id: string; text: string } | undefined;
      if (!note) continue;
      sending.add(h.pane_id);
      try {
        await herdr(["agent", "prompt", h.pane_id, note.text]);
        db.prepare("DELETE FROM notes WHERE id=?").run(note.id);
        emit({ topic: "runs", agentId: h.pane_id });
      } catch (e) {
        console.error(`Could not send a queued note to ${h.pane_id}:`, (e as Error).message);
      } finally {
        sending.delete(h.pane_id);
      }
    }
  };

  const need = (id: string) => {
    const h = raw.get(id);
    if (!h) throw new HttpError(404, `No live agent "${id}" in herdr`);
    return h;
  };

  const runOf = (a: Agent): Run => {
    const s = since.get(a.id)!;
    const status = held.has(a.id) ? "paused" : a.status === "done" ? "done" : "running";
    return { agentId: a.id, status, startedAt: s.first, ...(status === "done" ? { finishedAt: s.at } : {}) };
  };

  const toRequest = (a: Ask): HumanRequest => {
    const h = raw.get(a.pane);
    const answer = db.prepare("SELECT value, at FROM answers WHERE request_id=?").get(a.id) as { value: string; at: number } | undefined;
    const agent = agents.find((x) => x.id === a.pane);
    return {
      id: a.id,
      name: agent?.desc ?? a.pane,
      agent: agent?.name ?? a.pane,
      question: "This agent is waiting for a decision.",
      details: a.details || "Open the pane in herdr to see what it asks.",
      type: "choice",
      options: ["Approve (press Enter)", "Deny (press Esc)"],
      approval: { risk: "medium", preview: [{ label: "Agent", value: h?.agent ?? "agent" }, { label: "Folder", value: h?.cwd ?? "" }, { label: "Pane", value: a.pane }] },
      ...(answer ? { answer } : {}),
    };
  };

  let timer: ReturnType<typeof setInterval> | undefined;
  let polling = false;
  let failing = false;
  const safePoll = async () => {
    if (polling) return;
    polling = true;
    try {
      await poll();
      failing = false;
    } catch (e) {
      if (!failing) console.error("herdr poll failed:", (e as Error).message);
      failing = true;
    } finally {
      polling = false;
    }
  };

  return {
    name: "herdr",
    agents: () => agents,
    hasAgent: (id) => raw.has(id),
    plan: () => [],
    updatePlan: () => {
      throw new HttpError(409, "Herdr agents don't have editable plans");
    },
    steering: () => ({ runs: agents.map(runOf), queues: Object.fromEntries(agents.map((a) => [a.id, noteRows(a.id)])) }),
    async steer(id, { text, mode, queuedId }) {
      const h = need(id);
      if (mode === "queue") {
        const noteId = `note-${++seq}`;
        db.prepare("INSERT INTO notes VALUES (?,?,?,?)").run(noteId, id, text, seq);
        emit({ topic: "runs", agentId: id });
        return noteId;
      }
      // Interrupt: stop what the agent is doing, then hand it the new instruction
      if (queuedId) db.prepare("DELETE FROM notes WHERE id=? AND pane=?").run(queuedId, id);
      if (h.agent_status === "working") {
        await herdr(["agent", "send-keys", id, "esc"]);
        await sleep(400);
      }
      await herdr(["agent", "prompt", id, text]);
      emit({ topic: "runs", agentId: id });
      return queuedId ?? `note-${++seq}`;
    },
    removeNote(id, noteId) {
      db.prepare("DELETE FROM notes WHERE id=? AND pane=?").run(noteId, id);
      emit({ topic: "runs", agentId: id });
    },
    pause(id) {
      need(id);
      held.add(id);
      emit({ topic: "runs", agentId: id });
    },
    resume(id) {
      held.delete(id);
      emit({ topic: "runs", agentId: id });
      void safePoll();
    },
    ledger: () => [],
    undo: () => ({ blocked: "Herdr agents keep no change history to undo" }),
    requests: () => [...asks.values()].map(toRequest),
    async answer(requestId, value) {
      const ask = asks.get(requestId);
      if (!ask?.open) throw new HttpError(409, "That agent is no longer waiting");
      if (db.prepare("SELECT 1 FROM answers WHERE request_id=?").get(requestId)) throw new HttpError(409, "Already answered");
      const key = value.startsWith("Approve") ? "enter" : value.startsWith("Deny") ? "esc" : undefined;
      if (!key) throw new HttpError(400, "Answer must be Approve or Deny");
      await herdr(["agent", "send-keys", ask.pane, key]);
      db.prepare("INSERT INTO answers VALUES (?,?,?,?)").run(requestId, ask.pane, value, Date.now());
      emit({ topic: "requests" });
      return toRequest(ask);
    },
    reopen(requestId) {
      db.prepare("DELETE FROM answers WHERE request_id=?").run(requestId);
      emit({ topic: "requests" });
    },
    quotas: () => quotas,
    async output(id, lines) {
      need(id);
      return (await herdr(["agent", "read", id, "--source", "recent-unwrapped", "--lines", String(lines)])).trimEnd();
    },
    async keys(id, keys) {
      need(id);
      await herdr(["agent", "send-keys", id, ...keys]);
    },
    start() {
      void safePoll();
      timer = setInterval(safePoll, 1000);
    },
    stop: () => clearInterval(timer),
  };
}
