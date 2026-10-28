import type { Agent } from "../../../shared/contract";
import { useBackend } from "../../api/backend";
import { CliIcon } from "../../CliIcon";
import { StatusPill } from "../../StatusPill";
import type { PlanStep } from "../../ui-xenon/agent-plan";
import { statusOf } from "./plan";
import type { Run } from "./useSteering";

type Props = {
  agent: Agent;
  plans: Record<string, PlanStep[]>;
  runs: Record<string, Run>;
  /** A tile was tapped: the agent it belongs to becomes the chosen one */
  onChoose: (index: number) => void;
};

const LABEL = { working: "WORKING", waiting: "NEEDS YOU", done: "IDLE" } as const;

/**
 * The team as touch tiles that always fit the screen: the grid divides the height between the rows, so there is
 * nothing to scroll. Tap a tile to pick that agent.
 */
export function TeamTab({ agent, plans, runs, onChoose }: Props) {
  const { agents } = useBackend();
  const count = (s: Agent["status"]) => agents.filter((a) => a.status === s).length;

  return (
    <div className="teamFit">
      <header className="teamHead">
        <b>Team</b>
        <span>
          {agents.length} agents · {count("working")} working · {count("waiting")} need you
        </span>
      </header>
      <div className="teamGrid">
        {agents.map((a, i) => {
          const status = statusOf(a, plans[a.name] ?? []);
          const run = runs[a.name];
          return (
            <button key={a.id} className={`teamTile${status === "waiting" ? " waiting" : ""}`} aria-pressed={a.name === agent.name} onClick={() => onChoose(i)}>
              <h3>
                <CliIcon kind={a.kind} state={status} />
                <span className="n">{a.name}</span>
              </h3>
              <p>{a.step}</p>
              <div className="row">
                <StatusPill status={status} label={run?.status === "paused" ? "HELD" : LABEL[status]} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
