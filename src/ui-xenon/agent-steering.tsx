"use client";

import * as React from "react";

/*
 * Agent Steering – a running plan you can steer, in a single self-contained file.
 * Based on a component generated with DeepSeek and adapted for Xenon: navy palette, touch-sized controls,
 * the hoisted <style> the other components use, clocks that stand still while paused, and the states of the
 * reference recording – a shimmering active step, dashed pending steps and a finished run.
 *
 * A note is queued for the next step, or interrupts right away. The host moves a queued note onto the step
 * that picks it up; it then shows under that step with a "Picked up" or "Interrupted" tag.
 *
 * Configure it with props: `labels` replaces every word it shows, `icon` the mark in the header, `formatClock` and
 * `formatDuration` how time reads, `showHints` the key hints under the box. Restyle it with CSS variables set through
 * `style` or `className`, or in a rule such as `.my-theme .as-root`, for example `style={{ "--as-accent": "#e0a040", "--as-max-width": "560px" }}` – --as-bg,
 * -border, -text, -text-muted, -accent, -ok, -note-bg, -input-bg, -btn, -radius, -max-width and the rest listed in
 * the stylesheet.
 */

export type SteerStatus = "done" | "active" | "pending";

export interface SteerNote {
  id: string;
  text: string;
  /** set when the agent has picked it up */
  picked?: "next" | "now";
}

export interface SteerStep {
  id: string;
  title: string;
  status?: SteerStatus;
  /** fixed duration in ms once finished */
  duration?: number;
  /** timestamp (ms) when the step became active */
  startedAt?: number;
  notes?: SteerNote[];
}

export interface AgentSteeringProps {
  title: string;
  agent: string;
  steps: SteerStep[];
  queue?: SteerNote[];
  status?: "running" | "paused" | "done";
  startedAt?: number | Date;
  /** When the run finished – the header then reads "Done in 2m 20s" */
  finishedAt?: number | Date;
  onQueue?: (text: string) => void;
  /** `queuedId` is set when a queued note is promoted with its "Now" button */
  onInterrupt?: (text: string, queuedId?: string) => void;
  onRemove?: (id: string) => void;
  onPause?: () => void;
  onResume?: () => void;
  draft?: string;
  onDraftChange?: (text: string) => void;
  placeholder?: string;
  /** Replace any of the words the component shows */
  labels?: Partial<SteerLabels>;
  /** The mark before the title; defaults to a sparkle. Pass `null` for none */
  icon?: React.ReactNode;
  /** How a clock reads in the header, e.g. "2m 08s" */
  formatClock?: (ms: number) => string;
  /** How a step's time reads, e.g. "1.4s" */
  formatDuration?: (ms: number) => string;
  /** The key hints under the box (default true) */
  showHints?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** Every word the component shows – pass any of them in `labels` */
export interface SteerLabels {
  stepOf: (position: number, total: number) => string;
  steps: (count: number) => string;
  running: string;
  paused: string;
  done: string;
  doneIn: (clock: string) => string;
  pause: string;
  resume: string;
  plan: string;
  queued: string;
  queueLeft: string;
  now: string;
  interruptWith: (text: string) => string;
  remove: (text: string) => string;
  steer: string;
  finished: string;
  queueAction: string;
  hintNext: string;
  hintInterrupt: string;
  unused: string;
  pickedUp: string;
  interrupted: string;
  announce: (text: string) => string;
}

export const defaultSteerLabels: SteerLabels = {
  stepOf: (i, n) => `Step ${i} of ${n}`,
  steps: (n) => `${n} ${n === 1 ? "step" : "steps"}`,
  running: "Running",
  paused: "Paused",
  done: "Done",
  doneIn: (clock) => `Done in ${clock}`,
  pause: "Pause",
  resume: "Resume",
  plan: "Plan",
  queued: "Queued for the next step",
  queueLeft: "Left in the queue",
  now: "Now",
  interruptWith: (t) => `Interrupt now with “${t}”`,
  remove: (t) => `Remove “${t}”`,
  steer: "Steer the agent",
  finished: "The run has finished",
  queueAction: "Queue for the next step",
  hintNext: "next step",
  hintInterrupt: "interrupt now",
  unused: "Notes still in the queue were not used",
  pickedUp: "Picked up",
  interrupted: "Interrupted",
  announce: (t) => `Agent picked up note: ${t}`,
};

/* ------------------------------------------------------------------ helpers */

function formatClock(ms: number): string {
  const total = Math.floor(Math.max(ms, 0) / 1000);
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
}

const formatDuration = (ms: number) => `${(Math.max(ms, 0) / 1000).toFixed(1)}s`;
const toMs = (t: number | Date | undefined) => (t instanceof Date ? t.getTime() : t);

/** Re-renders every 100 ms while `active` (step clocks show tenths), and holds the last reading while not – so clocks stand still when paused */
function useNow(active: boolean, interval = 100) {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const last = React.useRef(Date.now());
  React.useEffect(() => {
    if (!active) return;
    const id = window.setInterval(force, interval);
    return () => window.clearInterval(id);
  }, [active, interval]);
  if (active) last.current = Date.now();
  return last.current;
}

/* ---------------------------------------------------------------- main comp */

export function AgentSteering({
  title,
  agent,
  steps,
  queue = [],
  status = "running",
  startedAt,
  finishedAt,
  onQueue,
  onInterrupt,
  onRemove,
  onPause,
  onResume,
  draft,
  onDraftChange,
  placeholder = "Steer the agent…",
  labels,
  icon,
  formatClock: clock = formatClock,
  formatDuration: duration = formatDuration,
  showHints = true,
  className = "",
  style,
}: AgentSteeringProps) {
  const L = React.useMemo(() => ({ ...defaultSteerLabels, ...labels }), [labels]);
  const [internalDraft, setInternalDraft] = React.useState("");
  const text = draft !== undefined ? draft : internalDraft;
  const setText = (v: string) => {
    if (draft === undefined) setInternalDraft(v);
    onDraftChange?.(v);
  };

  const startMs = toMs(startedAt);
  const endMs = toMs(finishedAt);
  const now = useNow(status === "running");
  const done = status === "done";

  const activeIndex = steps.findIndex((s) => s.status === "active");

  const submit = (interrupt: boolean) => {
    const value = text.trim();
    if (!value || done) return;
    if (interrupt) onInterrupt?.(value);
    else onQueue?.(value);
    setText("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      setText("");
      return;
    }
    // Enter while composing text (IME) confirms the character, it doesn't send
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(e.metaKey || e.ctrlKey);
    }
  };

  // Announce the latest pickup to screen readers
  const live = React.useMemo(() => {
    const picked = steps.flatMap((s) => s.notes?.filter((n) => n.picked) ?? []);
    const last = picked[picked.length - 1];
    return last ? L.announce(last.text) : "";
  }, [steps, L]);

  return (
    <div className={`as-root ${className}`} style={style} data-status={status}>
      <style href="xn-agent-steering" precedence="default">
        {css}
      </style>

      <div className="as-card">
        <header className="as-head">
          <div className="as-head-left">
            {icon !== null && (
              <div className="as-sparkle" aria-hidden="true">
                {icon !== undefined ? icon : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10.5 3.5c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6z" />
                <circle cx="18.5" cy="17.5" r="1.7" />
              </svg>
            
                )}
              </div>
            )}
            <div className="as-head-text">
              <h2 className="as-title">{title}</h2>
              <div className="as-sub">
                <span>{agent}</span>
                <span className="as-dot" aria-hidden="true">
                  ·
                </span>
                <span>{done ? L.steps(steps.length) : activeIndex >= 0 ? L.stepOf(activeIndex + 1, steps.length) : L.steps(steps.length)}</span>
              </div>
            </div>
          </div>

          <div className="as-head-right">
            <div className="as-status-cluster">
              <span className={`as-status-dot as-status-dot--${status}`} aria-hidden="true" />
              <span className="as-status-text">
                {done ? (
                  <>{startMs !== undefined && endMs !== undefined ? L.doneIn(clock(endMs - startMs)) : L.done}</>
                ) : status === "running" ? (
                  <>
                    {L.running}
                    {startMs !== undefined && <> · {clock(now - startMs)}</>}
                  </>
                ) : (
                  L.paused
                )}
              </span>
            </div>
            {status === "running" ? (
              <button type="button" className="as-icon-btn" onClick={onPause} aria-label={L.pause}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                </svg>
              </button>
            ) : status === "paused" ? (
              <button type="button" className="as-icon-btn" onClick={onResume} aria-label={L.resume}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M5 3l14 9-14 9V3z" />
                </svg>
              </button>
            ) : null}
          </div>
        </header>

        <div className="as-plan-container">
          <ol className="as-plan" aria-label={L.plan}>
            {steps.map((step, i) => (
              <StepRow key={step.id} step={step} isLast={i === steps.length - 1} running={status === "running"} now={now} labels={L} formatDuration={duration} />
            ))}
          </ol>
        </div>

        {queue.length > 0 && (
          <div className="as-queue">
            <div className="as-queue-head">
              <span>{done ? L.queueLeft : L.queued}</span>
              <span className="as-count">{queue.length}</span>
            </div>
            <ul className="as-queue-list">
              {queue.map((n) => (
                <li key={n.id} className="as-chip">
                  <span className="as-chip-text" title={n.text}>
                    {n.text}
                  </span>
                  {!done && (
                    <button type="button" className="as-chip-btn" aria-label={L.interruptWith(n.text)} onClick={() => onInterrupt?.(n.text, n.id)}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M13 2L4 14h6l-1 8 9-12h-6z" />
                      </svg>
                      {L.now}
                    </button>
                  )}
                  <button type="button" className="as-chip-x" onClick={() => onRemove?.(n.id)} aria-label={L.remove(n.text)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="as-field-wrap">
          <div className="as-field" data-disabled={done || undefined}>
            <textarea
              className="as-input"
              value={done ? "" : text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={done ? L.finished : placeholder}
              aria-label={L.steer}
              rows={1}
              disabled={done}
            />
            <button type="button" className="as-send" onClick={() => submit(false)} aria-label={L.queueAction} disabled={done || !text.trim()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
          {done ? (
            <div className="as-hint">{L.unused}</div>
          ) : showHints ? (
            <div className="as-hint">
              <span className="as-kbd-group">
                <kbd>↵</kbd> {L.hintNext}
              </span>
              <span className="as-kbd-group">
                <kbd>Ctrl</kbd> <kbd>↵</kbd> {L.hintInterrupt}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="as-sr" aria-live="polite" aria-atomic="true">
        {live}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- step row */

function StepRow({ step, isLast, running, now, labels: L, formatDuration }: { step: SteerStep; isLast: boolean; running: boolean; now: number; labels: SteerLabels; formatDuration: (ms: number) => string }) {
  const state = step.status ?? "pending";

  let clock: string | null = null;
  if (state === "done" && typeof step.duration === "number") clock = formatDuration(step.duration);
  else if (state === "active" && step.startedAt !== undefined) clock = formatDuration(now - step.startedAt);

  return (
    <li className={`as-step as-step--${state}`} aria-current={state === "active" ? "step" : undefined}>
      <div className="as-step-marker-col">
        <span className="as-step-marker" aria-hidden="true">
          {state === "done" ? (
            <svg className="as-check" width="22" height="22" viewBox="0 0 24 24" fill="var(--as-check-bg)" stroke="none">
              <circle cx="12" cy="12" r="12" />
              <path d="M7 12.5l3.5 3.5 7-7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          ) : state === "active" ? (
            <span className={`as-spin${running ? "" : " as-spin--paused"}`} />
          ) : (
            <span className="as-empty-circle" />
          )}
        </span>
        {!isLast && <span className="as-step-line" />}
      </div>

      <div className="as-step-body">
        <div className="as-step-line-content">
          <span className="as-step-title">{step.title}</span>
          {clock && <span className="as-step-clock">{clock}</span>}
        </div>

        {step.notes && step.notes.length > 0 && (
          <ul className="as-step-notes">
            {step.notes.map((n) => (
              <li key={n.id} className="as-step-note">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="as-note-icon" aria-hidden="true">
                  <path d="M9 14L4 9l5-5" />
                  <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
                </svg>
                <span className="as-note-text">{n.text}</span>
                <span className="as-note-tag">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  {n.picked === "now" ? L.interrupted : L.pickedUp}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------- css */

const css = /* css */ `
.as-root {
  --as-bg: #1c1c1f;
  --as-border: #2a2a2e;
  --as-text: #f4f4f6;
  --as-text-muted: #8f8f98;
  --as-faint: #7b7b84;
  --as-accent: #7b8ff5;
  --as-ok: #7fd9a6;
  --as-check-bg: #7b8ff5;
  --as-note-bg: #232326;
  --as-note-border: #2e2e33;
  --as-input-bg: #242427;
  --as-warn: #f0c889;
  --as-btn: #3a3a3e;
  --as-btn-hover: #47474c;
  --as-strong: #ffffff;
  --as-soft: #cfcfd6;
  --as-line: #3a3a40;
  --as-empty: #4a4a51;
  --as-clock: #6a6a72;
  --as-step-text: #b5b5bc;
  --as-note-text: #e8e8ec;
  --as-shimmer-lo: #8b8b94;
  --as-spin-track: #2d2f48;
  --as-count-bg: #2d2d31;
  --as-input-border: #2f2f34;
  --as-border-disabled: #2a2a2e;
  --as-field-disabled: rgba(36, 36, 39, 0.6);
  --as-focus: #8fa0f7;
  --as-hover: rgba(255, 255, 255, 0.07);
  --as-halo: rgba(123, 143, 245, 0.16);
  --as-halo-warn: rgba(240, 200, 137, 0.16);
  --as-kbd-text: #a2a2aa;
  --as-send-icon: #1a1a1d;
  --as-send-on-bg: #f4f4f6;
  --as-send-on-icon: #111111;
  --as-radius: 20px;
  --as-max-width: 480px;

  max-width: var(--as-max-width);
  width: 100%;
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--as-text);
  box-sizing: border-box;
}
.as-root *, .as-root *::before, .as-root *::after { box-sizing: border-box; }

.as-card { background: var(--as-bg); border: 1px solid var(--as-border); border-radius: var(--as-radius); overflow: hidden; display: flex; flex-direction: column; }

.as-head { display: flex; flex-wrap: nowrap; justify-content: space-between; align-items: center; gap: 10px; padding: 16px 18px; border-bottom: 1px solid var(--as-border); }
.as-head-left { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1 1 auto; }
.as-sparkle { color: var(--as-accent); display: flex; align-items: center; justify-content: center; flex: none; transition: color 0.4s ease; }
.as-root[data-status="done"] .as-sparkle { color: var(--as-ok); }
.as-head-text { min-width: 0; }
.as-title { font-size: 19px; font-weight: 650; margin: 0; letter-spacing: -0.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.as-sub { font-size: 14px; color: var(--as-text-muted); margin-top: 3px; display: flex; gap: 6px; align-items: center; white-space: nowrap; }
.as-dot { opacity: 0.5; }

.as-head-right { display: flex; align-items: center; gap: 12px; white-space: nowrap; flex: none; margin-left: auto; }
.as-status-cluster { display: flex; align-items: center; gap: 9px; font-size: 14px; font-weight: 500; color: var(--as-text-muted); font-variant-numeric: tabular-nums; }
.as-status-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--as-accent); box-shadow: 0 0 0 5px var(--as-halo); }
.as-status-dot--paused { background: var(--as-warn); box-shadow: 0 0 0 5px var(--as-halo-warn); }
.as-status-dot--done { background: var(--as-ok); box-shadow: none; }

.as-icon-btn { background: transparent; border: 1px solid var(--as-border); color: var(--as-text-muted); border-radius: 12px; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background-color 0.15s ease, color 0.15s ease; }
.as-icon-btn:hover { background: var(--as-btn); color: var(--as-text); }

.as-plan-container { padding: 20px 20px 6px; }
.as-plan { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.as-step { display: flex; gap: 16px; position: relative; }

.as-step-marker-col { display: flex; flex-direction: column; align-items: center; width: 24px; flex-shrink: 0; }
.as-step-marker { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; z-index: 1; }
.as-empty-circle { width: 20px; height: 20px; border-radius: 50%; border: 2px dashed var(--as-empty); }
.as-check { animation: as-pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1); }
.as-step-line { width: 1px; background: var(--as-line); flex-grow: 1; margin: 4px 0; min-height: 16px; }
.as-step--done .as-step-line { background: var(--as-line); }

.as-spin { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--as-spin-track); border-top-color: var(--as-accent); border-right-color: var(--as-accent); animation: as-rot 1s linear infinite; }
.as-spin--paused { animation-play-state: paused; }
@keyframes as-rot { to { transform: rotate(360deg); } }
@keyframes as-pop { from { transform: scale(0.6); opacity: 0.4; } }

.as-step-body { flex: 1; padding-bottom: 22px; min-width: 0; }
.as-step:last-child .as-step-body { padding-bottom: 12px; }
.as-step-line-content { display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 24px; }
.as-step-title { font-size: 17px; color: var(--as-step-text); transition: color 0.4s ease; }
.as-step--pending .as-step-title { color: var(--as-faint); }
.as-step-clock { font-size: 15px; color: var(--as-clock); font-variant-numeric: tabular-nums; flex: none; }

/* The step in progress shimmers: a bright band runs through its title */
.as-step--active .as-step-title {
  color: transparent;
  background: linear-gradient(100deg, var(--as-shimmer-lo) 0%, var(--as-shimmer-lo) 38%, var(--as-strong) 50%, var(--as-shimmer-lo) 62%, var(--as-shimmer-lo) 100%) 100% 0 / 260% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  animation: as-shimmer 2.4s linear infinite;
}
.as-root:not([data-status="running"]) .as-step--active .as-step-title { animation: none; background: none; color: var(--as-strong); }
@keyframes as-shimmer { to { background-position: 0 0; } }

.as-step-notes { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.as-step-note { font-size: 15px; color: var(--as-note-text); background: var(--as-note-bg); border: 1px solid var(--as-note-border); border-radius: 10px; padding: 11px 13px; display: flex; align-items: center; gap: 10px; animation: as-in 380ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.as-note-icon { color: var(--as-faint); flex-shrink: 0; }
.as-note-text { flex: 1; line-height: 1.4; overflow-wrap: anywhere; }
.as-note-tag { display: flex; align-items: center; gap: 5px; color: var(--as-accent); font-size: 13px; font-weight: 600; flex-shrink: 0; }
@keyframes as-in { from { opacity: 0; transform: translateY(-4px); } }

.as-queue { margin: 0; border-top: 1px solid var(--as-border); padding: 16px 20px 18px; }
.as-queue-head { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; color: var(--as-text-muted); }
.as-count { background: var(--as-count-bg); border-radius: 6px; padding: 2px 8px; font-size: 13px; font-weight: 600; letter-spacing: 0; color: var(--as-soft); }
.as-queue-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.as-chip { position: relative; display: flex; align-items: center; gap: 8px; background: transparent; border: 1px solid var(--as-note-border); border-radius: 14px; padding: 6px 6px 6px 22px; font-size: 16px; color: var(--as-text); animation: as-in 380ms cubic-bezier(0.22, 1, 0.36, 1); }
.as-chip::before { content: ""; position: absolute; left: 0; top: 25%; bottom: 25%; width: 3px; border-radius: 2px; background: var(--as-accent); }
.as-chip-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.as-chip-btn { display: inline-flex; align-items: center; gap: 6px; background: transparent; color: var(--as-soft); border: none; border-radius: 9px; min-height: 44px; padding: 0 12px; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; }
.as-chip-btn:hover { background: var(--as-hover); color: var(--as-strong); }
.as-chip-x { background: transparent; color: var(--as-faint); border: none; border-radius: 9px; width: 44px; min-height: 44px; font-size: 22px; line-height: 1; cursor: pointer; }
.as-chip-x:hover { color: var(--as-strong); background: var(--as-hover); }

.as-field-wrap { padding: 18px 20px 20px; border-top: 1px solid var(--as-border); }
.as-field { position: relative; background: var(--as-input-bg); border: 1px solid var(--as-input-border); border-radius: 14px; display: flex; align-items: center; padding: 5px; transition: border-color 0.15s ease; }
.as-field[data-disabled] { border-color: var(--as-border-disabled); background: var(--as-field-disabled); }
.as-input { width: 100%; background: transparent; border: none; color: var(--as-text); font-family: inherit; font-size: 17px; padding: 12px 12px; outline: none; resize: none; min-height: 26px; }
.as-input, .as-input:focus-visible { outline: none; }
.as-input::placeholder { color: var(--as-faint); }
.as-input:disabled { cursor: default; }
.as-send { background: var(--as-btn); color: var(--as-send-icon); border: none; border-radius: 10px; width: 46px; height: 46px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: background 0.15s, color 0.15s; }
.as-send:not(:disabled) { background: var(--as-send-on-bg); color: var(--as-send-on-icon); }
.as-send:hover:not(:disabled) { background: var(--as-strong); }
.as-send:disabled { cursor: default; }
.as-hint { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 12px; font-size: 14px; color: var(--as-faint); }
.as-kbd-group { display: flex; align-items: center; gap: 6px; }
.as-hint kbd { background: transparent; border: 1px solid var(--as-line); border-radius: 6px; padding: 2px 6px; font-family: inherit; font-size: 13px; color: var(--as-kbd-text); display: flex; align-items: center; justify-content: center; }

.as-icon-btn:focus-visible, .as-chip-btn:focus-visible, .as-chip-x:focus-visible, .as-send:focus-visible { outline: 3px solid var(--as-focus); outline-offset: 2px; }
.as-field:focus-within:not([data-disabled]) { border-color: var(--as-focus); }

.as-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0; }

@media (prefers-reduced-motion: reduce) {
  .as-spin { animation-duration: 2.4s; }
  .as-step--active .as-step-title { animation: none; background: none; color: var(--as-strong); }
  .as-check, .as-step-note, .as-chip { animation: none; }
}
`;
