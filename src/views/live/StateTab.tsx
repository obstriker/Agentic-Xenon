import { agentLimits, usd, type Agent } from "../../data";
import type { PlanStep } from "../../ui-xenon/agent-plan";
import { StatusPill } from "../../StatusPill";
import { Button } from "../../ui/button";
import { NumberTicker } from "../../ui/number-ticker";
import { ThinkingLoader } from "../../ui/thinking-loader";
import { LimitMeter } from "../../ui-xenon/limit-meter";
import { costOf, progressOf, statusOf, stepsSinceSeed } from "./plan";

const money = new Intl.NumberFormat("en-US", usd);
const formatMoney = (n: number) => money.format(n);

// Sample growth per step finished since the page loaded
const TOKENS_PER_STEP = 6_000;
const CALLS_PER_STEP = 14;

type Props = { agent: Agent; steps: PlanStep[]; onNeeds: () => void };

export function StateTab({ agent, steps, onNeeds }: Props) {
  const status = statusOf(agent, steps);
  const waiting = status === "waiting";
  const done = steps.filter((s) => s.status === "done").length;
  const limits = agentLimits[agent.name];
  const grown = stepsSinceSeed(agent, steps);
  const spend = costOf(agent, steps);

  return (
    <div className="tabBody">
      <header className="tabHead">
        <h2>Run state</h2>
        <StatusPill status={status} label={waiting ? "NEEDS YOU" : status === "done" ? "COMPLETE" : "IN PROGRESS"} />
      </header>

      <div className="stateGrid">
        <article className="stat">
          <small>Progress</small>
          <b>
            <NumberTicker value={progressOf(agent, steps)} />%
          </b>
          <div className="track">
            <div style={{ width: `${progressOf(agent, steps)}%` }} />
          </div>
        </article>
        <article className="stat">
          <small>Spend</small>
          <b>
            <NumberTicker value={spend} format={usd} />
          </b>
        </article>
        <article className="stat">
          <small>Steps done</small>
          <b>
            <NumberTicker value={done} />
            <span className="statOf"> / {steps.length}</span>
          </b>
        </article>
      </div>

      <section className="stateNow">
        <div className="eyebrow">{status === "done" ? "RUN COMPLETE" : "RIGHT NOW"}</div>
        <h3>{status === "done" ? "All steps finished" : agent.step}</h3>
        {waiting ? (
          <p>The agent is paused until you answer.</p>
        ) : status === "done" ? (
          <p>Every step in the plan is done.</p>
        ) : (
          <ThinkingLoader variant="plain" phases={["Working on this step"]} />
        )}
        {waiting && (
          <Button size="lg" onClick={onNeeds} iconRight={<span aria-hidden="true">↗</span>}>
            Human decisions
          </Button>
        )}
      </section>

      <section className="limitsPanel" aria-label="Limits">
        <div className="eyebrow">LIMITS · SAMPLE DATA</div>
        <LimitMeter label="Budget" value={spend} max={limits.budget} format={formatMoney} thresholds={{ warning: 0.8, critical: 0.95 }} />
        <LimitMeter label="Context window" value={limits.context.used + grown * TOKENS_PER_STEP} max={limits.context.max} unit="tokens" />
        <LimitMeter label="Tool calls" value={limits.calls.used + grown * CALLS_PER_STEP} max={limits.calls.max} unit="calls" />
      </section>
    </div>
  );
}
