"use client";

import { useState } from "react";
import { Button } from "../ui/button";

/*
 * Agent Ledger – everything an agent changed in your systems, each change with an undo, in a single self-contained file.
 * Original Xenon component, written from the public one-line description of the affectUI Pro "Agent Ledger".
 * It is not affectUI code. The styles are injected below, so no extra files are needed.
 *
 * Every row shows its before and after. Pointing at Undo (or tapping it) shows what builds on the change and
 * would be undone with it, and what can't be taken back. Tapping Undo arms it; Confirm does it.
 */

export type LedgerAction = "created" | "updated" | "archived" | "sent";

export type LedgerChange = {
  id: string;
  /** Where the change happened – e.g. "Google Sheets" */
  system: string;
  /** What changed – e.g. "Competitor pricing › Plans" */
  target: string;
  action: LedgerAction;
  before: string;
  after: string;
  /** e.g. "6m ago" */
  at: string;
  /** Changes this one builds on: undoing any of them undoes this one too */
  dependsOn?: string[];
  /** Can't be taken back (a sent message, a payment…) – no Undo, and it stays when something under it is undone */
  irreversible?: boolean;
  undone?: boolean;
};

export type AgentLedgerProps = {
  agent: string;
  changes: LedgerChange[];
  /** The ids that were undone together */
  onUndo: (ids: string[]) => void;
  className?: string;
};

/** What undoing `id` touches: the change itself and everything built on it, split by whether it can be taken back */
export function undoPlan(changes: LedgerChange[], id: string) {
  const hit = new Set([id]);
  // Repeat until nothing new builds on the set – a chain of dependencies can be any length
  for (let grew = true; grew; ) {
    grew = false;
    for (const c of changes) {
      if (!c.undone && !hit.has(c.id) && c.dependsOn?.some((d) => hit.has(d))) {
        hit.add(c.id);
        grew = true;
      }
    }
  }
  const touched = changes.filter((c) => hit.has(c.id));
  return {
    undo: touched.filter((c) => !c.irreversible).map((c) => c.id),
    also: touched.filter((c) => c.id !== id && !c.irreversible),
    stays: touched.filter((c) => c.id !== id && c.irreversible),
  };
}

const ACTION_LABEL: Record<LedgerAction, string> = { created: "Created", updated: "Updated", archived: "Archived", sent: "Sent" };

export function AgentLedger({ agent, changes, onUndo, className }: AgentLedgerProps) {
  const [hover, setHover] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);

  // A confirmed undo or a cancel closes the preview; hovering only previews while nothing is armed
  const previewId = armed ?? hover;
  const preview = previewId ? undoPlan(changes, previewId) : null;
  const role = (id: string) => (!preview || !previewId ? undefined : id === previewId ? "self" : preview.also.some((c) => c.id === id) ? "also" : preview.stays.some((c) => c.id === id) ? "stays" : undefined);

  const live = changes.filter((c) => !c.undone).length;
  const locked = changes.filter((c) => c.irreversible && !c.undone).length;

  return (
    <>
      <style href="xn-agent-ledger" precedence="default">
        {css}
      </style>
      <section className={["xn-lg", className].filter(Boolean).join(" ")} aria-label={`Changes made by ${agent}`}>
        <header className="xn-lg__head">
          <div>
            <p className="xn-lg__eyebrow">Ledger · {changes.length} {changes.length === 1 ? "change" : "changes"}</p>
            <h2 className="xn-lg__title">What {agent} changed in your systems</h2>
          </div>
          <p className="xn-lg__sum">
            {live} in effect{locked > 0 && <> · <span className="xn-lg__sum-lock">{locked} can't be undone</span></>}
          </p>
        </header>

        <ol className="xn-lg__list">
          {[...changes].reverse().map((c) => {
            const r = role(c.id);
            const isArmed = armed === c.id;
            return (
              <li key={c.id} className="xn-lg__row" data-undone={c.undone || undefined} data-role={r}>
                <div className="xn-lg__top">
                  <span className="xn-lg__system">{c.system}</span>
                  <span className="xn-lg__target">{c.target}</span>
                  <span className="xn-lg__action" data-action={c.action}>
                    {ACTION_LABEL[c.action]}
                  </span>
                  <span className="xn-lg__at">{c.undone ? "Undone" : c.at}</span>
                </div>

                <div className="xn-lg__diff" aria-label="Before and after">
                  <p className="xn-lg__side xn-lg__side--before">
                    <small>Before</small>
                    {c.before}
                  </p>
                  <span className="xn-lg__arrow" aria-hidden="true">
                    →
                  </span>
                  <p className="xn-lg__side xn-lg__side--after">
                    <small>After</small>
                    {c.after}
                  </p>
                </div>

                <div className="xn-lg__foot">
                  {r === "also" && <span className="xn-lg__tag xn-lg__tag--also">Would be undone too</span>}
                  {r === "stays" && <span className="xn-lg__tag xn-lg__tag--stays">Can't be taken back · stays</span>}
                  {!r && c.irreversible && !c.undone && <span className="xn-lg__tag xn-lg__tag--lock">Can't be taken back</span>}
                  {!r && c.dependsOn && !c.undone && !c.irreversible && <span className="xn-lg__tag">Builds on an earlier change</span>}

                  {!c.undone && !c.irreversible && !isArmed && (
                    <button
                      type="button"
                      className="xn-lg__undo"
                      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(c.id)}
                      onPointerLeave={() => setHover(null)}
                      onFocus={() => setHover(c.id)}
                      onBlur={() => setHover(null)}
                      onClick={() => setArmed(c.id)}
                    >
                      Undo
                    </button>
                  )}
                </div>

                {isArmed && preview && (
                  <div className="xn-lg__confirm" role="alert">
                    <p>
                      {preview.undo.length === 1 ? "This undoes just this change." : `This undoes ${preview.undo.length} changes: this one and ${preview.undo.length - 1} built on it.`}
                      {preview.stays.length > 0 && <b> {preview.stays.length === 1 ? "One change" : `${preview.stays.length} changes`} can't be taken back and will stay.</b>}
                    </p>
                    <div className="xn-lg__confirm-actions">
                      <Button
                        variant="secondary"
                        size="md"
                        onClick={() => {
                          setArmed(null);
                          setHover(null);
                        }}
                      >
                        Keep
                      </Button>
                      <Button
                        size="md"
                        onClick={() => {
                          onUndo(preview.undo);
                          setArmed(null);
                          setHover(null);
                        }}
                      >
                        {preview.undo.length === 1 ? "Undo change" : `Undo ${preview.undo.length} changes`}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}

const css = /* css */ `
.xn-lg {
  --xn-lg-card: #131e2b;
  --xn-lg-row: #182536;
  --xn-lg-line: #304158;
  --xn-lg-ink: #f4f6fb;
  --xn-lg-muted: #a9bed3;
  --xn-lg-faint: #7d90a8;
  --xn-lg-before: #ff9a92;
  --xn-lg-after: #8fe0b8;
  --xn-lg-warn: #f0c889;
  --xn-lg-ease: cubic-bezier(0.22, 1, 0.36, 1);
  box-sizing: border-box;
  width: 100%;
  max-width: 820px;
  padding: 24px 24px 12px;
  background: var(--xn-lg-card);
  border: 1px solid var(--xn-lg-line);
  border-radius: 18px;
  color: var(--xn-lg-ink);
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.xn-lg *, .xn-lg *::before, .xn-lg *::after { box-sizing: border-box; }

.xn-lg__head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
.xn-lg__eyebrow { margin: 0; font-size: 14px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--xn-lg-faint); }
.xn-lg__title { margin: 6px 0 0; font-size: 24px; font-weight: 650; letter-spacing: -0.025em; line-height: 1.2; }
.xn-lg__sum { margin: 0; font-size: 15px; color: var(--xn-lg-muted); }
.xn-lg__sum-lock { color: var(--xn-lg-warn); }

.xn-lg__list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
.xn-lg__row { padding: 16px 18px; background: var(--xn-lg-row); border: 1px solid transparent; border-radius: 14px; transition: border-color 200ms ease, background-color 200ms ease, opacity 300ms ease; animation: xn-lg-in 420ms var(--xn-lg-ease) both; }
.xn-lg__row[data-role="self"] { border-color: rgba(158, 203, 255, 0.55); background: #1d3149; }
.xn-lg__row[data-role="also"] { border-color: rgba(240, 200, 137, 0.7); background: #1d2c3f; box-shadow: 0 0 0 3px rgba(240, 200, 137, 0.1); }
.xn-lg__row[data-role="stays"] { border-color: rgba(255, 143, 134, 0.7); background: #1d2c3f; box-shadow: 0 0 0 3px rgba(255, 143, 134, 0.1); }
.xn-lg__row[data-undone] { opacity: 0.5; }
.xn-lg__row[data-undone] .xn-lg__diff { text-decoration: line-through; text-decoration-color: rgba(255, 255, 255, 0.25); }

.xn-lg__top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.xn-lg__system { padding: 3px 9px; border-radius: 8px; background: rgba(255, 255, 255, 0.08); font-size: 13px; font-weight: 650; color: var(--xn-lg-muted); }
.xn-lg__target { flex: 1; min-width: 0; font-size: 18px; font-weight: 600; overflow-wrap: anywhere; }
.xn-lg__action { font-size: 13px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--xn-lg-faint); }
.xn-lg__at { font-size: 14px; color: var(--xn-lg-faint); min-width: 56px; text-align: right; }

.xn-lg__diff { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: stretch; gap: 10px; margin-top: 12px; }
.xn-lg__side { margin: 0; padding: 10px 12px; border-radius: 10px; font-size: 16px; line-height: 1.35; overflow-wrap: anywhere; }
.xn-lg__side small { display: block; margin-bottom: 3px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.75; }
.xn-lg__side--before { background: rgba(255, 255, 255, 0.045); color: #c5d3e3; }
.xn-lg__side--before small { color: var(--xn-lg-before); opacity: 1; }
.xn-lg__side--after { background: rgba(143, 224, 184, 0.09); color: #c3efd8; }
.xn-lg__side--after small { color: var(--xn-lg-after); opacity: 1; }
.xn-lg__arrow { align-self: center; color: var(--xn-lg-faint); font-size: 18px; }

.xn-lg__foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 8px; margin-top: 10px; }
.xn-lg__foot:has(> *) { min-height: 44px; }
.xn-lg__tag { font-size: 14px; color: var(--xn-lg-faint); }
.xn-lg__tag--also { color: var(--xn-lg-warn); font-weight: 600; }
.xn-lg__tag--stays, .xn-lg__tag--lock { color: #ff9a92; font-weight: 600; }
.xn-lg__undo { margin-left: auto; min-height: 44px; padding: 0 20px; border: 0; border-radius: 11px; background: rgba(255, 255, 255, 0.07); color: var(--xn-lg-ink); font: inherit; font-size: 15px; font-weight: 650; cursor: pointer; transition: background-color 160ms ease; }
.xn-lg__undo:hover { background: rgba(255, 255, 255, 0.13); }
.xn-lg__undo:focus-visible { outline: 3px solid #89bdff; outline-offset: 2px; }

.xn-lg__confirm { margin-top: 12px; padding: 14px 16px; border-radius: 12px; background: rgba(0, 0, 0, 0.22); animation: xn-lg-in 320ms var(--xn-lg-ease) both; }
.xn-lg__confirm p { margin: 0 0 12px; font-size: 16px; line-height: 1.45; color: #d6e3f1; }
.xn-lg__confirm b { color: #ff9a92; font-weight: 600; }
.xn-lg__confirm-actions { display: flex; gap: 10px; justify-content: flex-end; }

@keyframes xn-lg-in { from { opacity: 0; transform: translateY(5px); } }

@media (max-width: 700px) {
  .xn-lg__diff { grid-template-columns: minmax(0, 1fr); }
  .xn-lg__arrow { transform: rotate(90deg); justify-self: start; margin-left: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .xn-lg__row, .xn-lg__confirm { animation: none; }
}
`;
