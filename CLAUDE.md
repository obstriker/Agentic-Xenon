# Xenon Edge

Target display: Corsair Xeneon Edge, 2560×720 touch bar. Design at 1920×540 logical (same 32:9 ratio). Touch first: no hover, targets 48px or larger, no scrolling.

## Design review

Every app design or UI change goes through the design review partner (`design-review` skill) before it is called done.

- Take a screenshot of the rendered screen at the Edge size (2560×720) and give it to the reviewer. Code alone is not enough.
- Review each changed view, not just the main page.
- Fix what the reviewer flags, then take a new screenshot and review again.
- Report the reviewer's findings and the final screenshot path in the handoff.

## Commands

```bash
npm run dev       # vite dev server (polling file watch, needed on WSL + /mnt/c)
npm run build     # tsc --noEmit && vite build
npx vite build -c vite.hosted.config.ts   # single-file hosted build of alternatives.html -> dist-hosted/
```
