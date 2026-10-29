# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Xenon Edge

Target display: Corsair Xeneon Edge, 2560×720 touch bar. Design at 1920×540 logical (same 32:9 ratio). Touch first: no hover, targets 48px or larger, no scrolling.

## Commands

```
npm install          # install deps from package-lock.json
npm run api          # API server on :8787 (node server/index.ts, Node 22 strips types)
npm run dev          # Vite dev server on :5173, proxies /api to :8787
npm run build        # tsc --noEmit && vite build (typecheck covers src/ and shared/ only)
npm run preview      # serve dist/
npm run seed         # regenerate server/seed.json from src/data.ts
```

- There is no test runner and no lint script. Don't invent one; verify changes with `npm run build` and by exercising the running app.
- Env for the API: `PORT`, `RUNTIME=herdr|sim` (unset = herdr if `herdr agent list` works, else sim), `DB_FILE` (sim), `HERDR_DB_FILE` (herdr notes and answers).
- To reach the app from another machine over Tailscale, run Vite with `--host 0.0.0.0`. There is no auth; see Known gaps in `ARCHITECTURE.md`.

## Architecture

Read `ARCHITECTURE.md` first; it covers the layers, the runtime split and the known gaps. The parts that need several files to see:

- **Three layers, one contract.** `shared/contract.ts` defines every route and wire shape. `server/` implements them, `src/api/` consumes them, and `src/views/` renders them. Views never call `fetch` directly; they go through `useBackend()` in `src/api/backend.tsx`.
- **Live updates.** The server pushes `change` events on `GET /api/events` (from `server/app.ts`). Hooks in `src/api/hooks.tsx` refetch the matching resource. A change in the data means touching the server route, the contract, and the hook together.
- **Runtime seam.** `server/app.ts` only talks to the `Runtime` interface in `server/runtime.ts`. `server/herdr.ts` drives live agents through the herdr CLI and keeps its own notes in `server/herdr.db`. `server/sim.ts` plus `server/engine.ts` is the simulated engine on SQLite. Features that herdr cannot supply (plan steps, spend, ledger) are empty under herdr, not faked.
- **Presentational UI.** `src/ui/` and `src/ui-xenon/` take data and callbacks as props and import nothing from `api/`, `views/` or `data.ts`. Keep it that way.
- **Sample data.** `src/data.ts` still holds static graph and coordinator data; `server/seed.json` is the seeded source for the server.

## Design review

Every app design or UI change goes through the design review partner (`design-review` skill) before it is called done.

- Take a screenshot of the rendered screen at the Edge size (2560×720) and give it to the reviewer. Code alone is not enough.
- Review each changed view, not just the main page.
- Fix what the reviewer flags, then take a new screenshot and review again.
- Report the reviewer's findings and the final screenshot path in the handoff.
