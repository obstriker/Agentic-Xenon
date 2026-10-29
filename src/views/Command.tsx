import { useCallback, useState } from "react";
import { usd } from "../data";
import { useBackend } from "../api/backend";
import { CliIcon } from "../CliIcon";
import { Orb, type OrbMode } from "../Orb";
import { StatusPill } from "../StatusPill";
import { Button } from "../ui/button";
import { GridBackground } from "../ui/grid-background";
import { NumberTicker } from "../ui/number-ticker";
import { ThinkingLoader } from "../ui-xenon/thinking-loader";
import type { PlanStep } from "../ui-xenon/agent-plan";
import { costOf, doneSteps, progressOf, statusOf } from "./live/plan";

type Props = {
  active: boolean;
  pending: number;
  plans: Record<string, PlanStep[]>;
  onOpenAgent: (index: number, rect: DOMRect) => void;
  onNeeds: () => void;
};

export function Command({ active, pending, plans, onOpenAgent, onNeeds }: Props) {
  const { agents } = useBackend();
  const jarvis = jarvisLines(agents, pending);
  const [mode, setMode] = useState<OrbMode>(0);
  const cycle = useCallback(() => setMode((m) => ((m + 1) % 3) as OrbMode), []);

  return (
    <section className={`view command${active ? " active" : ""}`}>
      <div className="fleet">
        <div className="heading">
          <h1>
            Command <small>· {agents.length} agents</small>
          </h1>
          <Button variant="secondary" size="lg" onClick={onNeeds} iconRight={<span aria-hidden="true">↗</span>}>
            {pending} {pending === 1 ? "decision needs" : "decisions need"} you
          </Button>
        </div>
        <div className="agentGrid">
          {agents.map((a, i) => {
            const steps = plans[a.name];
            const status = statusOf(a, steps);
            const progress = progressOf(a, steps);
            return (
              <button key={a.name} className={`agent${status === "waiting" ? " waiting" : ""}`} aria-label={`Expand ${a.name}`} onClick={(e) => onOpenAgent(i, e.currentTarget.getBoundingClientRect())}>
                <div className="ahead">
                  <h3>
                    <CliIcon kind={a.kind} state={status} />
                    <span className="n">{a.name}</span>
                  </h3>
                  <StatusPill status={status} />
                </div>
                <div className="desc">{a.desc}</div>
                <div className="minor">
                  {status === "waiting" ? (
                    <span className="stepWait">{a.step}</span>
                  ) : status === "done" ? (
                    <span className="stepDone">{steps.length ? "All steps finished" : "Idle"}</span>
                  ) : (
                    <ThinkingLoader variant="plain" size="sm" phases={[a.step]} />
                  )}
                  {steps.length > 0 && (
                    <span>
                      <NumberTicker value={progress} />%
                    </span>
                  )}
                </div>
                <div className="track">
                  <div style={{ width: `${progress}%` }} />
                </div>
                <div className="minor">
                  <span>
                    {steps.length ? `${doneSteps(steps)} / ${steps.length} tasks` : ""}
                  </span>
                  {costOf(a, steps) > 0 && <NumberTicker value={costOf(a, steps)} format={usd} />}
                </div>
                <span className="hint" aria-hidden="true">
                  ↗
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <GridBackground className="jarvis" size={36} speed={10} fade={80}>
        <div className="jarvisInner">
          <div className="topline">
            <span className="label">JARVIS · COORDINATOR</span>
            {mode === 0 && <span className="orbStatus">● AVAILABLE</span>}
            {mode === 1 && <ThinkingLoader key="listen" variant="plain" size="sm" phases={["Listening"]} />}
            {mode === 2 && <ThinkingLoader key="brief" size="sm" phases={["Checking agents", "Reading quotas", "Writing briefing"]} interval={1500} />}
          </div>
          <Orb mode={mode} onActivate={cycle} />
          <div className="jbottom">
            <h2>{jarvis[mode].title}</h2>
            <p>{jarvis[mode].text}</p>
            <div className="jbuttons">
              <Button variant="secondary" size="lg" onClick={() => setMode(2)}>
                Brief me
              </Button>
              <Button size="lg" onClick={cycle}>
                Speak to Jarvis
              </Button>
            </div>
          </div>
        </div>
      </GridBackground>
    </section>
  );
}

/** What the coordinator says, from the agents as they are right now */
const jarvisLines = (agents: { status: string }[], pending: number) => {
  const working = agents.filter((a) => a.status === "working").length;
  const waiting = agents.filter((a) => a.status === "waiting").length;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return [
    { title: working ? "Work is in motion." : "All quiet.", text: `${plural(working, "agent")} working, ${waiting} waiting for you. Tap for a simulated conversation.` },
    { title: "I’m listening.", text: "This is an interactive voice visualization demo. Tap again for a briefing." },
    { title: "Here’s your briefing.", text: `${plural(agents.length, "agent")} in herdr: ${working} working, ${agents.length - working - waiting} idle, ${waiting} blocked. ${plural(pending, "decision")} waiting for you.` },
  ];
};
