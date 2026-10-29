import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAgents, getPlan, openDb } from "./db.ts";
import { createEngine } from "./engine.ts";

test("simulator CLI types survive seeding and migration without resetting agent state", () => {
  const dir = mkdtempSync(join(tmpdir(), "xenon-icons-"));
  const file = join(dir, "test.db");
  let db = openDb(file);
  try {
    assert.deepEqual(getAgents(db).map((a) => a.kind), ["claude", "codex", "gemini", "claude", "claude", "claude"]);
    db.prepare("UPDATE agents SET cost=42 WHERE id='protocol-research'").run();
    db.exec("ALTER TABLE agents DROP COLUMN kind");
    db.close();
    db = openDb(file);
    const agent = getAgents(db).find((a) => a.id === "protocol-research")!;
    assert.equal(agent.kind, "codex");
    assert.equal(agent.cost, 42);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("simulated agents can finish a step without optional account limits", () => {
  const db = openDb(":memory:");
  try {
    const agent = getAgents(db).find((a) => a.status === "working")!;
    const step = getPlan(db, agent.id).find((s) => s.status === "running")!;
    db.prepare("UPDATE agents SET limits='null' WHERE id=?").run(agent.id);
    db.prepare("UPDATE plan_steps SET started_at=? WHERE agent_id=? AND id=?").run(Date.now() - 100_000, agent.id, step.id);
    assert.doesNotThrow(() => createEngine(db, () => {}).tick());
    assert.equal(getPlan(db, agent.id).find((s) => s.id === step.id)?.status, "done");
    assert.equal(getAgents(db).find((a) => a.id === agent.id)?.limits, null);
  } finally { db.close(); }
});
