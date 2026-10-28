// Evaluates the sample data in src/data.ts (bundled with Vite's own bundler) and writes it to server/seed.json
import fs from "node:fs";
import { rolldown } from "rolldown";

const STUB = "\0icons-stub";
const bundle = await rolldown({
  input: "src/data.ts",
  external: ["react", "react/jsx-runtime"],
  plugins: [
    {
      name: "icons-stub",
      resolveId: (id) => (id.endsWith("ui-xenon/decision-tree") ? STUB : null),
      load: (id) => (id === STUB ? "export const Icons = new Proxy({}, { get: () => () => null });" : null),
    },
  ],
});
const { output } = await bundle.generate({ format: "esm" });
const tmp = "scripts/.seed-bundle.mjs";
fs.writeFileSync(tmp, output[0].code);
const d = await import(`../${tmp}`);
fs.rmSync(tmp);

const seed = { agents: d.agents, taskMeta: d.taskMeta, requests: d.requests, quotas: d.quotas, ledger: d.ledgerSeed, limits: d.agentLimits, models: d.agentModels };
const drop = (k, v) => (k === "icon" || k === "icons" ? undefined : v);
fs.writeFileSync("server/seed.json", JSON.stringify(seed, drop, 1));
console.log("seed.json:", Object.entries(seed).map(([k, v]) => `${k}=${Array.isArray(v) ? v.length : Object.keys(v).length}`).join(" "));
