import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import type { Quota } from "../shared/contract.ts";
import type { Emit } from "./runtime.ts";

type Provider = NonNullable<Quota["provider"]>;
type Window = { id: string; label: string; used: number; resetsAt?: number };
type Snapshot = { plan: string; windows: Window[]; details?: string[]; updatedAt?: number; spend?: Quota["spend"] };
export type UsageReader = () => Promise<Snapshot>;
const REFRESH_MS = 60_000;
export class UsageError extends Error {
  plan?: string;
  retryAfterMs?: number;
  constructor(message: string, plan?: string) { super(message); this.plan = plan; }
}
const execute = promisify(execFile);
let wslHome: Promise<string | undefined> | undefined;
async function configDirectories(provider: "Claude" | "Gemini") {
  const setting = provider === "Claude" ? process.env.CLAUDE_CONFIG_DIR : process.env.GEMINI_CONFIG_DIR;
  if (setting) return [setting];
  const suffix = provider === "Claude" ? ".claude" : ".gemini";
  const paths = [join(homedir(), suffix)];
  if (process.platform === "win32") {
    wslHome ??= (async () => {
      try {
        const { stdout } = await execute("wsl.exe", ["--exec", "printenv", "HOME"], { timeout: 3000, windowsHide: true });
        const home = stdout.trim();
        if (!home.startsWith("/")) return;
        const result = await execute("wsl.exe", ["--exec", "wslpath", "-w", home], { timeout: 3000, windowsHide: true });
        return result.stdout.trim();
      } catch { return; }
    })();
    const home = await wslHome;
    if (home) paths.push(join(home, suffix));
  }
  return paths;
}
const percent = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
const timestamp = (value: unknown): number | undefined => {
  const n = typeof value === "number" ? value * 1000 : typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const title = (value: string) => value.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const jsonFile = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const request = async (url: string, token: string, body?: object) => {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : { "anthropic-beta": "oauth-2025-04-20" }) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  // Never forward provider response bodies, credentials, or account identifiers to the client.
  if (response.status === 401) throw new UsageError("Sign in again in the provider's CLI to refresh your account connection.");
  if (response.status === 403) throw new UsageError("This account does not expose subscription usage through its CLI.");
  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    const seconds = Number(retryAfter);
    const delay = retryAfter && Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter ?? "") - Date.now();
    const error = new UsageError("Usage checks are temporarily rate limited. Retrying automatically.");
    error.retryAfterMs = Math.max(REFRESH_MS, Number.isFinite(delay) && delay > 0 ? delay : 5 * REFRESH_MS);
    throw error;
  }
  if (!response.ok) throw new UsageError("The provider could not return usage right now. Retrying automatically.");
  const data = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new UsageError("The provider returned an invalid usage response.");
  return data as Record<string, any>;
};

export function claudeSnapshot(data: any, plan: string, updatedAt?: number): Snapshot {
  const definitions = [
    ["five_hour", "5-hour session"], ["seven_day", "Weekly"],
    ["seven_day_sonnet", "Weekly · Sonnet"], ["seven_day_opus", "Weekly · Opus"],
  ];
  const windows = definitions.flatMap(([id, label]) => {
    const w = data?.[id];
    return percent(w?.utilization) ? [{ id, label, used: w.utilization, resetsAt: timestamp(w.resets_at) }] : [];
  });
  if (data?.extra_usage?.is_enabled && percent(data.extra_usage.utilization)) {
    windows.push({ id: "extra_usage", label: "Extra usage", used: data.extra_usage.utilization, resetsAt: timestamp(data.extra_usage.resets_at) });
  }
  if (!windows.length) throw new UsageError("Claude has not reported subscription limits for this account.", plan);
  return { plan, windows, updatedAt };
}

export const readClaude: UsageReader = async () => {
  let auth: any;
  for (const config of await configDirectories("Claude")) {
    try {
      const candidate = (await jsonFile(join(config, ".credentials.json"))).claudeAiOauth;
      auth ??= candidate;
      if (candidate?.accessToken && (!candidate.expiresAt || candidate.expiresAt > Date.now())) { auth = candidate; break; }
    } catch {}
  }
  const plan = auth?.subscriptionType ? `${title(auth.subscriptionType)} subscription` : "Plan not reported";
  // A statusline cache is optional. Its original timestamp determines freshness, never the read time.
  if (process.env.CLAUDE_USAGE_CACHE_FILE) {
    const file = process.env.CLAUDE_USAGE_CACHE_FILE;
    const modified = (await stat(file)).mtimeMs;
    if (Date.now() - modified < REFRESH_MS) return claudeSnapshot(await jsonFile(file), plan, modified);
  }
  if (!auth?.accessToken) throw new UsageError("Sign in to Claude Code on the server to connect your subscription.", plan);
  try {
    return claudeSnapshot(await request("https://api.anthropic.com/api/oauth/usage", auth.accessToken), plan);
  } catch (error) {
    if (error instanceof UsageError) error.plan = plan;
    throw error;
  }
};

/** Use the installed desktop CLI on Windows, where an older npm shim may not support app-server. */
async function codexBinary() {
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const root = join(process.env.LOCALAPPDATA, "OpenAI", "Codex", "bin");
    try {
      const candidates = await Promise.all((await readdir(root)).map(async (dir) => {
        const path = join(root, dir, "codex.exe");
        try { return { path, time: (await stat(path)).mtimeMs }; } catch { return null; }
      }));
      const newest = candidates.filter((c) => c !== null).sort((a, b) => b.time - a.time)[0];
      if (newest) return newest.path;
    } catch {}
  }
  return "codex";
}

/** A short-lived, read-only app-server client. No threads, inference, login, or approvals are created. */
export async function readCodexRpc(binary?: string): Promise<{ account: any; limits: any }> {
  binary ??= await codexBinary();
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["app-server"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const lines = createInterface({ input: child.stdout });
    const responses = new Map<number, any>();
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      lines.close();
      child.stdin.end();
      child.kill();
      if (error) reject(error); else resolve({ account: responses.get(1), limits: responses.get(2) });
    };
    const timer = setTimeout(() => finish(new UsageError("Codex usage check timed out. Retrying automatically.")), 20_000);
    const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`);
    child.stdin.on("error", () => finish(new UsageError("Codex app-server could not accept the usage check.")));
    child.on("error", () => finish(new UsageError("Install the Codex CLI or set CODEX_BIN to connect your subscription.")));
    child.on("exit", () => finish(new UsageError("Codex app-server stopped before returning usage.")));
    child.stderr.resume();
    lines.on("line", (line) => {
      let message: any;
      try { message = JSON.parse(line); } catch { return; }
      if (message.id == null) return;
      if (message.error) return finish(new UsageError("Codex could not read subscription limits. Check your CLI sign-in."));
      if (message.id === 0) {
        send({ method: "initialized" });
        send({ id: 1, method: "account/read", params: { refreshToken: false } });
        send({ id: 2, method: "account/rateLimits/read" });
      } else {
        responses.set(message.id, message.result);
        if (responses.has(1) && responses.has(2)) finish();
      }
    });
    send({ id: 0, method: "initialize", params: { clientInfo: { name: "xenon_usage_monitor", version: "1.0.0" } } });
  });
}

export function codexSnapshot(account: any, data: any): Snapshot {
  const buckets = data?.rateLimitsByLimitId ? Object.entries(data.rateLimitsByLimitId) : data?.rateLimits ? [[data.rateLimits.limitId ?? "codex", data.rateLimits]] : [];
  const windows: Window[] = [];
  const details = new Set<string>();
  let plan = account?.account?.planType;
  let spend: Quota["spend"];
  for (const [id, bucket] of buckets as [string, any][]) {
    plan ??= bucket?.planType;
    for (const key of ["primary", "secondary"]) {
      const w = bucket?.[key];
      if (!percent(w?.usedPercent)) continue;
      const mins = w.windowDurationMins;
      const duration = mins === 10080 ? "Weekly" : typeof mins === "number" && mins > 0 ? mins % 60 === 0 ? `${mins / 60}-hour window` : `${mins}-minute window` : key === "primary" ? "Primary window" : "Secondary window";
      windows.push({ id: `${id}:${key}`, label: buckets.length > 1 ? `${bucket.limitName ?? id} · ${duration}` : duration, used: w.usedPercent, resetsAt: timestamp(w.resetsAt) });
    }
    if (bucket?.spendControlReached) details.add("Workspace spend control reached");
    const monthly = bucket?.individualLimit;
    const amount = Number(monthly?.used), limit = Number(monthly?.limit);
    if (!spend && monthly?.used != null && monthly?.used !== "" && Number.isFinite(amount) && amount >= 0 && Number.isFinite(limit) && limit >= 0) {
      spend = { label: "Monthly credit spend", used: amount, limit, unit: "credits", usedPercent: percent(monthly.remainingPercent) ? 100 - monthly.remainingPercent : undefined, resetsAt: timestamp(monthly.resetsAt) };
    }
    if (bucket?.credits?.unlimited) details.add("Unlimited credits");
    else if (bucket?.credits?.balance != null) details.add(`Credit balance: ${bucket.credits.balance}`);
  }
  if (!windows.length) throw new UsageError("Codex has not reported subscription limits. Sign in with ChatGPT in the Codex CLI.", plan ? `${title(plan)} subscription` : undefined);
  return { plan: plan ? `${title(plan)} subscription` : "Plan not reported", windows, details: [...details], spend };
}

export const readCodex: UsageReader = async () => {
  const { account, limits } = await readCodexRpc();
  return codexSnapshot(account, limits);
};

/** Gemini's CLI quota response can also be exported by an existing local account integration. */
export function geminiSnapshot(data: any, updatedAt?: number): Snapshot {
  const tier = data?.paidTier ?? data?.currentTier ?? data?.subscription?.paidTier ?? data?.subscription?.currentTier;
  const buckets = data?.buckets ?? data?.quota?.buckets;
  const windows: Window[] = Array.isArray(buckets) ? buckets.flatMap((b: any, index: number) => {
    const remaining = b.remainingFraction;
    if (typeof remaining !== "number" || !Number.isFinite(remaining) || remaining < 0 || remaining > 1) return [];
    return [{ id: `${b.modelId ?? "quota"}:${b.tokenType ?? "requests"}:${index}`, label: [b.modelId ?? "Requests", b.tokenType].filter(Boolean).join(" · "), used: (1 - remaining) * 100, resetsAt: timestamp(b.resetTime) }];
  }) : [];
  if (!windows.length) throw new UsageError("Gemini has not reported subscription limits for this account.", tier?.name ?? tier?.id);
  return { plan: tier?.name ?? tier?.id ?? "Plan not reported", windows, updatedAt };
}

export const readGemini: UsageReader = async () => {
  const path = process.env.GEMINI_USAGE_CACHE_FILE;
  if (path) {
    const modified = (await stat(path)).mtimeMs;
    return geminiSnapshot(await jsonFile(path), modified);
  }
  let credentials: any;
  for (const config of await configDirectories("Gemini")) {
    try {
      const candidate = await jsonFile(join(config, "oauth_creds.json"));
      credentials ??= candidate;
      if (candidate?.access_token && (!candidate.expiry_date || candidate.expiry_date > Date.now())) { credentials = candidate; break; }
    } catch {}
  }
  if (!credentials?.access_token) throw new UsageError("Sign in to Gemini CLI on the server to connect your subscription.");
  if (credentials.expiry_date && credentials.expiry_date < Date.now()) throw new UsageError("Sign in again in Gemini CLI to refresh your account connection.");
  const endpoint = "https://cloudcode-pa.googleapis.com/v1internal:";
  const project = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT_ID;
  const subscription = await request(`${endpoint}loadCodeAssist`, credentials.access_token, {
    ...(project ? { cloudaicompanionProject: project } : {}), metadata: { ideType: "IDE_UNSPECIFIED" },
  });
  const resolvedProject = subscription.cloudaicompanionProject ?? project;
  if (!resolvedProject) throw new UsageError("Gemini did not return a Code Assist project. This account may not expose CLI subscription quotas.", subscription.paidTier?.name ?? subscription.currentTier?.name);
  const quota = await request(`${endpoint}retrieveUserQuota`, credentials.access_token, { project: resolvedProject });
  return geminiSnapshot({ ...quota, subscription });
};

export function createSubscriptionMonitor(emit: Emit, readers: Record<Provider, UsageReader> = { Claude: readClaude, Codex: readCodex, Gemini: readGemini }, now = Date.now, cacheFile?: string) {
  const histories = new Map<string, { reset?: number; values: number[] }>();
  const retryAt = new Map<Provider, number>();
  const rows = new Map<Provider, Quota[]>(Object.keys(readers).map((provider) => [provider as Provider, [{ name: provider, provider: provider as Provider, sub: "Checking subscription…", reset: "", segments: [], daily: [], status: "loading" }]]));
  let timer: ReturnType<typeof setInterval> | undefined;
  let inFlight: Promise<void> | undefined;
  let stopped = false;
  const restore = async () => {
    if (!cacheFile) return;
    try {
      if ((await stat(cacheFile)).size > 1_000_000) return;
      const cached = await jsonFile(cacheFile);
      if (!Array.isArray(cached)) return;
      for (const provider of Object.keys(readers) as Provider[]) {
        const saved = cached.filter((q: any) => q.provider === provider && typeof q.name === "string" && typeof q.sub === "string" &&
          typeof q.updatedAt === "number" && q.updatedAt <= now() && now() - q.updatedAt < 7 * 86400_000 &&
          Array.isArray(q.segments) && q.segments.length > 0 && q.segments.every((s: any) => percent(s.value) && typeof s.label === "string" && /^#[\da-f]{6}$/i.test(s.color)) &&
          Array.isArray(q.daily) && q.daily.every(percent));
        if (!saved.length) continue;
        rows.set(provider, saved.map((q: Quota) => ({ ...q, status: "stale", message: "Restored last known usage. Checking for an update." })));
        for (const q of saved as Quota[]) histories.set(q.name, { reset: q.resetsAt, values: q.daily.slice(-30) });
      }
      emit({ topic: "quotas" });
    } catch {} // A missing or partial cache never prevents a fresh provider check.
  };
  const persist = async () => {
    if (!cacheFile) return;
    try {
      await mkdir(dirname(cacheFile), { recursive: true });
      const temporary = `${cacheFile}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify([...rows.values()].flat().filter((q) => q.updatedAt)), { mode: 0o600 });
      await rename(temporary, cacheFile);
    } catch {} // Persistence is best effort; the live readings remain usable.
  };
  const refresh = () => {
    if (inFlight) return inFlight;
    inFlight = Promise.all((Object.keys(readers) as Provider[]).map(async (provider) => {
      if (now() < (retryAt.get(provider) ?? 0)) return;
      try {
        const snapshot = await readers[provider]();
        if (!snapshot.windows.length || snapshot.windows.some((w) => !percent(w.used))) throw new UsageError("The provider did not return valid usage windows.");
        const updatedAt = snapshot.updatedAt ?? now();
        if (!Number.isFinite(updatedAt) || updatedAt > now() + REFRESH_MS) throw new UsageError("Usage source returned an invalid update time.");
        retryAt.delete(provider);
        rows.set(provider, snapshot.windows.map((w) => {
          const id = `${provider}:${w.id}`;
          const history = histories.get(id);
          // Providers can reconstruct reset timestamps with small rounding/clock differences.
          // Only a genuinely new window should clear its usage graph.
          const sameWindow = history && (history.reset === w.resetsAt ||
            (history.reset !== undefined && w.resetsAt !== undefined && Math.abs(history.reset - w.resetsAt) < REFRESH_MS));
          const values = sameWindow ? history.values : [];
          values.push(w.used);
          if (values.length > 30) values.shift();
          histories.set(id, { reset: w.resetsAt, values });
          return { name: id, provider, window: w.label, sub: snapshot.plan, status: now() - updatedAt > REFRESH_MS * 2 ? "stale" : "live", updatedAt, resetsAt: w.resetsAt, reset: "", segments: [{ label: "Used", value: w.used, color: w.used >= 90 ? "#ff8f86" : w.used >= 70 ? "#f0c889" : "#9ecbff" }], daily: values.slice(), details: snapshot.details, spend: snapshot.spend };
        }));
      } catch (error) {
        if (error instanceof UsageError && error.retryAfterMs) retryAt.set(provider, now() + error.retryAfterMs);
        const message = error instanceof UsageError ? error.message : "Usage is temporarily unavailable. Retrying automatically.";
        const previous = rows.get(provider) ?? [];
        rows.set(provider, previous.some((q) => q.updatedAt) ? previous.map((q) => ({ ...q, status: "stale", message })) : [{ name: provider, provider, sub: error instanceof UsageError && error.plan ? error.plan : "Subscription unavailable", reset: "", segments: [], daily: [], status: "unavailable", message }]);
      }
      if (!stopped) emit({ topic: "quotas" });
    })).then(persist).finally(() => { inFlight = undefined; });
    return inFlight;
  };
  return {
    quotas: () => [...rows.values()].flat(),
    refresh,
    restore,
    start() { stopped = false; clearInterval(timer); void restore().then(() => { if (!stopped) void refresh(); }); timer = setInterval(() => void refresh(), REFRESH_MS); },
    stop() { stopped = true; clearInterval(timer); },
  };
}
