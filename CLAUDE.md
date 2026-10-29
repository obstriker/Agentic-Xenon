# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # vite dev server (polling file watch, needed on WSL + /mnt/c)
npm run build     # tsc --noEmit && vite build  (type-check gates the build)
npx vite build -c vite.hosted.config.ts   # single-file hosted build -> dist-hosted/ (app.js + app.css)
```

No test runner or linter is configured. `tsc --noEmit` is the only static check.

## Architecture

Xenon Edge: a React 19 + Vite + TypeScript UI prototype (a "command center" for supervising research agents). Everything runs on static sample data from `src/data.ts` — there is no backend.

**Multiple HTML entry points, one codebase.** Each root `*.html` is a separate Vite page mounting its own entry in `src/`:
- `index.html` → `src/main.tsx` → `App.tsx`: the full app with four views (`command`, `needs`, `live`, `monitor`) in `src/views/`.
- `alternatives.html`, `steering.html`, `tree.html`, `decisions.html` → `*-preview.tsx` / `alternatives.tsx`: standalone preview pages that showcase individual widgets with variants (default / light / Spanish) defined in `src/preview-config.ts`. Only `index.html` and `alternatives.html` are in the default build inputs; the others are served by the dev server only.
- `xenon_edge_v7.html` is the older vanilla-JS single-file version (reference, not built). `deepseek_tsx_*.tsx` at the root are scratch inputs, not part of the build.

**Component layers:**
- `src/ui-xenon/` — Xenon-specific widgets (agent tree/graph/plan/steering/ledger, decision-tree, approval-card, meters). These are meant to be themeable and configurable (colours and labels via props), which is why the preview pages exist.
- `src/ui/` — generic primitives vendored from affectui (see `LICENSE-affectui`).
- `src/views/` — screen compositions; `views/live/` holds the run plan seed and `useSteering` hook, `views/needs-trees.tsx` supplies decision trees consumed by `data.ts`.
- `App.tsx` owns top-level view state, the nav rail, and the `AgentExpander` overlay; `motion.ts` holds shared animation helpers.

**Hosted build:** `vite.hosted.config.ts` builds `alternatives.html` as an IIFE bundle with no chunks, for embedding/hosting as one script + one stylesheet.

## Notes

- Sibling repo `../agent-CNC` is the earlier iteration (adds a `server/` directory (engine, db) and an `ARCHITECTURE.md`); this repo is the UI-only redesign and has no shared code with it.
- `dist/` and `dist-hosted/` are gitignored build output.
