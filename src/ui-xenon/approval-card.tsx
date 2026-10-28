"use client";

import { useEffect, useRef, type ReactNode } from "react";

/*
 * Approval Card – an agent asks before it acts, in a single self-contained file.
 * Original Xenon component, written from the public one-line description of the affectUI Pro "Approval Card".
 * It is not affectUI code. The styles are injected below, so no extra files are needed.
 */

export type ApprovalRisk = "low" | "medium" | "high";

export type ApprovalAction = {
  id: string;
  label: string;
  tone: "approve" | "deny";
  /** One key that picks this answer while the card is on screen, e.g. "1" or "d" */
  shortcut?: string;
};

export type ApprovalCardProps = {
  agent: string;
  question: string;
  /** Why the agent is asking */
  details?: string;
  risk: ApprovalRisk;
  /** What will happen if approved, one fact per row */
  preview: { label: string; value: ReactNode }[];
  actions: ApprovalAction[];
  /** The label of the chosen answer once decided – the card folds into one line */
  resolved?: string;
  onResolve: (action: ApprovalAction) => void;
  onUndo?: () => void;
  className?: string;
};

const RISK_LABEL: Record<ApprovalRisk, string> = { low: "Low risk", medium: "Medium risk", high: "High risk" };

export function ApprovalCard({ agent, question, details, risk, preview, actions, resolved, onResolve, onUndo, className }: ApprovalCardProps) {
  const root = useRef<HTMLElement>(null);
  const latest = useRef({ actions, onResolve, resolved });
  latest.current = { actions, onResolve, resolved };

  // Shortcuts work only while the card is actually visible and nobody is typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { actions, onResolve, resolved } = latest.current;
      const el = root.current;
      if (resolved || !el || el.offsetParent === null || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const hit = actions.find((a) => a.shortcut && a.shortcut.toLowerCase() === e.key.toLowerCase());
      if (hit) {
        e.preventDefault();
        onResolve(hit);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const chosen = actions.find((a) => a.label === resolved);

  return (
    <>
      <style href="xn-approval-card" precedence="default">
        {css}
      </style>
      <section
        ref={root}
        className={["xn-ap", className].filter(Boolean).join(" ")}
        data-risk={risk}
        data-resolved={resolved ? (chosen?.tone ?? "approve") : undefined}
        aria-label={`Approval request from ${agent}`}
      >
        <div className="xn-ap__fold" inert={Boolean(resolved)}>
          <div className="xn-ap__fold-inner">
            <header className="xn-ap__head">
              <span className="xn-ap__agent">
                <i aria-hidden="true" />
                {agent} asks
              </span>
              <span className="xn-ap__risk">{RISK_LABEL[risk]}</span>
            </header>
            <h2 className="xn-ap__q">{question}</h2>
            {details && <p className="xn-ap__details">{details}</p>}

            <dl className="xn-ap__preview">
              <dt className="xn-ap__preview-title">If you approve</dt>
              {preview.map((row) => (
                <div key={row.label} className="xn-ap__row">
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>

            <div className="xn-ap__actions">
              {actions.map((a) => (
                <button key={a.id} type="button" className="xn-ap__btn" data-tone={a.tone} onClick={() => onResolve(a)}>
                  {a.label}
                  {a.shortcut && <kbd aria-hidden="true">{a.shortcut.toUpperCase()}</kbd>}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="xn-ap__done" role="status" aria-live="polite">
          {resolved && (
            <>
              <span className="xn-ap__done-mark" aria-hidden="true">
                {chosen?.tone === "deny" ? "✕" : "✓"}
              </span>
              <span className="xn-ap__done-text">
                {chosen?.tone === "deny" ? "Denied" : "Approved"} · {resolved}
              </span>
              {onUndo && (
                <button type="button" className="xn-ap__undo" onClick={onUndo}>
                  Undo
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}

const css = /* css */ `
.xn-ap {
  --xn-ap-card: #1b2939;
  --xn-ap-line: #35465c;
  --xn-ap-ink: #f4f6fb;
  --xn-ap-text: #c2d3e5;
  --xn-ap-muted: #9aafc5;
  --xn-ap-code: #0f1a28;
  --xn-ap-risk: #f0c889;
  --xn-ap-ok: #8fe0b8;
  --xn-ap-bad: #ff8f86;
  --xn-ap-ease: cubic-bezier(0.22, 1, 0.36, 1);
  box-sizing: border-box;
  background: var(--xn-ap-card);
  border: 1px solid var(--xn-ap-line);
  border-radius: 16px;
  color: var(--xn-ap-ink);
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
  transition: border-color 320ms ease, background-color 320ms ease;
}
.xn-ap *, .xn-ap *::before, .xn-ap *::after { box-sizing: border-box; }
.xn-ap[data-risk="low"] { --xn-ap-risk: #8fe0b8; }
.xn-ap[data-risk="high"] { --xn-ap-risk: #ff8f86; }
.xn-ap[data-resolved="approve"] { border-color: rgba(143, 224, 184, 0.35); }
.xn-ap[data-resolved="deny"] { border-color: rgba(255, 143, 134, 0.35); }

/* The question folds away and leaves one line */
.xn-ap__fold { display: grid; grid-template-rows: 1fr; transition: grid-template-rows 480ms var(--xn-ap-ease), opacity 280ms ease; }
.xn-ap[data-resolved] .xn-ap__fold { grid-template-rows: 0fr; opacity: 0; }
.xn-ap__fold-inner { min-height: 0; overflow: hidden; padding: 22px 24px; }
.xn-ap[data-resolved] .xn-ap__fold-inner { padding-top: 0; padding-bottom: 0; }

.xn-ap__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.xn-ap__agent { display: inline-flex; align-items: center; gap: 9px; font-size: 14px; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; color: var(--xn-ap-muted); }
.xn-ap__agent i { width: 8px; height: 8px; border-radius: 50%; background: var(--xn-ap-risk); animation: xn-ap-ping 2.2s ease-out infinite; }
.xn-ap__risk { padding: 5px 10px; border-radius: 8px; font-size: 13px; font-weight: 700; color: var(--xn-ap-risk); background: color-mix(in srgb, var(--xn-ap-risk) 14%, transparent); }

.xn-ap__q { margin: 0; font-size: 28px; font-weight: 650; letter-spacing: -0.035em; line-height: 1.2; }
.xn-ap__details { margin: 10px 0 0; font-size: 18px; line-height: 1.48; color: var(--xn-ap-text); }

.xn-ap__preview { margin: 18px 0 0; padding: 14px 16px; border-radius: 12px; background: var(--xn-ap-code); border: 1px solid var(--xn-ap-line); }
.xn-ap__preview-title { margin: 0 0 6px; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--xn-ap-muted); }
.xn-ap__row { display: flex; justify-content: space-between; gap: 16px; padding: 9px 0; font-size: 16px; border-top: 1px solid rgba(255, 255, 255, 0.06); }
.xn-ap__row:first-of-type { border-top: 0; }
.xn-ap__row dt { color: var(--xn-ap-muted); }
.xn-ap__row dd { margin: 0; font-weight: 600; text-align: right; }

.xn-ap__actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
.xn-ap__btn {
  flex: 1 1 150px; display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  min-height: 56px; padding: 0 18px; border: 0; border-radius: 13px; cursor: pointer;
  font: inherit; font-size: 17px; font-weight: 650; color: var(--xn-ap-ink);
  background: #26364a; box-shadow: inset 0 0 0 1px rgba(158, 203, 255, 0.16);
  transition: background-color 160ms ease, transform 160ms ease;
}
.xn-ap__btn:hover { background: #2f4259; }
.xn-ap__btn:active { transform: scale(0.98); }
.xn-ap__btn:focus-visible { outline: 3px solid #89bdff; outline-offset: 2px; }
.xn-ap__btn[data-tone="approve"] { background: linear-gradient(#f4f4f5, #dfe3e8); color: #121c2a; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), inset 0 1px 0 #fff; }
.xn-ap__btn[data-tone="approve"]:hover { background: linear-gradient(#fff, #e9edf1); }
.xn-ap__btn[data-tone="deny"] { color: var(--xn-ap-bad); }
.xn-ap__btn kbd { font: inherit; font-size: 12px; font-weight: 700; padding: 2px 7px; border-radius: 6px; background: rgba(0, 0, 0, 0.18); color: inherit; opacity: 0.7; }
.xn-ap__btn[data-tone="approve"] kbd { background: rgba(0, 0, 0, 0.1); }

.xn-ap__done { display: none; align-items: center; gap: 12px; padding: 18px 24px; font-size: 18px; }
.xn-ap[data-resolved] .xn-ap__done { display: flex; animation: xn-ap-in 420ms var(--xn-ap-ease) 200ms both; }
.xn-ap__done-mark { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; font-size: 15px; font-weight: 800; color: #0f1a28; background: var(--xn-ap-ok); }
.xn-ap[data-resolved="deny"] .xn-ap__done-mark { background: var(--xn-ap-bad); }
.xn-ap__done-text { font-weight: 600; }
.xn-ap__undo { margin-left: auto; min-height: 44px; padding: 0 16px; border: 0; border-radius: 11px; font: inherit; font-size: 15px; font-weight: 650; color: var(--xn-ap-text); background: rgba(255, 255, 255, 0.07); cursor: pointer; }
.xn-ap__undo:hover { background: rgba(255, 255, 255, 0.12); }
.xn-ap__undo:focus-visible { outline: 3px solid #89bdff; outline-offset: 2px; }

@keyframes xn-ap-ping { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--xn-ap-risk) 55%, transparent); } 70%, 100% { box-shadow: 0 0 0 8px transparent; } }
@keyframes xn-ap-in { from { opacity: 0; transform: translateY(4px); } }

@media (prefers-reduced-motion: reduce) {
  .xn-ap__fold { transition: none; }
  .xn-ap__agent i, .xn-ap[data-resolved] .xn-ap__done { animation: none; }
}
`;
