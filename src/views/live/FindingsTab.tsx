import type { Agent } from "../../data";

export function FindingsTab({ agent }: { agent: Agent }) {
  return (
    <div className="tabBody">
      <header className="tabHead">
        <h2>Research findings</h2>
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
