import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AgentSteering, type SteerNote, type SteerStep } from "./ui-xenon/agent-steering";

// Standalone preview of the Agent Steering card in each of its states. Open /steering.html in the dev server.
const now = Date.now();
const titles = ["Read schema and 14 migrations", "Plan the split into accounts and profiles", "Write migration 0042_split_users", "Dry run on staging", "Open a pull request for review"];
const make = (done: number, active: boolean, notes: Record<number, SteerNote[]> = {}): SteerStep[] =>
  titles.map((title, i) => ({
    id: `s${i}`,
    title,
    status: i < done ? "done" : i === done && active ? "active" : "pending",
    duration: i < done ? [1400, 4600, 5200, 2600, 1800][i] : undefined,
    startedAt: i === done && active ? now - 2400 : undefined,
    notes: notes[i],
  }));

function Live() {
  const [queue, setQueue] = useState<SteerNote[]>([]);
  return (
    <AgentSteering
      title="Migrate users table"
      agent="Opus 5.5"
      status="running"
      startedAt={now - 128000}
      steps={make(1, true)}
      queue={queue}
      onQueue={(text) => setQueue((q) => [...q, { id: String(q.length), text }])}
      onInterrupt={(text, id) => setQueue((q) => q.filter((n) => n.id !== id))}
      onRemove={(id) => setQueue((q) => q.filter((n) => n.id !== id))}
    />
  );
}

const Label = ({ children }: { children: string }) => <h3 style={{ margin: "0 0 10px", fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase", color: "#8f8f98", fontWeight: 600 }}>{children}</h3>;

function Page() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))", gap: 36, alignItems: "start", maxWidth: 1500 }}>
      <div>
        <Label>Running · type a note and press Enter</Label>
        <Live />
      </div>
      <div>
        <Label>Note queued for the next step</Label>
        <AgentSteering
          title="Migrate users table"
          agent="Opus 5.5"
          status="running"
          startedAt={now - 130000}
          steps={make(1, true)}
          queue={[{ id: "q1", text: "Use Postgres 16 syntax – prod isn't on 17 yet" }]}
        />
      </div>
      <div>
        <Label>Notes picked up and interrupted</Label>
        <AgentSteering
          title="Migrate users table"
          agent="Opus 5.5"
          status="running"
          startedAt={now - 138000}
          steps={make(2, true, { 2: [{ id: "n1", text: "Use Postgres 16 syntax – prod isn't on 17 yet", picked: "next" }, { id: "n2", text: "Keep the old users view for a week", picked: "now" }] })}
        />
      </div>
      <div>
        <Label>Paused</Label>
        <AgentSteering title="Migrate users table" agent="Opus 5.5" status="paused" startedAt={now - 150000} steps={make(3, true)} />
      </div>
      <div>
        <Label>Finished</Label>
        <AgentSteering title="Migrate users table" agent="Opus 5.5" status="done" startedAt={now - 140000} finishedAt={now} steps={make(5, false)} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Page />);
