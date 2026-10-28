import type { Agent } from "../../../shared/contract";
import { useEffect } from "react";
import { useResource } from "../../api/hooks";

/** Terminal chrome that says nothing about the work: rules, prompts and status bars */
const NOISE = /^[\s─━═╭╮╰╯│┌┐└┘├┤▔▁]+$|^\s*(❯|>)\s*$|auto mode|shift\+tab|ctrl\+o to expand|^\s*[📁🌿].*\|/;

type Finding = { kind: "tool" | "note"; title: string; body: string };

/**
 * Cuts recent terminal output into cards. Claude-style output marks each step with a bullet, other CLIs
 * separate paragraphs with blank lines. Tool calls like `Bash(...)` become tool cards; the rest are notes.
 */
function toFindings(text: string): Finding[] {
  const blocks: string[][] = [];
  for (const raw of text.split("\n")) {
    if (NOISE.test(raw)) continue;
    const line = raw.replace(/\s+$/, "");
    if (/^\s*[●•]\s/.test(line) || (!blocks.length && line.trim())) blocks.push([line.replace(/^\s*[●•]\s?/, "")]);
    else if (!line.trim()) blocks.push([]);
    else (blocks[blocks.length - 1] ??= []).push(line.replace(/^\s*⎿\s?/, "").trim());
  }
  return blocks
    .map((b) => b.filter((l) => l.trim()))
    .filter((b) => b.length)
    .map((b): Finding => {
      const tool = /^(\w[\w.-]*)\((.*)/.exec(b[0]);
      return tool
        ? { kind: "tool", title: tool[1], body: [tool[2].replace(/\)\s*$/, ""), ...b.slice(1)].join("\n") }
        : { kind: "note", title: b[0], body: b.slice(1).join("\n") };
    })
    .slice(-12)
    .reverse();
}

/** Agents without findings of their own (live herdr agents) show what their terminal says, as cards, newest first */
function Output({ agent }: { agent: Agent }) {
  const out = useResource((api) => api.output(agent.id, 120), (e) => e.topic === "agents" && e.agentId === agent.id, [agent.id]);
  // The terminal changes without a state change, so look again every few seconds
  useEffect(() => {
    const id = window.setInterval(() => void out.refetch(), 3000);
    return () => window.clearInterval(id);
  }, [out.refetch]);
  const items = out.data ? toFindings(out.data) : [];
  return (
    <div className="tabBody">
      <header className="tabHead">
        <h2>Latest activity</h2>
        <span className="tabCount">{items.length}</span>
      </header>
      {out.error && <p>{out.error.message}</p>}
      {!out.data && !out.error && <p>Reading the terminal…</p>}
      {out.data && items.length === 0 && <p>Nothing on screen yet.</p>}
      <ol className="findings">
        {items.map((f, i) => (
          <li key={`${i}-${f.title}`} className="findingCard">
            <span className="findingNo" aria-hidden="true">
              {f.kind === "tool" ? "›_" : "•"}
            </span>
            <div className="findingBody">
              <h3>{f.title}</h3>
              {f.body && <p style={{ whiteSpace: "pre-wrap", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{f.body}</p>}
            </div>
            <span className="findingChip">{f.kind === "tool" ? "Tool call" : "Note"}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function FindingsTab({ agent }: { agent: Agent }) {
  if (agent.findings.length === 0) return <Output agent={agent} />;
  return (
    <div className="tabBody">
      <header className="tabHead">
        <h2>Findings</h2>
        <span className="tabCount">{agent.findings.length}</span>
      </header>
      <ol className="findings">
        {agent.findings.map((f, i) => (
          <li key={f} className="findingCard">
            <span className="findingNo" aria-hidden="true">
              {i + 1}
            </span>
            <div className="findingBody">
              <h3>{f}</h3>
              <p>Research note · illustrative evidence summary, awaiting verified source citations.</p>
            </div>
            <span className="findingChip">Awaiting citations</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
