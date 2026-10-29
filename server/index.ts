import { execFile } from "node:child_process";
import { createApp } from "./app.ts";
import { openDb } from "./db.ts";
import { createHerdr } from "./herdr.ts";
import { createSim } from "./sim.ts";
import { createSubscriptionMonitor } from "./subscriptions.ts";
import { homedir } from "node:os";
import { join } from "node:path";

const port = Number(process.env.PORT ?? 8787);

/** RUNTIME=herdr | sim. Unset: herdr when its CLI answers, otherwise the simulator. */
const herdrWorks = () => new Promise<boolean>((resolve) => execFile("herdr", ["agent", "list"], { timeout: 5000 }, (err) => resolve(!err)));
const choice = process.env.RUNTIME ?? ((await herdrWorks()) ? "herdr" : "sim");

const { server, runtime } = createApp((emit) => {
  const agents = choice === "herdr" ? createHerdr(emit) : createSim(openDb(), emit);
  // Subscription usage belongs to the signed-in accounts, independently of the agent runtime.
  const subscriptions = createSubscriptionMonitor(emit, undefined, undefined,
    process.env.XENON_USAGE_CACHE_FILE ?? join(homedir(), ".cache", "xenon", "subscription-usage.json"));
  return {
    ...agents,
    quotas: subscriptions.quotas,
    start() { agents.start(); subscriptions.start(); },
    stop() { agents.stop(); subscriptions.stop(); },
  };
});
runtime.start();
server.listen(port, () => console.log(`Xenon API on http://localhost:${port}  (runtime: ${runtime.name})`));
process.on("SIGINT", () => {
  runtime.stop();
  server.close(() => process.exit(0));
});
