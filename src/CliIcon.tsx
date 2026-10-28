/**
 * The mark of the CLI an agent runs in. The logos are the monochrome SVGs in src/assets/cli (see LICENSE.md there),
 * drawn in `currentColor` so the state colouring works. pi has no published logo and gets a π. The omp mark is the glyph of its own favicon (omp.sh), without the gradient and tile.
 */
const LOGOS = import.meta.glob("./assets/cli/*.svg", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const logo = (kind: string) => LOGOS[`./assets/cli/${kind}.svg`];

/** The colour a mark takes when it is lit. Close to each brand's own colour; unknown CLIs use a neutral blue-grey. */
const BRAND: Record<string, string> = {
  claude: "#e08a63", codex: "#7f9cff", gemini: "#6ea0ff", cursor: "#e8ecf2", devin: "#3ecf9f", cline: "#e8ecf2", opencode: "#e8ecf2",
  copilot: "#b18cff", kimi: "#4a9bff", kiro: "#a574ff", amp: "#ff6b57", grok: "#e8ecf2", hermes: "#d6c27a", kilo: "#f2e86b",
  qoder: "#3fd69a", qwen: "#8a85ff", muse: "#ff8fc0", agy: "#6ea0ff", mastracode: "#e8ecf2", omp: "#b06cff", pi: "#b9a7f5",
};

const PI = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 8h14M9 8v10M15 8v7a3 3 0 0 0 3 3" />
  </svg>
);

/** working: pulses between no colour and full colour. waiting: full colour. anything else: no colour. */
export type CliState = "working" | "waiting" | "done";

export function CliIcon({ kind, state = "done", size = 22 }: { kind?: string; state?: CliState; size?: number }) {
  const svg = kind ? logo(kind) : undefined;
  return (
    <span
      className="cliIcon"
      data-state={state}
      role="img"
      aria-label={kind ? `${kind} CLI` : "Agent"}
      title={kind}
      style={{ width: size, height: size, ["--c" as string]: (kind && BRAND[kind]) || "#9fb2c8" }}
    >
      {svg ? <span className="cliLogo" dangerouslySetInnerHTML={{ __html: svg }} /> : kind === "omp" || kind === "pi" ? PI : <b>{(kind?.[0] ?? "•").toUpperCase()}</b>}
    </span>
  );
}
