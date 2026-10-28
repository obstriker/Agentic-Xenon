import { useCallback, useState } from "react";
import { agents, usd } from "../data";
import { Orb, type OrbMode } from "../Orb";
import { StatusPill } from "../StatusPill";
import { Button } from "../ui/button";
import { GridBackground } from "../ui/grid-background";
import { NumberTicker } from "../ui/number-ticker";
import { ThinkingLoader } from "../ui/thinking-loader";
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
  const [mode, setMode] = useState<OrbMode>(0);
  const cycle = useCallback(() => setMode((m) => ((m + 1) % 3) as OrbMode), []);

  return (
    <section className={`view command${active ? " active" : ""}`}>
      <div className="fleet">
        <div className="heading">
          <h1>
            Command <small>· {agents.length} research agents</small>
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
                  <h3>{a.name}</h3>
                  <StatusPill status={status} />
                </div>
                <div className="desc">{a.desc}</div>
                <div className="minor">
                  {status === "waiting" ? (
                    <span className="stepWait">{a.step}</span>
                  ) : status === "done" ? (
                    <span className="stepDone">All steps finished</span>
                  ) : (
                    <ThinkingLoader variant="plain" phases={[a.step]} />
                  )}
                  <span>
                    <NumberTicker value={progress} />%
                  </span>
                </div>
                <div className="track">
                  <div style={{ width: `${progress}%` }} />
                </div>
                <div className="minor">
                  <span>
                    {doneSteps(steps)} / {steps.length} tasks
                  </span>
                  <NumberTicker value={costOf(a, steps)} format={usd} />
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
            {mode === 1 && <ThinkingLoader key="listen" size="sm" phases={["Listening"]} />}
            {mode === 2 && <ThinkingLoader key="brief" size="sm" phases={["Checking agents", "Reading quotas", "Writing briefing"]} interval={1500} />}
          </div>
          <Orb mode={mode} onActivate={cycle} />
          <div className="jbottom">
            <h2>{JARVIS[mode].title}</h2>
            <p>{JARVIS[mode].text}</p>
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

const JARVIS = [
  { title: "Everything is in motion.", text: "Four agents researching. Two awaiting input. Tap for a simulated conversation." },
  { title: "I’m listening.", text: "This is an interactive voice visualization demo. Tap again for a briefing." },
  { title: "Here’s your briefing.", text: "Research is advancing. Two agents are waiting for decisions; Codex is nearing its quota." },
];
