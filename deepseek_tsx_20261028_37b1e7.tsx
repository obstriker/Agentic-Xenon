import * as React from "react";

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
  onQueue?: (text: string) => void;
  onInterrupt?: (text: string, queuedId?: string) => void;
  onRemove?: (id: string) => void;
  onPause?: () => void;
  onResume?: () => void;
  draft?: string;
  onDraftChange?: (text: string) => void;
  placeholder?: string;
  className?: string;
}

/* ------------------------------------------------------------------ helpers */

function formatClock(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function useTicker(active: boolean, interval = 1000) {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    if (!active) return;
    const id = window.setInterval(force, interval);
    return () => window.clearInterval(id);
  }, [active, interval]);
}

function useNow(active: boolean) {
  useTicker(active);
  return Date.now();
}

/* ---------------------------------------------------------------- main comp */

export function AgentSteering({
  title,
  agent,
  steps,
  queue = [],
  status = "running",
  startedAt,
  onQueue,
  onInterrupt,
  onRemove,
  onPause,
  onResume,
  draft,
  onDraftChange,
  placeholder = "Steer the agent…",
  className = "",
}: AgentSteeringProps) {
  const [internalDraft, setInternalDraft] = React.useState("");
  const text = draft !== undefined ? draft : internalDraft;
  const setText = (v: string) => {
    if (draft === undefined) setInternalDraft(v);
    onDraftChange?.(v);
  };

  const startMs =
    startedAt instanceof Date
      ? startedAt.getTime()
      : typeof startedAt === "number"
        ? startedAt
        : undefined;

  const now = useNow(status === "running");

  const activeIndex = steps.findIndex((s) => s.status === "active");
  const stepLabel =
    activeIndex >= 0 ? `Step ${activeIndex + 1} of ${steps.length}` : null;

  const submit = (interrupt: boolean) => {
    const value = text.trim();
    if (!value) return;
    if (interrupt) onInterrupt?.(value);
    else onQueue?.(value);
    setText("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      setText("");
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(e.metaKey || e.ctrlKey);
    }
  };

  const live = React.useMemo(() => {
    const picked = steps
      .flatMap((s) => s.notes?.filter((n) => n.picked) ?? [])
      .map((n) => `Agent picked up note: ${n.text}`);
    return picked.slice(-1).join(" ");
  }, [steps]);

  return (
    <div className={`as-root ${className}`}>
      <style>{css}</style>

      <div className="as-card">
        {/* header */}
        <header className="as-head">
          <div className="as-head-left">
            <div className="as-sparkle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v18M3 12h18M5.5 5.5l13 13M5.5 18.5l13-13"/>
              </svg>
            </div>
            <div className="as-head-text">
              <h2 className="as-title">{title}</h2>
              <div className="as-sub">
                <span>{agent}</span>
                <span className="as-dot">·</span>
                <span>{stepLabel}</span>
              </div>
            </div>
          </div>
          
          <div className="as-head-right">
            {status !== "done" && (
              <div className="as-status-cluster">
                <span className={`as-status-dot as-status-dot--${status}`} />
                <span className="as-status-text">
                  {status === "running" ? "Running" : "Paused"}
                  {startMs && status === "running" && (
                    <> · {formatClock(now - startMs)}</>
                  )}
                </span>
              </div>
            )}
            {status === "running" ? (
              <button type="button" className="as-icon-btn" onClick={onPause} aria-label="Pause">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>
              </button>
            ) : status === "paused" ? (
              <button type="button" className="as-icon-btn" onClick={onResume} aria-label="Resume">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>
              </button>
            ) : null}
          </div>
        </header>

        {/* plan */}
        <div className="as-plan-container">
          <ol className="as-plan" aria-label="Plan">
            {steps.map((step, i) => (
              <StepRow
                key={step.id}
                step={step}
                index={i}
                isLast={i === steps.length - 1}
                running={status === "running"}
                now={now}
              />
            ))}
          </ol>
        </div>

        {/* queue */}
        {queue.length > 0 && (
          <div className="as-queue">
            <div className="as-queue-head">
              <span>Queued for the next step</span>
              <span className="as-count">{queue.length}</span>
            </div>
            <ul className="as-queue-list">
              {queue.map((n) => (
                <li key={n.id} className="as-chip">
                  <span className="as-chip-text">{n.text}</span>
                  <button
                    type="button"
                    className="as-chip-btn"
                    onClick={() => onInterrupt?.(n.text, n.id)}
                  >
                    Now
                  </button>
                  <button
                    type="button"
                    className="as-chip-x"
                    onClick={() => onRemove?.(n.id)}
                    aria-label={`Remove “${n.text}”`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* field */}
        {status !== "done" && (
          <div className="as-field-wrap">
            <div className="as-field">
              <textarea
                className="as-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                aria-label="Steer the agent"
                rows={1}
              />
              <button
                type="button"
                className="as-send"
                onClick={() => submit(false)}
                aria-label="Queue for the next step"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
              </button>
            </div>
            <div className="as-hint">
              <span className="as-kbd-group"><kbd>↵</kbd> next step</span>
              <span className="as-kbd-group"><kbd>Ctrl</kbd> <kbd>↵</kbd> interrupt now</span>
            </div>
          </div>
        )}
      </div>

      <div className="as-sr" aria-live="polite" aria-atomic="true">{live}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- step row */

function StepRow({
  step,
  index,
  isLast,
  running,
  now,
}: {
  step: SteerStep;
  index: number;
  isLast: boolean;
  running: boolean;
  now: number;
}) {
  const state = step.status ?? "pending";

  let clock: string | null = null;
  if (state === "done" && typeof step.duration === "number") {
    clock = formatDuration(step.duration);
  } else if (state === "active" && step.startedAt !== undefined) {
    clock = formatDuration(now - step.startedAt);
  }

  return (
    <li className={`as-step as-step--${state}`} aria-current={state === "active" ? "step" : undefined}>
      <div className="as-step-marker-col">
        <span className="as-step-marker" aria-hidden="true">
          {state === "done" ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--as-check-bg)" stroke="none"><circle cx="12" cy="12" r="12"/><path d="M7 12.5l3.5 3.5 7-7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
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
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="as-note-icon"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>
                <span className="as-note-text">{n.text}</span>
                <span className="as-note-tag">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                  {n.picked === "now" ? "Interrupted" : "Picked up"}
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

const css = `
.as-root {
  --as-bg: #141416;
  --as-border: #2a2a2e;
  --as-text: #f0f0f4;
  --as-text-muted: #8c8c96;
  --as-accent: #5c8bff;
  --as-check-bg: #3b6eff;
  --as-note-bg: #1c1c20;
  --as-note-border: #2e2e33;
  --as-input-bg: #1a1a1c;
  
  max-width: 460px;
  width: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--as-text);
  box-sizing: border-box;
}

.as-card {
  background: var(--as-bg);
  border: 1px solid var(--as-border);
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.as-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 18px;
  border-bottom: 1px solid var(--as-border);
}

.as-head-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.as-sparkle {
  color: var(--as-accent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.as-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
}

.as-sub {
  font-size: 13px;
  color: var(--as-text-muted);
  margin-top: 2px;
  display: flex;
  gap: 6px;
  align-items: center;
}

.as-dot { opacity: 0.5; }

.as-head-right {
  display: flex;
  align-items: center;
  gap: 12px;
  white-space: nowrap;
}

.as-status-cluster {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  font-weight: 500;
  color: #a0a0ab;
}

.as-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--as-accent);
}
.as-status-dot--paused { background: #e6a800; }

.as-icon-btn {
  background: transparent;
  border: 1px solid var(--as-border);
  color: #a0a0ab;
  border-radius: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}
.as-icon-btn:hover { background: #2a2a2e; color: var(--as-text); }

.as-plan-container {
  padding: 18px 18px 6px;
}

.as-plan {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.as-step {
  display: flex;
  gap: 14px;
  position: relative;
}

.as-step-marker-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20px;
  flex-shrink: 0;
}

.as-step-marker {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.as-empty-circle {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #3f3f46;
}

.as-step-line {
  width: 1.5px;
  background: #2a2a2e;
  flex-grow: 1;
  margin: 4px 0;
  min-height: 16px;
}

.as-spin {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid #2e2e33;
  border-top-color: var(--as-accent);
  border-right-color: var(--as-accent);
  animation: as-rot 1s linear infinite;
}
.as-spin--paused { animation-play-state: paused; }
@keyframes as-rot { to { transform: rotate(360deg); } }

.as-step-body {
  flex: 1;
  padding-bottom: 22px;
  min-width: 0;
}

.as-step:last-child .as-step-body {
  padding-bottom: 12px;
}

.as-step-line-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 20px;
}

.as-step-title {
  font-size: 14px;
  color: var(--as-text);
}

.as-step--pending .as-step-title { color: var(--as-text-muted); }

.as-step-clock {
  font-size: 13px;
  color: var(--as-text-muted);
  font-variant-numeric: tabular-nums;
}

.as-step-notes {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.as-step-note {
  font-size: 13.5px;
  color: #b0b0b8;
  background: var(--as-note-bg);
  border: 1px solid var(--as-note-border);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.as-note-icon {
  color: #6b6b76;
  flex-shrink: 0;
}

.as-note-text {
  flex: 1;
  line-height: 1.4;
}

.as-note-tag {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--as-accent);
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
}

.as-queue {
  margin: 0 18px 14px;
  border-top: 1px dashed #2a2a2e;
  padding-top: 14px;
}

.as-queue-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--as-text-muted);
}

.as-count {
  background: #2a2a2e;
  border-radius: 99px;
  padding: 1px 7px;
  font-size: 11px;
  font-weight: 600;
  color: #a0a0ab;
}

.as-queue-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.as-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--as-note-bg);
  border: 1px solid var(--as-note-border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--as-text);
}

.as-chip-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.as-chip-btn {
  background: #3f3f46;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}
.as-chip-btn:hover { background: #52525b; }

.as-chip-x {
  background: transparent;
  color: #6b6b76;
  border: none;
  font-size: 12px;
  cursor: pointer;
  padding: 4px;
}
.as-chip-x:hover { color: #fff; }

.as-field-wrap {
  padding: 0 18px 18px;
}

.as-field {
  position: relative;
  background: var(--as-input-bg);
  border: 1px solid var(--as-border);
  border-radius: 12px;
  display: flex;
  align-items: center;
  padding: 4px;
}

.as-input {
  width: 100%;
  background: transparent;
  border: none;
  color: var(--as-text);
  font-family: inherit;
  font-size: 14px;
  padding: 10px 12px;
  outline: none;
  resize: none;
  min-height: 24px;
}

.as-input::placeholder { color: #52525b; }

.as-send {
  background: #3f3f46;
  color: #a0a0ab;
  border: none;
  border-radius: 8px;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  margin-right: 2px;
}
.as-send:hover { background: #52525b; color: #fff; }

.as-hint {
  display: flex;
  gap: 16px;
  margin-top: 12px;
  font-size: 12px;
  color: #6b6b76;
}

.as-kbd-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.as-hint kbd {
  background: #1c1c20;
  border: 1px solid #2e2e33;
  border-radius: 4px;
  padding: 2px 5px;
  font-family: inherit;
  font-size: 11px;
  color: #a0a0ab;
  display: flex;
  align-items: center;
  justify-content: center;
}

.as-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
`;