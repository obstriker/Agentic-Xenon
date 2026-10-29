# Xenon Edge architecture

Three layers. Each only knows the one below it.

```
views/        screens: Command, Needs, Live, Monitor      (pick data, wire actions)
  ↓ hooks
api/          Api interface, HTTP client, useResource hooks   (src/api)
  ↓ contract
shared/       contract.ts: every shape on the wire        (server + app)
server/       Node + SQLite: store, run engine, routes
```

`src/ui` and `src/ui-xenon` import nothing from `data.ts`, `views/` or `api/`. They take data and callbacks as props, so they stay reusable.

## Components (presentational, no backend knowledge)

| Component | Takes | Emits |
| --- | --- | --- |
| `AgentPlan` | `steps: PlanStep[]` | `onChange(steps)` |
| `AgentSteering` | steps, queued notes, run state | queue, interrupt, pause, resume |
| `AgentLedger` | `changes: LedgerChange[]` | `onUndo(id)` |
| `ApprovalCard` | question, risk, preview, actions | `onResolve`, undo |
| `DecisionTree` | `decisions: Decision[]` | `onResolve(answer)` |
| `UsageMeter` / `LimitMeter` | segments, daily, limits | `onAction` |
| `AgentGraph` / `AgentTree` | agents, tools, links | `onSelect` |

## Logic blocks and where they live now

| Logic | Was | Now |
| --- | --- | --- |
| Run engine: steps advance, notes land, pause/resume | `views/live/useSteering.ts` (browser timer) | `server/engine.ts` (500 ms tick) |
| Plan seeding | `views/live/plan.ts` `seedPlan` | `server/db.ts` `seed()` |
| Spend and progress growth | `costOf`, `progressOf` | `server/engine.ts` writes `cost` and `progress` |
| Requests and answers | `App` `responses` state | `requests` table, `POST /api/requests/:id/answer` |
| Ledger undo cascade | `undoPlan` in `agent-ledger.tsx` | `engine.undo` (the component keeps its preview) |
| Sample data | `data.ts` | `server/seed.json` (`npm run seed` regenerates it) |
| View-only helpers (`summarizeRun`, `statusOf`) | `views/live/plan.ts` | unchanged, they present server state |

## API

`shared/contract.ts` lists every route in `routes` and every shape. Live updates: `GET /api/events` sends `change` events `{topic, agentId?}`; the hooks refetch the matching resource.

## Runtimes

The API (`server/app.ts`) talks to a `Runtime` (`server/runtime.ts`). Two exist. `RUNTIME=herdr|sim` picks one; unset means herdr when `herdr agent list` works, otherwise the simulator.

**herdr (`server/herdr.ts`)** controls the live agents in your herdr session. Herdr stays the source of truth; the server polls `herdr agent list` every second and turns changes into events.

| App concept | Herdr |
| --- | --- |
| Agent (id = pane id, e.g. `wC:p8`) | `agent list`: kind, folder, title, status |
| Status | working/unknown = working, blocked = needs you, idle/done = complete |
| Human request | an agent whose status is `blocked`. Approve = `send-keys enter`, Deny = `send-keys esc` |
| Queue a note | stored in `server/herdr.db`, sent with `agent prompt` once the agent is idle and not held |
| Interrupt | `send-keys esc` (if working), then `agent prompt` |
| Pause / resume | holds or releases our own sending. The agent itself is not touched |
| Findings tab | `agent read` of the terminal (`GET /api/agents/:id/output`) |
| Raw keys | `POST /api/agents/:id/keys` |

Not available with herdr: spend, context and call limits, and the change ledger (herdr has none). Plans come from Claude task files or terminal checklists when available. Every agent in the session can be controlled, including ones in other projects.

## Subscription usage

`server/subscriptions.ts` supplies `/api/quotas` independently of the agent runtime, including when agents are simulated. The monitor never uses the seeded quota rows. It checks Claude, Codex and Gemini once a minute, retains successful readings as explicitly stale after failures, and shows unavailable accounts without fabricated percentages. Secrets remain on the server.

- Claude: the signed-in Claude Code account's OAuth usage endpoint and locally reported subscription type. `CLAUDE_CONFIG_DIR` selects the account directory. `CLAUDE_USAGE_CACHE_FILE` optionally selects a fresh statusline usage export.
- Codex: read-only `account/read` and `account/rateLimits/read` through a short-lived `codex app-server` process. All returned limit buckets and their actual window durations are preserved. `CODEX_BIN` selects the executable; Windows also discovers the desktop app's bundled CLI.
- Gemini: the signed-in Gemini CLI account's `loadCodeAssist` and `retrieveUserQuota` responses. Model quotas describe Code Assist usage, not the entire Gemini consumer app. Availability depends on account eligibility. `GEMINI_CONFIG_DIR` selects the credentials directory; expired credentials require refreshing the CLI sign-in. `GOOGLE_CLOUD_PROJECT` or `GOOGLE_CLOUD_PROJECT_ID` can specify a Code Assist project. `GEMINI_USAGE_CACHE_FILE` can instead select a JSON export containing `buckets` and `paidTier`/`currentTier`; its file timestamp determines freshness.

On Windows, if a local Claude/Gemini credential is missing or expired and no explicit config directory was supplied, the default WSL user's config is also checked. No login or credential rewrite is performed.

Provider errors and missing fields are not treated as zero usage. Reset times come from provider timestamps and are formatted in the browser. The collector tests run with `node --experimental-strip-types --test server/subscriptions.test.ts`.

The monitor reuses `UsageMeter` with independent colour-coded windows inside each provider card. Session and weekly percentages retain their own bars, reset times and matching sparkline traces; they are never summed. Graphs share a 0–100% scale, show a point for the first real sample, and grow on subsequent polls. Small provider reset-timestamp drift does not clear history; an actual window rollover does.

Recent successful readings and graph samples persist in `~/.cache/xenon/subscription-usage.json` (`XENON_USAGE_CACHE_FILE` overrides the location). After a restart, cached data is explicitly stale until refreshed. Rate-limited providers respect `Retry-After`, with a five-minute fallback, independently of the other subscriptions.

**sim (`server/sim.ts`)** is the old simulated run engine on SQLite, for working on the UI without herdr.

## Run it

```
npm run api        # server on :8787 (runtime chosen as above)
npm run dev        # Vite on :5173, proxies /api to the server
```

Env: `PORT`, `RUNTIME`, `DB_FILE` (sim), `HERDR_DB_FILE` (herdr notes and answers).

## How the app connects

`main.tsx` wraps `<App />` in `<ApiProvider>` and `<BackendProvider>` (`src/api/backend.tsx`). The provider loads agents, plans, ledgers, steering, requests and quotas, then serves them through `useBackend()` in the shapes the views already used, plus the actions (`steering.queue`, `answer`, `undo`, `updatePlan`). While loading it shows a connecting screen; if the server is down it says so and offers Try again. Failed actions reach the toast through `onError`.

Still static in `src/data.ts` (not in the backend yet): the tool network (`graphTools`, `graphLinks`), the coordinator, and sub-agents. The old sample `agents`, `requests`, `quotas`, `ledgerSeed` and friends there are now unused except by `npm run seed`; delete them once the seed JSON is the source of truth.

To add another runtime, implement `Runtime` and return it from the factory in `server/index.ts`.

## Known gaps

- Decision-tree icons are dropped from the seed (`icon`/`icons` are not JSON). `Needs` takes the icons from `views/needs-trees.tsx` by decision id.
- `useBackend` refetches whole resources on each change event and loads plans and ledgers with one request per agent. Add bulk routes if the agent count grows.
- No auth. Add it before exposing the server beyond localhost.
- `server/` is not covered by `tsc` (no `@types/node` installed). Node strips the types at runtime.
- No automated tests yet. Routes, queueing, hold/release, interrupt and keys were exercised by hand with curl against a disposable herdr agent. The blocked-agent approval flow was not.
- With herdr, some labels still say "research agents", "tasks" and "working" for every agent.
