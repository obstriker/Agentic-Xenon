import { execFile } from "node:child_process";
import { createApp } from "./app.ts";
import { openDb } from "./db.ts";
import { createHerdr } from "./herdr.ts";
import { createSim } from "./sim.ts";

const port = Number(process.env.PORT ?? 8787);

/** RUNTIME=herdr | sim. Unset: herdr when its CLI answers, otherwise the simulator. */
const herdrWorks = () => new Promise<boolean>((resolve) => execFile("herdr", ["agent", "list"], { timeout: 5000 }, (err) => resolve(!err)));
const choice = process.env.RUNTIME ?? ((await herdrWorks()) ? "herdr" : "sim");

const { server, runtime } = createApp((emit) => (choice === "herdr" ? createHerdr(emit) : createSim(openDb(), emit)));
runtime.start();
server.listen(port, () => console.log(`Xenon API on http://localhost:${port}  (runtime: ${runtime.name})`));
process.on("SIGINT", () => {
  runtime.stop();
  server.close(() => process.exit(0));
});
