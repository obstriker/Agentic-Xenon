"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import type { SteerNote } from "./agent-steering";

/*
 * Agent Plan – an agent's step list as a timeline you can still change, in a single self-contained file.
 * Original Xenon component, written from the public one-line description of the affectUI Pro "Agent Plan".
 * It is not affectUI code. The styles are injected below, so no extra files are needed.
 *
 * Finished, running and failed steps are fixed. Queued steps can be renamed, moved, removed, and new ones added.
 * A failed step offers "Retry from here".
 */

export type PlanStatus = "done" | "running" | "waiting" | "failed" | "queued";

export type PlanStep = {
  id: string;
  label: string;
  status: PlanStatus;
  /** One line under the label */
  detail?: string;
  /** The tool the step calls, shown as a chip – e.g. "stripe.query" */
  tool?: string;
  /** How long a finished step took, in ms */
  duration?: number;
  /** When a running step began (ms since epoch) – its timer counts from here */
  startedAt?: number;
  /** Set while the run is paused – the timer stops here */
  pausedAt?: number;
  /** Why a failed step stopped */
  error?: string;
  /** Steering notes the agent picked up while on this step */
  notes?: SteerNote[];
};

export type AgentPlanProps = {
  /** What the plan is for – the heading */
  goal: string;
  steps: PlanStep[];
  onChange: (steps: PlanStep[]) => void;
  /** Label of the field for a new step */
  addLabel?: string;
  className?: string;
};

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const took = (ms: number) => (ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : clock(ms));

export function AgentPlan({ goal, steps, onChange, addLabel = "Add a step", className }: AgentPlanProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [added, setAdded] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const counter = useRef(0);

  // One clock for every running timer
  const ticking = steps.some((s) => s.status === "running" && s.pausedAt === undefined);
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);

  const move = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= steps.length || steps[to].status !== "queued") return;
    const next = steps.slice();
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };

  const commit = (id: string) => {
    const label = draft.trim();
    setEditing(null);
    if (label) onChange(steps.map((s) => (s.id === id ? { ...s, label } : s)));
  };

  const add = () => {
    const label = added.trim();
    if (!label) return;
    onChange([...steps, { id: `new-${++counter.current}`, label, status: "queued" }]);
    setAdded("");
  };

  const retry = (id: string) => onChange(steps.map((s) => (s.id === id ? { ...s, status: "running", error: undefined, startedAt: Date.now() } : s)));

  // The footer says where the run stands
  const failedAt = steps.findIndex((s) => s.status === "failed");
  const waitingAt = steps.findIndex((s) => s.status === "waiting");
  const runningAt = steps.findIndex((s) => s.status === "running");
  const summary =
    failedAt >= 0
      ? { tone: "failed", text: `Stopped · step ${failedAt + 1} failed` }
      : waitingAt >= 0
        ? { tone: "waiting", text: `Paused · step ${waitingAt + 1} waits for you` }
        : runningAt >= 0
          ? { tone: "running", text: `Running · step ${runningAt + 1} of ${steps.length}` }
          : steps.every((s) => s.status === "done")
            ? { tone: "done", text: `Completed · ${steps.length} steps` }
            : { tone: "queued", text: "Ready to run" };

  return (
    <>
      <style href="xn-agent-plan" precedence="default">
        {css}
      </style>
      <section className={["xn-pl", className].filter(Boolean).join(" ")} aria-label={`Plan: ${goal}`}>
        <div className="xn-pl__top">
          <p className="xn-pl__eyebrow">
            <ListIcon />
            Plan · {steps.length} {steps.length === 1 ? "step" : "steps"}
          </p>
          <h2 className="xn-pl__goal">{goal}</h2>
        </div>

        <ol className="xn-pl__list">
          {steps.map((s, i) => {
            const queued = s.status === "queued";
            const canUp = queued && steps[i - 1]?.status === "queued";
            const canDown = queued && steps[i + 1]?.status === "queued";
            return (
              <li key={s.id} className="xn-pl__step" data-status={s.status} data-last={i === steps.length - 1 || undefined}>
                <span className="xn-pl__mark" aria-hidden="true">
                  {s.status === "done" ? <CheckIcon /> : s.status === "running" ? <span className="xn-pl__spin" /> : s.status === "failed" || s.status === "waiting" ? "!" : i + 1}
                </span>

                <div className="xn-pl__body">
                  <div className="xn-pl__line">
                    {editing === s.id ? (
                      <input
                        className="xn-pl__input"
                        autoFocus
                        value={draft}
                        aria-label={`Rename step ${i + 1}`}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => commit(s.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commit(s.id);
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                    ) : queued ? (
                      <button
                        type="button"
                        className="xn-pl__label xn-pl__label--edit"
                        title="Rename"
                        onClick={() => {
                          setDraft(s.label);
                          setEditing(s.id);
                        }}
                      >
                        {s.label}
                      </button>
                    ) : (
                      <span className="xn-pl__label">{s.label}</span>
                    )}

                    {s.status === "done" && s.duration != null && <span className="xn-pl__time">{took(s.duration)}</span>}
                    {s.status === "running" && s.startedAt != null && (
                      <span className="xn-pl__time xn-pl__time--live" data-paused={s.pausedAt !== undefined || undefined}>
                        {clock((s.pausedAt ?? now) - s.startedAt)}
                      </span>
                    )}
                    {queued && (
                      <span className="xn-pl__tools">
                        <button type="button" className="xn-pl__tool" disabled={!canUp} aria-label={`Move step ${i + 1} up`} onClick={() => move(i, -1)}>
                          <ArrowIcon />
                        </button>
                        <button type="button" className="xn-pl__tool xn-pl__tool--down" disabled={!canDown} aria-label={`Move step ${i + 1} down`} onClick={() => move(i, 1)}>
                          <ArrowIcon />
                        </button>
                        <button type="button" className="xn-pl__tool xn-pl__tool--remove" aria-label={`Remove step ${i + 1}`} onClick={() => onChange(steps.filter((x) => x.id !== s.id))}>
                          <CrossIcon />
                        </button>
                      </span>
                    )}
                  </div>

                  {(s.detail || s.tool) && (
                    <p className="xn-pl__sub">
                      {s.detail}
                      {s.tool && <code className="xn-pl__tool-chip">{s.tool}</code>}
                    </p>
                  )}

                  {s.notes && s.notes.length > 0 && (
                    <ul className="xn-pl__steer" aria-label="Steering notes">
                      {s.notes.map((n) => (
                        <li key={n.id}>
                          <span className="xn-pl__steer-text">{n.text}</span>
                          <span className="xn-pl__steer-tag">{n.picked === "now" ? "Interrupted" : "Picked up"}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {s.status === "waiting" && <p className="xn-pl__note xn-pl__note--waiting">Waiting for you</p>}
                  {s.status === "failed" && (
                    <>
                      <p className="xn-pl__note xn-pl__note--failed">{s.error ?? "This step failed"}</p>
                      <Button variant="secondary" size="md" onClick={() => retry(s.id)} icon={<RetryIcon />}>
                        Retry from here
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <form
          className="xn-pl__add"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input className="xn-pl__input" value={added} placeholder={`${addLabel}…`} aria-label={addLabel} onChange={(e) => setAdded(e.target.value)} />
          <button type="submit" className="xn-pl__addbtn" disabled={!added.trim()}>
            Add
          </button>
        </form>

        <footer className="xn-pl__foot" data-tone={summary.tone} role="status">
          <span className="xn-pl__foot-mark" aria-hidden="true">
            {summary.tone === "done" ? <CheckIcon /> : summary.tone === "running" ? <span className="xn-pl__spin" /> : summary.tone === "queued" ? "·" : "!"}
          </span>
          {summary.text}
        </footer>
      </section>
    </>
  );
}

const CheckIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);
const ArrowIcon = () => (
  <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 12.5v-9M4 7l4-4 4 4" />
  </svg>
);
const CrossIcon = () => (
  <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M4 4l8 8m0-8l-8 8" />
  </svg>
);
const RetryIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3" />
  </svg>
);
const ListIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M6 4h7M6 8h7M6 12h7" />
    <circle cx="2.7" cy="4" r=".6" fill="currentColor" />
    <circle cx="2.7" cy="8" r=".6" fill="currentColor" />
    <circle cx="2.7" cy="12" r=".6" fill="currentColor" />
  </svg>
);

const css = /* css */ `
.xn-pl {
  --xn-pl-card: #131e2b;
  --xn-pl-line: #304158;
  --xn-pl-ink: #f4f6fb;
  --xn-pl-muted: #a9bed3;
  --xn-pl-faint: #7d90a8;
  --xn-pl-ok: #8fe0b8;
  --xn-pl-live: #9ecbff;
  --xn-pl-warn: #f0c889;
  --xn-pl-bad: #ff8f86;
  --xn-pl-ease: cubic-bezier(0.22, 1, 0.36, 1);
  box-sizing: border-box;
  width: 100%;
  max-width: 820px;
  background: var(--xn-pl-card);
  border: 1px solid var(--xn-pl-line);
  border-radius: 18px;
  color: var(--xn-pl-ink);
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
}
.xn-pl *, .xn-pl *::before, .xn-pl *::after { box-sizing: border-box; }

.xn-pl__top { padding: 24px 28px 6px; }
.xn-pl__eyebrow { display: flex; align-items: center; gap: 9px; margin: 0; font-size: 16px; color: var(--xn-pl-faint); }
.xn-pl__goal { margin: 8px 0 0; font-size: 28px; font-weight: 650; letter-spacing: -0.03em; line-height: 1.2; }

.xn-pl__list { margin: 0; padding: 18px 28px 6px; list-style: none; }
.xn-pl__step { position: relative; display: flex; gap: 18px; padding-bottom: 20px; animation: xn-pl-in 480ms var(--xn-pl-ease) both; }
.xn-pl__step[data-last] { padding-bottom: 12px; }
.xn-pl__time--live[data-paused] { color: var(--xn-pl-faint); }

/* The line that ties a step to the next one; blue once the step is finished */
.xn-pl__step:not([data-last])::after { content: ""; position: absolute; left: 17px; top: 42px; bottom: 6px; width: 2px; border-radius: 1px; background: #2b3b50; }
.xn-pl__step[data-status="done"]:not([data-last])::after { background: #4f7fb8; }

.xn-pl__mark { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; font-size: 15px; font-weight: 700; border: 1.5px solid #3a4c63; color: var(--xn-pl-muted); background: transparent; }
.xn-pl__step[data-status="done"] .xn-pl__mark { border-color: transparent; background: #4f7fb8; color: #fff; }
.xn-pl__step[data-status="running"] .xn-pl__mark { border-color: var(--xn-pl-live); color: var(--xn-pl-live); background: rgba(158, 203, 255, 0.1); }
.xn-pl__step[data-status="waiting"] .xn-pl__mark { border-color: transparent; background: rgba(240, 200, 137, 0.16); color: var(--xn-pl-warn); }
.xn-pl__step[data-status="failed"] .xn-pl__mark { border-color: transparent; background: rgba(255, 143, 134, 0.16); color: var(--xn-pl-bad); }
.xn-pl__spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: xn-pl-spin 800ms linear infinite; }

.xn-pl__body { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding-top: 3px; }
.xn-pl__line { align-self: stretch; display: flex; align-items: center; gap: 14px; min-height: 30px; }
.xn-pl__label { flex: 1; min-width: 0; margin: 0; padding: 0; border: 0; background: none; font: inherit; font-size: 20px; font-weight: 600; text-align: start; color: var(--xn-pl-ink); overflow-wrap: anywhere; }
.xn-pl__step[data-status="queued"] .xn-pl__label { color: var(--xn-pl-muted); }
.xn-pl__label--edit { cursor: text; border-radius: 6px; }
.xn-pl__label--edit:hover { text-decoration: underline dotted rgba(255, 255, 255, 0.4); text-underline-offset: 4px; }
.xn-pl__label--edit:focus-visible { outline: 3px solid #89bdff; outline-offset: 3px; }

.xn-pl__time { flex: none; font-variant-numeric: tabular-nums; font-size: 17px; color: var(--xn-pl-faint); }
.xn-pl__time--live { font-weight: 650; color: var(--xn-pl-live); }

.xn-pl__sub { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; font-size: 17px; color: var(--xn-pl-faint); }
.xn-pl__tool-chip { padding: 3px 9px; border-radius: 8px; background: rgba(255, 255, 255, 0.07); color: #c5d5e5; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 14.5px; }
.xn-pl__note { margin: 0; font-size: 17px; }
.xn-pl__note--failed { color: var(--xn-pl-bad); }
.xn-pl__note--waiting { color: var(--xn-pl-warn); }
.xn-pl__body .ui-button { margin-top: 4px; }
.xn-pl__steer { align-self: stretch; display: flex; flex-direction: column; gap: 8px; margin: 4px 0 0; padding: 0; list-style: none; }
.xn-pl__steer li { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 10px; background: #182536; border: 1px solid #33445b; font-size: 16px; color: #c5d5e5; }
.xn-pl__steer-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.xn-pl__steer-tag { flex: none; font-size: 13px; font-weight: 650; color: var(--xn-pl-live); }

.xn-pl__tools { flex: none; display: inline-flex; gap: 6px; }
.xn-pl__tool { display: grid; place-items: center; width: 44px; height: 44px; margin: -7px 0; border: 0; border-radius: 11px; background: rgba(255, 255, 255, 0.06); color: var(--xn-pl-muted); cursor: pointer; transition: background-color 160ms ease, color 160ms ease, opacity 160ms ease; }
.xn-pl__tool:hover:not(:disabled) { background: rgba(255, 255, 255, 0.12); color: var(--xn-pl-ink); }
.xn-pl__tool:disabled { opacity: 0.3; cursor: default; }
.xn-pl__tool--down svg { transform: rotate(180deg); }
.xn-pl__tool--remove:hover:not(:disabled) { background: rgba(255, 123, 114, 0.16); color: #ff9a92; }
.xn-pl__tool:focus-visible { outline: 3px solid #89bdff; outline-offset: 2px; }

.xn-pl__input { width: 100%; min-height: 48px; padding: 0 14px; border: 1px solid #58708d; border-radius: 12px; background: #0e1928; color: var(--xn-pl-ink); font: inherit; font-size: 18px; }
.xn-pl__input:focus-visible { outline: 3px solid #89bdff; outline-offset: 2px; }
.xn-pl__add { display: flex; gap: 10px; padding: 4px 28px 22px 82px; }
.xn-pl__addbtn { flex: none; min-height: 48px; padding: 0 22px; border: 0; border-radius: 12px; background: linear-gradient(#f4f4f5, #dfe3e8); color: #121c2a; font: inherit; font-size: 16px; font-weight: 650; cursor: pointer; }
.xn-pl__addbtn:disabled { opacity: 0.4; cursor: default; }
.xn-pl__addbtn:focus-visible { outline: 3px solid #89bdff; outline-offset: 2px; }

.xn-pl__foot { display: flex; align-items: center; gap: 12px; padding: 18px 28px; border-top: 1px solid var(--xn-pl-line); font-size: 19px; font-weight: 500; color: var(--xn-pl-muted); }
.xn-pl__foot[data-tone="failed"] { color: var(--xn-pl-bad); }
.xn-pl__foot[data-tone="waiting"] { color: var(--xn-pl-warn); }
.xn-pl__foot[data-tone="running"] { color: var(--xn-pl-live); }
.xn-pl__foot[data-tone="done"] { color: var(--xn-pl-ok); }
.xn-pl__foot-mark { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; font-size: 14px; font-weight: 700; background: color-mix(in srgb, currentColor 16%, transparent); }

@keyframes xn-pl-in { from { opacity: 0; transform: translateY(6px); } }
@keyframes xn-pl-spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .xn-pl__step { animation: none; }
  .xn-pl__spin { animation-duration: 2.4s; }
}
`;
