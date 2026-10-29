"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "../ui/button";

/*
 * Agent Flow – where an agent is in its work, drawn as a decision flow, in a single self-contained file.
 * Original Xenon component in the visual language of the Decision Tree: the agent on the left, its steps as branches
 * beside it, and what each step did, is doing or is waiting for on the right. The route already taken is lit, the step
 * the agent is on glows with a clock, a step waiting for a person says so and can show the choice it is blocked on,
 * and steps still to come are dim.
 *
 * Configure it with props: `labels` replaces every word it shows, `icon` the agent's mark, `decision` the options a
 * waiting step is blocked on, `onRespond` what the "Respond" button does, `now` a fixed time for a still picture,
 * `compact` fits a narrow panel. Restyle it with CSS variables set through `style` or `className`, or in a rule such as
 * `.my-theme .xaf` (a variable set on a parent does not reach it): --xaf-bg, -panel, -surface, -line, -text, -muted,
 * -accent, -route (the lit path), -active, -wait, -fail, -done and the rest listed in the stylesheet.
 */

export type FlowStepStatus = "done" | "active" | "waiting" | "pending" | "failed";

export interface FlowNote {
  id: string;
  text: string;
  /** Set once the agent has picked it up */
  picked?: "next" | "now";
}

export interface FlowStep {
  id: string;
  title: string;
  status: FlowStepStatus;
  /** What the step is for or does */
  detail?: string;
  /** The tool it uses */
  tool?: string;
  /** How long a finished step took, in ms */
  duration?: number;
  /** When an active step began (ms timestamp); its clock runs from here */
  startedAt?: number;
  /** What a waiting step is asking for */
  ask?: string;
  /** Why a failed step failed */
  error?: string;
  notes?: FlowNote[];
}

export interface FlowAgent {
  name: string;
  model?: string;
  /** What it is doing now, shown big */
  task: string;
  /** A line under it */
  details?: string;
  status: "working" | "waiting" | "done" | "paused";
  /** 0–100 */
  progress?: number;
  cost?: number;
}

/** The choice a waiting step is blocked on – shown as the branches it can take */
export interface FlowDecision {
  question: string;
  options: { id: string; label: string; agentPick?: boolean }[];
}

export interface AgentFlowProps {
  agent: FlowAgent;
  steps: FlowStep[];
  title?: string;
  decision?: FlowDecision;
  /** Called by the waiting step's button */
  onRespond?: (step: FlowStep) => void;
  /** The mark in the agent's card; defaults to its first letter */
  icon?: ReactNode;
  /** Replace any of the words the component shows */
  labels?: Partial<FlowLabels>;
  formatCost?: (amount: number) => string;
  /** The time the clocks show, for a fixed picture. Defaults to the live clock */
  now?: number | Date;
  /** Smaller type and columns for a narrow panel */
  compact?: boolean;
  /** Shown at the right of the header, e.g. a switcher between agents */
  headerRight?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** Every word the component shows – pass any of them in `labels` */
export interface FlowLabels {
  title: string;
  agentStatus: Record<FlowAgent["status"], string>;
  stepStatus: Record<FlowStepStatus, string>;
  position: (step: number, total: number) => string;
  doneCount: (done: number, total: number) => string;
  progress: string;
  running: (clock: string) => string;
  respond: string;
  options: string;
  agentPick: string;
  pickedUp: string;
  interrupted: string;
  legend: Record<FlowStepStatus, string>;
  empty: string;
}

export const defaultFlowLabels: FlowLabels = {
  title: "Decision flow",
  agentStatus: { working: "Working", waiting: "Needs you", done: "Done", paused: "Paused" },
  stepStatus: { done: "Done", active: "In progress", waiting: "Needs you", pending: "Queued", failed: "Failed" },
  position: (i, n) => `Step ${i} of ${n}`,
  doneCount: (d, n) => `${d} of ${n} done`,
  progress: "Progress",
  running: (clock) => `Running · ${clock}`,
  respond: "Respond",
  options: "It can go",
  agentPick: "Agent's pick",
  pickedUp: "Picked up",
  interrupted: "Interrupted",
  legend: { done: "Done", active: "In progress", waiting: "Needs you", pending: "Queued", failed: "Failed" },
  empty: "No steps yet",
};

const clock = (ms: number) => {
  const s = Math.max(Math.floor(ms / 1000), 0);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};
const took = (ms: number) => (ms < 60_000 ? `${(Math.max(ms, 0) / 1000).toFixed(1)}s` : clock(ms));
const money = (n: number) => `$${n.toFixed(2)}`;

type Path = { d: string; kind: "route" | "live" | "dim" };

const rounded = (x1: number, y1: number, x2: number, y2: number) => {
  const dy = y2 - y1;
  if (Math.abs(dy) < 2) return `M${x1} ${y1}H${x2}`;
  const mid = x1 + (x2 - x1) / 2;
  const r = Math.min(14, Math.abs(dy) / 2, Math.abs(x2 - x1) / 2);
  const s = dy > 0 ? 1 : -1;
  return `M${x1} ${y1}H${mid - r}Q${mid} ${y1} ${mid} ${y1 + s * r}V${y2 - s * r}Q${mid} ${y2} ${mid + r} ${y2}H${x2}`;
};

export function AgentFlow({ agent, steps, title, decision, onRespond, icon, labels, formatCost = money, now, compact, headerRight, className, style }: AgentFlowProps) {
  const L = useMemo<FlowLabels>(
    () => ({ ...defaultFlowLabels, ...labels, agentStatus: { ...defaultFlowLabels.agentStatus, ...labels?.agentStatus }, stepStatus: { ...defaultFlowLabels.stepStatus, ...labels?.stepStatus }, legend: { ...defaultFlowLabels.legend, ...labels?.legend } }),
    [labels],
  );
  const [paths, setPaths] = useState<Path[]>([]);
  const body = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const ref = (key: string) => (el: HTMLElement | null) => void (el ? nodes.current.set(key, el) : nodes.current.delete(key));

  // The clocks tick once a second while a step is in progress, unless a fixed time is given
  const live = now === undefined && steps.some((s) => s.status === "active" && s.startedAt !== undefined);
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    setTick(Date.now());
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [live]);
  const nowMs = now === undefined ? tick : now instanceof Date ? now.getTime() : now;

  const total = steps.length;
  const done = steps.filter((s) => s.status === "done").length;
  const current = steps.findIndex((s) => s.status === "active" || s.status === "waiting" || s.status === "failed");

  // Lines are measured from the real boxes so they follow any content height
  const signature = steps.map((s) => `${s.id}:${s.status}`).join("|");
  useLayoutEffect(() => {
    const host = body.current;
    if (!host) return;
    const measure = () => {
      const h = host.getBoundingClientRect();
      const box = (key: string) => {
        const r = nodes.current.get(key)?.getBoundingClientRect();
        return r && { l: r.left - h.left, r: r.right - h.left, m: (r.top + r.bottom) / 2 - h.top };
      };
      const card = box("card");
      const out: Path[] = [];
      if (card) {
        steps.forEach((s) => {
          const step = box(`s:${s.id}`);
          if (!step) return;
          const taken = s.status !== "pending";
          out.push({ d: rounded(card.r, card.m, step.l, step.m), kind: s.status === "active" || s.status === "waiting" ? "live" : taken ? "route" : "dim" });
          const detail = box(`d:${s.id}`);
          if (detail && taken) out.push({ d: `M${step.r} ${step.m}H${detail.l}`, kind: s.status === "active" || s.status === "waiting" ? "live" : "route" });
        });
      }
      setPaths(out);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [signature, compact, decision]);

  return (
    <div className={`xaf${compact ? " xaf-compact" : ""}${className ? ` ${className}` : ""}`} style={style} data-status={agent.status}>
      <style>{CSS}</style>
      <header className="xaf-head">
        <span className="xaf-title">
          <svg viewBox="0 0 20 20" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <circle cx="4.5" cy="10" r="2.4" />
            <circle cx="15" cy="4.5" r="2.4" />
            <circle cx="15" cy="15.5" r="2.4" />
            <path d="M6.8 9l6-3.4M6.8 11l6 3.4" />
          </svg>
          <b>{title ?? L.title}</b>
          {total > 0 && <span>{current >= 0 ? `${L.position(current + 1, total)} · ${L.doneCount(done, total)}` : L.doneCount(done, total)}</span>}
        </span>
        {headerRight && <span className="xaf-right">{headerRight}</span>}
      </header>

      <div className="xaf-body" ref={body}>
        <svg className="xaf-lines" aria-hidden="true">
          {paths.map((p, i) => (
            <path key={i} d={p.d} data-kind={p.kind} />
          ))}
        </svg>

        <section className="xaf-card" ref={ref("card")} data-status={agent.status}>
          <span className="xaf-badge" data-status={agent.status}>
            {L.agentStatus[agent.status]}
          </span>
          <div className="xaf-who">
            <span className="xaf-tile">{icon ?? <span className="xaf-letter">{agent.name.slice(0, 1).toUpperCase()}</span>}</span>
            <div>
              <b>{agent.name}</b>
              {agent.model && <span>{agent.model}</span>}
            </div>
          </div>
          <h3>{agent.task}</h3>
          {agent.details && <p>{agent.details}</p>}
          {(agent.progress !== undefined || agent.cost !== undefined) && (
            <div className="xaf-meta">
              {agent.progress !== undefined && (
                <div className="xaf-progress" role="progressbar" aria-label={L.progress} aria-valuenow={Math.round(agent.progress)} aria-valuemin={0} aria-valuemax={100}>
                  <i style={{ width: `${Math.min(Math.max(agent.progress, 0), 100)}%` }} />
                </div>
              )}
              <span>
                {agent.progress !== undefined && <b>{Math.round(agent.progress)}%</b>}
                {agent.cost !== undefined && <em>{formatCost(agent.cost)}</em>}
              </span>
            </div>
          )}
        </section>

        {steps.length === 0 && <p className="xaf-empty">{L.empty}</p>}

        {steps.map((s, i) => {
          const elapsed = s.status === "active" && s.startedAt !== undefined ? clock(nowMs - s.startedAt) : undefined;
          const sub =
            s.status === "active" ? (elapsed ? L.running(elapsed) : L.stepStatus.active) : s.status === "done" ? (s.duration !== undefined ? took(s.duration) : L.stepStatus.done) : L.stepStatus[s.status];
          const showDetail = s.status !== "pending" && (s.detail || s.tool || s.ask || s.error || s.notes?.length || (s.status === "waiting" && decision));
          return (
            <div className="xaf-row" key={s.id}>
              <div className="xaf-step" ref={ref(`s:${s.id}`)} data-status={s.status}>
                <kbd>{i + 1}</kbd>
                <StatusMark status={s.status} />
                <span className="xaf-stepText">
                  <b>{s.title}</b>
                  <em>{sub}</em>
                </span>
              </div>
              <div className="xaf-detailcell">
                {showDetail && (
                  <div className="xaf-detail" ref={ref(`d:${s.id}`)} data-status={s.status}>
                    {(s.tool || s.detail) && (
                      <div className="xaf-line">
                        {s.tool && <code>{s.tool}</code>}
                        {s.detail && <span>{s.detail}</span>}
                      </div>
                    )}
                    {s.status === "waiting" && s.ask && <div className="xaf-ask">{s.ask}</div>}
                    {s.status === "failed" && s.error && <div className="xaf-error">{s.error}</div>}
                    {s.notes?.map((n) => (
                      <div className="xaf-note" key={n.id}>
                        <span>{n.text}</span>
                        <em>{n.picked === "now" ? L.interrupted : L.pickedUp}</em>
                      </div>
                    ))}
                    {s.status === "waiting" && decision && (
                      <div className="xaf-options">
                        <b>{decision.question}</b>
                        <ul>
                          {decision.options.map((o, k) => (
                            <li key={o.id} data-pick={o.agentPick || undefined}>
                              <kbd>{k + 1}</kbd>
                              {o.label}
                              {o.agentPick && <em>{L.agentPick}</em>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {s.status === "waiting" && onRespond && (
                      <Button className="xaf-respond" size="md" iconRight={<span aria-hidden="true">↗</span>} onClick={() => onRespond(s)}>
                        {L.respond}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="xaf-legend" aria-hidden="true">
        {(["done", "active", "waiting", "pending", "failed"] as const).map((k) => (
          <span key={k} data-status={k}>
            <i />
            {L.legend[k]}
          </span>
        ))}
      </footer>
    </div>
  );
}

function StatusMark({ status }: { status: FlowStepStatus }) {
  const common = { viewBox: "0 0 24 24", width: 28, height: 28, "aria-hidden": true, focusable: false } as const;
  return (
    <span className="xaf-mark" data-status={status}>
      {status === "done" && (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5.500 12.500l4.500 4.500L18.500 8" />
        </svg>
      )}
      {status === "active" && <span className="xaf-spin" />}
      {status === "waiting" && (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8.500" />
          <path d="M12 7.500V12l3 2" />
        </svg>
      )}
      {status === "failed" && (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4L2.800 20h18.400zM12 10v4.500M12 17.500v.01" />
        </svg>
      )}
      {status === "pending" && <span className="xaf-dash" />}
    </span>
  );
}

const CSS = `
.xaf{
  --xaf-bg:#1d1d20;--xaf-panel:#222226;--xaf-surface:#1c1c1f;--xaf-surface-hover:#212125;--xaf-tile:#1b1b1e;
  --xaf-line:#2c2c31;--xaf-line-strong:#3a3a41;--xaf-text:#f4f4f6;--xaf-muted:#8d8d96;--xaf-kbd:#2e2e33;
  --xaf-accent:#7388f4;--xaf-route:#5a6cc8;--xaf-active:#7388f4;--xaf-active-bg:#1d1f2b;--xaf-glow:rgba(80,100,240,.5);
  --xaf-done:#7fd9a6;--xaf-done-bg:#1f3a2c;--xaf-wait:#e9a574;--xaf-wait-bg:#3f2f20;--xaf-wait-line:#6e5636;
  --xaf-fail:#f2917e;--xaf-fail-bg:#432424;--xaf-fail-line:#6e3f3d;--xaf-code:#2a2a2f;--xaf-dim-text:#c9c9d0;--xaf-soft:#d4d4da;--xaf-badge:#2d2d33;--xaf-on-wait:#1d1d20;--xaf-radius:24px;
  position:relative;box-sizing:border-box;display:flex;flex-direction:column;gap:30px;min-height:100%;padding:44px 56px 28px;background:var(--xaf-bg);color:var(--xaf-text);
  border-radius:var(--xaf-radius);border:1px solid var(--xaf-line);font:500 15px/1.35 Inter,ui-sans-serif,system-ui,sans-serif;letter-spacing:-.01em}
.xaf *{box-sizing:border-box}
.xaf :where(button){font:inherit;color:inherit;letter-spacing:inherit;text-align:left;background:none;border:0;padding:0;cursor:pointer}
.xaf kbd{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 5px;border-radius:6px;background:var(--xaf-kbd);color:var(--xaf-muted);font:500 12px/1 inherit;font-family:inherit}
.xaf-head{display:flex;align-items:center;justify-content:space-between;gap:16px}
.xaf-title{display:flex;align-items:center;gap:12px;color:var(--xaf-accent);min-width:0}
.xaf-title b{color:var(--xaf-text);font-size:23px;font-weight:600;white-space:nowrap}
.xaf-title span{color:var(--xaf-muted);font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xaf-right{display:flex;align-items:center;gap:8px;min-width:0}
.xaf-body{position:relative;flex:1;padding-top:46px;display:grid;grid-template-columns:330px minmax(250px,330px) minmax(0,1fr);row-gap:20px;align-content:center;align-items:center;animation:xaf-in .35s ease-out}
@keyframes xaf-in{from{opacity:0;transform:translateY(6px)}}
.xaf-lines{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.xaf-lines path{fill:none;stroke-width:1.4;transition:stroke .3s}
.xaf-lines path[data-kind=dim]{stroke:var(--xaf-line-strong);opacity:.55}
.xaf-lines path[data-kind=route]{stroke:var(--xaf-route)}
.xaf-lines path[data-kind=live]{stroke:var(--xaf-active);stroke-width:1.8;stroke-dasharray:7 7;animation:xaf-flow 1s linear infinite}
@keyframes xaf-flow{to{stroke-dashoffset:-14}}
.xaf-card{grid-column:1;grid-row:1/-1;align-self:center;margin-right:50px;position:relative;z-index:1;display:flex;flex-direction:column;gap:16px;padding:28px;border-radius:18px;background:var(--xaf-panel);border:1px solid var(--xaf-line);transition:border-color .3s,box-shadow .3s}
.xaf-card[data-status=working]{border-color:var(--xaf-route)}
.xaf-card[data-status=waiting]{border-color:var(--xaf-wait-line)}
.xaf-badge{position:absolute;left:2px;top:-44px;padding:5px 14px;border-radius:8px;font-size:15px;font-weight:600;background:var(--xaf-badge);color:var(--xaf-muted)}
.xaf-badge[data-status=working]{background:var(--xaf-active-bg);color:var(--xaf-active)}
.xaf-badge[data-status=waiting]{background:var(--xaf-wait-bg);color:var(--xaf-wait)}
.xaf-badge[data-status=done]{background:var(--xaf-done-bg);color:var(--xaf-done)}
.xaf-who{display:flex;align-items:center;gap:14px}
.xaf-who b{display:block;font-size:20px;font-weight:600;overflow-wrap:anywhere}
.xaf-who span{color:var(--xaf-muted);font-size:17px}
.xaf-tile{flex:none;display:inline-grid;place-items:center;width:50px;height:50px;border-radius:13px;background:var(--xaf-tile);border:1px solid var(--xaf-line);color:var(--xaf-text)}
.xaf-letter{font-size:20px;font-weight:700}
.xaf-card h3{margin:0;font-size:22px;line-height:1.5;font-weight:500;letter-spacing:-.02em;overflow-wrap:anywhere}
.xaf-card p{margin:0;color:var(--xaf-muted);font-size:17px;line-height:1.5;overflow-wrap:anywhere}
.xaf-meta{display:flex;flex-direction:column;gap:8px;margin-top:2px}
.xaf-progress{height:6px;border-radius:3px;background:var(--xaf-line);overflow:hidden}
.xaf-progress i{display:block;height:100%;border-radius:3px;background:var(--xaf-accent);transition:width .6s ease}
.xaf-meta span{display:flex;justify-content:space-between;font-size:15px;color:var(--xaf-muted)}
.xaf-meta b{color:var(--xaf-text);font-weight:600}.xaf-meta em{font-style:normal}
.xaf-empty{grid-column:2/-1;margin:0;color:var(--xaf-muted);font-size:17px}
.xaf-row{display:contents}
.xaf-step{grid-column:2;position:relative;z-index:1;display:flex;align-items:center;gap:12px;margin-right:46px;padding:14px 18px;border-radius:14px;background:var(--xaf-surface);border:1px solid var(--xaf-line);transition:border-color .3s,box-shadow .3s,background .3s,opacity .3s}
.xaf-step kbd{font-size:15px;height:28px;min-width:28px;border-radius:8px}
.xaf-stepText{display:flex;flex-direction:column;min-width:0}
.xaf-stepText b{font-size:19px;font-weight:500;overflow-wrap:anywhere}
.xaf-stepText em{font-style:normal;font-size:15px;color:var(--xaf-muted);font-variant-numeric:tabular-nums}
.xaf-step[data-status=done] .xaf-stepText b{color:var(--xaf-dim-text)}
.xaf-step[data-status=active]{border-color:var(--xaf-active);background:var(--xaf-active-bg);box-shadow:0 8px 46px -10px var(--xaf-glow);animation:xaf-pulse 2.6s ease-in-out infinite}
.xaf-step[data-status=active] em{color:var(--xaf-active)}
.xaf-step[data-status=waiting]{border-color:var(--xaf-wait-line);background:var(--xaf-wait-bg)}
.xaf-step[data-status=waiting] em{color:var(--xaf-wait)}
.xaf-step[data-status=failed]{border-color:var(--xaf-fail-line);background:var(--xaf-fail-bg)}
.xaf-step[data-status=failed] em{color:var(--xaf-fail)}
.xaf-step[data-status=pending]{opacity:.5}
@keyframes xaf-pulse{50%{box-shadow:0 8px 60px -6px var(--xaf-glow)}}
.xaf-mark{flex:none;display:inline-grid;place-items:center;width:30px;height:30px}
.xaf-mark[data-status=done]{color:var(--xaf-done)}
.xaf-mark[data-status=waiting]{color:var(--xaf-wait)}
.xaf-mark[data-status=failed]{color:var(--xaf-fail)}
.xaf-spin{width:20px;height:20px;border-radius:50%;border:2.5px solid var(--xaf-line-strong);border-top-color:var(--xaf-active);border-right-color:var(--xaf-active);animation:xaf-rot 1s linear infinite}
@keyframes xaf-rot{to{transform:rotate(360deg)}}
.xaf-dash{width:20px;height:20px;border-radius:50%;border:2px dashed var(--xaf-line-strong)}
.xaf-detailcell{grid-column:3;min-width:0;display:flex}
.xaf-detail{position:relative;z-index:1;display:flex;flex-direction:column;gap:10px;max-width:520px;padding:14px 18px;border-radius:14px;background:var(--xaf-surface);border:1px solid var(--xaf-line);animation:xaf-in .3s ease-out}
.xaf-detail[data-status=active]{border-color:var(--xaf-route)}
.xaf-detail[data-status=waiting]{border-color:var(--xaf-wait-line)}
.xaf-detail[data-status=failed]{border-color:var(--xaf-fail-line)}
.xaf-line{display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;font-size:16px;color:var(--xaf-soft);line-height:1.45}
.xaf-line code{padding:2px 8px;border-radius:7px;background:var(--xaf-code);color:var(--xaf-text);font:500 14px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}
.xaf-ask{padding:8px 12px;border-radius:9px;background:var(--xaf-wait-bg);color:var(--xaf-wait);font-size:15px}
.xaf-error{padding:8px 12px;border-radius:9px;background:var(--xaf-fail-bg);color:var(--xaf-fail);font-size:15px}
.xaf-note{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;border-radius:9px;background:var(--xaf-surface-hover);border:1px solid var(--xaf-line);font-size:15px}
.xaf-note em{flex:none;font-style:normal;font-size:13px;font-weight:600;color:var(--xaf-accent)}
.xaf-options b{display:block;margin-bottom:6px;font-size:15px;font-weight:600;color:var(--xaf-muted)}
.xaf-options ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.xaf-options li{display:flex;align-items:center;gap:10px;font-size:16px;padding:6px 10px;border-radius:9px;background:var(--xaf-surface-hover);border:1px solid transparent}
.xaf-options li[data-pick]{border-color:var(--xaf-route)}
.xaf-options li em{margin-left:auto;font-style:normal;font-size:13px;color:var(--xaf-accent)}
.xaf-respond{align-self:flex-start}
.xaf-legend{display:flex;flex-wrap:wrap;gap:8px 22px;color:var(--xaf-muted);font-size:14px}
.xaf-legend span{display:inline-flex;align-items:center;gap:8px}
.xaf-legend i{width:10px;height:10px;border-radius:50%;background:var(--xaf-line-strong)}
.xaf-legend [data-status=done] i{background:var(--xaf-done)}
.xaf-legend [data-status=active] i{background:var(--xaf-active)}
.xaf-legend [data-status=waiting] i{background:var(--xaf-wait)}
.xaf-legend [data-status=failed] i{background:var(--xaf-fail)}
.xaf-compact{--xaf-radius:18px;gap:22px;padding:34px 28px 20px;font-size:13px}
.xaf-compact .xaf-title b{font-size:18px}.xaf-compact .xaf-title span{font-size:16px}
.xaf-compact .xaf-body{padding-top:38px;grid-template-columns:240px minmax(210px,260px) minmax(0,1fr);row-gap:14px}
.xaf-compact .xaf-card{margin-right:36px;padding:18px;gap:12px;border-radius:14px}
.xaf-compact .xaf-badge{top:-38px;font-size:14px;padding:3px 10px}
.xaf-compact .xaf-who b{font-size:18px}.xaf-compact .xaf-who span{font-size:15px}.xaf-compact .xaf-tile{width:48px;height:48px}
.xaf-compact .xaf-card h3{font-size:18px}.xaf-compact .xaf-card p{font-size:15px}
.xaf-compact .xaf-step{margin-right:30px;padding:10px 12px;gap:9px}.xaf-compact .xaf-stepText b{font-size:17px}.xaf-compact .xaf-stepText em{font-size:14px}
.xaf-compact .xaf-detail{padding:10px 14px;gap:8px}.xaf-compact .xaf-line{font-size:15px}.xaf-compact .xaf-line code{font-size:14px}
.xaf-compact .xaf-ask,.xaf-compact .xaf-error,.xaf-compact .xaf-note{font-size:15px}.xaf-compact .xaf-options li{font-size:15px}
.xaf-compact .xaf-legend{font-size:14px}
@media (prefers-reduced-motion:reduce){.xaf *{animation:none!important;transition:none!important}}
`;
