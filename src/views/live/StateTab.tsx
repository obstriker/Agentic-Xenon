import { usd } from "../../data";
import type { Agent } from "../../../shared/contract";
import type { PlanStep } from "../../ui-xenon/agent-plan";
import { StatusPill } from "../../StatusPill";
import { Button } from "../../ui/button";
import { NumberTicker } from "../../ui/number-ticker";
import { ThinkingLoader } from "../../ui-xenon/thinking-loader";
import { LimitMeter } from "../../ui-xenon/limit-meter";
import { costOf, progressOf, statusOf } from "./plan";

const money = new Intl.NumberFormat("en-US", usd);
const formatMoney = (n: number) => money.format(n);


type Props = { agent: Agent; steps: PlanStep[]; onNeeds: () => void };

export function StateTab({ agent, steps, onNeeds }: Props) {
  const status = statusOf(agent, steps);
  const waiting = status === "waiting";
  const done = steps.filter((s) => s.status === "done").length;
  const limits = agent.limits;
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
        <h3>{status === "done" ? (steps.length ? "All steps finished" : "Idle") : agent.step}</h3>
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

      {limits && (
      <section className="limitsPanel" aria-label="Limits">
        <div className="eyebrow">LIMITS · SAMPLE DATA</div>
        <LimitMeter label="Budget" value={spend} max={limits.budget} format={formatMoney} thresholds={{ warning: 0.8, critical: 0.95 }} />
        <LimitMeter label="Context window" value={limits.context.used} max={limits.context.max} unit="tokens" />
        <LimitMeter label="Tool calls" value={limits.calls.used} max={limits.calls.max} unit="calls" />
      </section>
      )}
    </div>
  );
}
