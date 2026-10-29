import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeSnapshot, codexSnapshot, geminiSnapshot, createSubscriptionMonitor, UsageError, type UsageReader } from "./subscriptions.ts";

test("Claude uses account utilization, skips null windows and preserves zero", () => {
  const snapshot = claudeSnapshot({ five_hour: { utilization: 0, resets_at: "2026-11-01T00:00:00Z" }, seven_day: null, seven_day_opus: { utilization: "20" } }, "Team subscription");
  assert.equal(snapshot.plan, "Team subscription");
  assert.equal(snapshot.windows.length, 1);
  assert.equal(snapshot.windows[0].used, 0);
  assert.equal(snapshot.windows[0].resetsAt, Date.parse("2026-11-01T00:00:00Z"));
  assert.throws(() => claudeSnapshot({ five_hour: { utilization: NaN } }, "Unknown"));
});

test("Codex prefers all metered buckets and uses actual durations and Unix seconds", () => {
  const snapshot = codexSnapshot({ account: { planType: "team" } }, {
    rateLimits: { primary: { usedPercent: 99 } },
    rateLimitsByLimitId: {
      codex: { primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: 1793230000 }, secondary: null },
      other: { limitName: "Other models", primary: { usedPercent: 42, windowDurationMins: 60 }, secondary: { usedPercent: 110 }, spendControlReached: true },
    },
  });
  assert.equal(snapshot.plan, "Team subscription");
  assert.deepEqual(snapshot.windows.map((w) => w.used), [0, 42]);
  assert.equal(snapshot.windows[0].resetsAt, 1793230000000);
  assert.match(snapshot.windows[1].label, /Other models · 1-hour window/);
  assert.deepEqual(snapshot.details, ["Workspace spend control reached"]);
});

test("Codex supports the legacy bucket without fabricating missing windows", () => {
  const snapshot = codexSnapshot({}, { rateLimits: { planType: "pro", secondary: { usedPercent: 25, windowDurationMins: 10080 } } });
  assert.equal(snapshot.windows.length, 1);
  assert.equal(snapshot.windows[0].label, "Weekly");
  assert.equal(snapshot.plan, "Pro subscription");
  assert.throws(() => codexSnapshot({}, { rateLimits: { primary: { usedPercent: null } } }));
});

test("Gemini converts remaining fraction into used percentage and preserves the tier", () => {
  const snapshot = geminiSnapshot({ paidTier: { name: "Google AI Pro" }, buckets: [
    { modelId: "gemini-pro", remainingFraction: .75, resetTime: "2026-11-01T00:00:00Z" },
    { modelId: "gemini-flash", remainingFraction: 0 },
    { remainingFraction: null }, { remainingFraction: -1 },
  ] });
  assert.equal(snapshot.plan, "Google AI Pro");
  assert.deepEqual(snapshot.windows.map((w) => w.used), [25, 100]);
  assert.throws(() => geminiSnapshot({ buckets: [] }));
});

test("failures preserve last known data as stale, isolate providers, and do not expose raw errors", async () => {
  let clock = 1_000_000;
  let offline = false;
  const successful: UsageReader = async () => ({ plan: "Team subscription", windows: [{ id: "session", label: "Session", used: 17 }] });
  const monitor = createSubscriptionMonitor(() => {}, {
    Claude: async () => { if (offline) throw new Error("sensitive provider error"); return successful(); },
    Codex: successful,
    Gemini: async () => { throw new Error("private credential path"); },
  }, () => clock);
  await monitor.refresh();
  assert.equal(monitor.quotas().find((q) => q.provider === "Gemini")?.status, "unavailable");
  offline = true;
  clock += 60_000;
  await monitor.refresh();
  const claude = monitor.quotas().find((q) => q.provider === "Claude")!;
  assert.equal(claude.status, "stale");
  assert.equal(claude.updatedAt, 1_000_000);
  assert.equal(claude.segments[0].value, 17);
  assert.equal(monitor.quotas().find((q) => q.provider === "Codex")?.status, "live");
  assert.doesNotMatch(JSON.stringify(monitor.quotas()), /sensitive|private credential/);
  offline = false;
  await monitor.refresh();
  assert.equal(monitor.quotas().find((q) => q.provider === "Claude")?.status, "live");
});

test("old source timestamps are stale and concurrent refreshes share one request", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const reader: UsageReader = async () => { calls++; await gate; return { plan: "Team", updatedAt: 1_000_000, windows: [{ id: "a", label: "Session", used: 0 }] }; };
  const monitor = createSubscriptionMonitor(() => {}, { Claude: reader, Codex: reader, Gemini: reader }, () => 1_200_000);
  const first = monitor.refresh();
  const second = monitor.refresh();
  assert.equal(first, second);
  release();
  await first;
  assert.equal(calls, 3);
  assert.ok(monitor.quotas().every((q) => q.status === "stale"));
});

test("usage history survives reset timestamp jitter and clears on an actual window rollover", async () => {
  let reset = 2_000_000;
  let used = 10;
  const reader: UsageReader = async () => ({ plan: "Team", windows: [{ id: "session", label: "Session", used, resetsAt: reset }] });
  const monitor = createSubscriptionMonitor(() => {}, { Claude: reader, Codex: reader, Gemini: reader }, () => 1_000_000);
  await monitor.refresh();
  reset += 1200;
  used = 20;
  await monitor.refresh();
  assert.deepEqual(monitor.quotas().find((q) => q.provider === "Claude")?.daily, [10, 20]);
  reset += 5 * 60 * 60_000;
  used = 0;
  await monitor.refresh();
  assert.deepEqual(monitor.quotas().find((q) => q.provider === "Claude")?.daily, [0]);
});

test("rate limit backoff pauses one provider while other subscriptions keep refreshing", async () => {
  let clock = 1_000_000;
  let calls = 0;
  const reader: UsageReader = async () => ({ plan: "Team", windows: [{ id: "session", label: "Session", used: 25 }] });
  const monitor = createSubscriptionMonitor(() => {}, {
    Claude: async () => { calls++; const error = new UsageError("Rate limited"); error.retryAfterMs = 180_000; throw error; },
    Codex: reader, Gemini: reader,
  }, () => clock);
  await monitor.refresh();
  clock += 60_000;
  await monitor.refresh();
  assert.equal(calls, 1);
  assert.equal(monitor.quotas().find((q) => q.provider === "Codex")?.updatedAt, clock);
  clock += 120_000;
  await monitor.refresh();
  assert.equal(calls, 2);
});

test("real samples survive a restart and remain explicitly stale when the provider is unavailable", async () => {
  const folder = await mkdtemp(join(tmpdir(), "xenon-usage-test-"));
  try {
    const cache = join(folder, "usage.json");
    const reader: UsageReader = async () => ({ plan: "Team", windows: [{ id: "session", label: "Session", used: 25, resetsAt: 2_000_000 }] });
    const first = createSubscriptionMonitor(() => {}, { Claude: reader, Codex: reader, Gemini: reader }, () => 1_000_000, cache);
    await first.refresh();
    await first.refresh();
    const unavailable: UsageReader = async () => { throw new UsageError("Rate limited"); };
    const second = createSubscriptionMonitor(() => {}, { Claude: unavailable, Codex: unavailable, Gemini: unavailable }, () => 1_060_000, cache);
    await second.restore();
    await second.refresh();
    assert.ok(second.quotas().every((q) => q.status === "stale"));
    assert.deepEqual(second.quotas()[0].daily, [25, 25]);
    assert.equal(second.quotas()[0].updatedAt, 1_000_000);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
