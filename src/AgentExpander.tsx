import { useLayoutEffect, useRef, type RefObject } from "react";
import { usd } from "./data";
import { useBackend } from "./api/backend";
import { Button } from "./ui/button";
import { ThinkingLoader } from "./ui/thinking-loader";
import { NumberTicker } from "./ui/number-ticker";
import { ProgressTracker } from "./ui/progress-tracker";
import type { PlanStep } from "./ui-xenon/agent-plan";
import { costOf, doneSteps, progressOf, statusOf } from "./views/live/plan";

export type ExpandState = { index: number; rect: DOMRect; closing: boolean };

type Props = {
  state: ExpandState;
  plans: Record<string, PlanStep[]>;
  host: RefObject<HTMLElement | null>;
  onClose: () => void;
  onDone: () => void;
  onRun: () => void;
  onRespond: () => void;
};

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const px = (n: number) => `${n}px`;

/** A card that grows out of the agent tile it was opened from. */
export function AgentExpander({ state, plans, host, onClose, onDone, onRun, onRespond }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const { agents } = useBackend();
  const agent = agents[state.index];
  const steps = plans[agent.name];
  const done = doneSteps(steps);
  const status = statusOf(agent, steps);

  // Open: morph from the tile's rectangle to the dialog's
  useLayoutEffect(() => {
    const node = el.current!;
    const m = host.current!.getBoundingClientRect();
    const r = state.rect;
    const left = Math.max(18, r.left - m.left);
    const width = Math.min(m.width - left - 20, Math.max(r.width * 2 + 16, 780));
    // Fit the whole task list so nothing needs scrolling: measure the natural height at the final width,
    // then keep the dialog inside the stage
    Object.assign(node.style, { left: px(left), width: px(width), height: "auto" });
    const height = Math.min(m.height - 40, Math.max(r.height + 10, node.offsetHeight));
    const top = Math.min(Math.max(24, r.top - m.top - 5), m.height - height - 20);
    const end = { left, top, width, height };
    Object.assign(node.style, { top: px(top), height: px(height) });
    if (reduced) return;
    // Start/end colours match the tile and the settled dialog so the morph never flashes a different colour
    // The settled colour is read from the CSS, not repeated here, so the fade can never end on a different one
    const settled = getComputedStyle(node).backgroundColor;
    const [from, to] = status === "waiting" ? [settled, settled] : ["#172232", settled];
    node.animate(
      [
        { left: px(r.left - m.left), top: px(r.top - m.top), width: px(r.width), height: px(r.height) },
        { left: px(end.left), top: px(end.top), width: px(end.width), height: px(end.height) },
      ],
      { duration: 450, easing: "cubic-bezier(.22,1,.36,1)" },
    );
    // Colour fades smoothly over the whole morph (not on the fast geometry curve), and is held at the start colour
    // until the first frame so the settled colour never shows early
    node.animate([{ background: from }, { background: to }], { duration: 450, easing: "linear", fill: "backwards" });
    node.querySelector(".exContent")?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], { duration: 450, easing: "ease-out" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close: fade and shrink a little, then unmount
  useLayoutEffect(() => {
    if (!state.closing) return;
    if (reduced) return onDone();
    const anim = el.current!.animate(
      [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.97)" }],
      { duration: 170, easing: "ease-in", fill: "forwards" },
    );
    anim.onfinish = onDone;
    return () => anim.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.closing]);

  return (
    <div className={`expander${status === "waiting" ? " waiting" : ""}`} ref={el} role="dialog" aria-modal="true" aria-label="Agent tasks" inert={state.closing}>
      <div className="expandHead">
        <div>
          <h2>{agent.name}</h2>
          <p>{agent.desc}</p>
        </div>
        <Button
          variant="secondary"
          size="lg"
          className="exclose"
          aria-label="Close expanded agent"
          onClick={onClose}
          icon={
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M3.5 3.5l9 9m0-9l-9 9" />
            </svg>
          }
        />
      </div>
      <div className="exContent">
        <section className="exTasks">
          <ProgressTracker
            key={done}
            readOnly
            title={`Tasks · ${steps.length} steps`}
            steps={steps.map((s) => ({
              id: s.id,
              label: s.label,
              done: s.status === "done",
              icon:
                s.status === "waiting" ? (
                  <span className="exWaiting">Needs you</span>
                ) : s.status === "running" ? (
                  <ThinkingLoader variant="plain" size="sm" phases={["Running"]} />
                ) : undefined,
            }))}
          />
        </section>
        <section className="exMeta">
          <h3>Right now</h3>
          {status === "waiting" ? (
            <p>
              <strong>{agent.step}</strong>
              <br />
              The agent is waiting for your response.
            </p>
          ) : status === "done" ? (
            <p>
              <strong>{steps.length ? "All steps finished" : "Idle"}</strong>
              <br />
              The run is complete.
            </p>
          ) : (
            <>
              <ThinkingLoader variant="plain" phases={[agent.step]} />
              <p>The run is progressing autonomously.</p>
            </>
          )}
          {steps.length > 0 && (
            <p>
              {progressOf(agent, steps)}% of known steps · <NumberTicker value={costOf(agent, steps)} format={usd} /> spent
            </p>
          )}
          <div className="exActions">
            <Button size="lg" onClick={onRun} iconRight={<span aria-hidden="true">↗</span>}>
              See live run
            </Button>
            {status === "waiting" && (
              <Button size="lg" variant="secondary" onClick={onRespond}>
                Respond
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
