"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useReducedMotion, useVisualActivity } from "../motion";

/** How long a folding branch takes to leave – the same as its CSS exit */
const EXIT_MS = 180;
/** Room one card takes, one first-level column with its bar, and the gap between wrapped columns */
const CARD_W = 332;
const SPREAD_W = 348;
const GAP = 16;

/*
 * Agent Tree – who delegated what to whom, as a tree of agents, in a single self-contained file.
 * Based on a component generated with DeepSeek and adapted for Xenon: navy palette, readable sizes, the hoisted
 * <style> the other components use, named tools, a selected card, and selecting and folding as two separate buttons.
 *
 * Wide: the root sits on top, the first level of agents runs side by side under it on a bar, and deeper levels
 * stack under their parent on a line with an elbow to each card (the tree scrolls sideways when it is wider than
 * its space). Narrow: every level stacks. A card shows its state, what it was asked to do, the tools it uses and
 * what it and everything below it has cost. A branch folds away; a folded branch that holds an agent needing you
 * says so. Clocks run while an agent is working or waiting and stand still once it is paused, done or failed.
 */

export type TreeStatus = "queued" | "running" | "waiting" | "paused" | "done" | "failed";

export interface TreeAgent {
  id: string;
  name: string;
  task: string;
  status: TreeStatus;
  model?: string;
  /** Names of the tools it uses */
  tools?: string[];
  /** What a waiting agent is asking for */
  ask?: string;
  /** Why a failed agent failed */
  error?: string;
  /** What this agent alone has cost – a card shows it together with everything below it */
  cost?: number;
  /** Timestamp (ms) when it started */
  started?: number;
  /** Timestamp (ms) when it finished or paused; without it the clock runs on */
  ended?: number;
  /** Set to false for a card that isn't a choice for the host */
  selectable?: boolean;
  children?: TreeAgent[];
}

export interface AgentTreeProps {
  root: TreeAgent;
  /** Ids of the folded branches (controlled) */
  collapsed?: string[];
  defaultCollapsed?: string[];
  onCollapsedChange?: (collapsed: string[]) => void;
  onSelect?: (agent: TreeAgent) => void;
  /** Id of the highlighted card */
  selected?: string;
  /** The time the clocks show, for a fixed picture. Defaults to the live clock */
  now?: number | Date;
  formatCost?: (amount: number) => string;
  title?: string;
  className?: string;
}

const STATUS_LABEL: Record<TreeStatus, string> = {
  queued: "Queued",
  running: "Running",
  waiting: "Needs a decision",
  paused: "Paused",
  done: "Complete",
  failed: "Failed",
};

const defaultFormatCost = (n: number) => `$${n.toFixed(2)}`;

const formatTime = (ms: number) => {
  const s = Math.max(Math.floor(ms / 1000), 0);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

const branchCost = (a: TreeAgent): number => (a.cost ?? 0) + (a.children ?? []).reduce((sum, c) => sum + branchCost(c), 0);

const ticking = (s: TreeStatus) => s === "running" || s === "waiting";
const anyTicking = (a: TreeAgent): boolean => (ticking(a.status) && a.ended === undefined) || (a.children ?? []).some(anyTicking);

/** Does anything below this agent need a person? */
const needsYouBelow = (a: TreeAgent): boolean => (a.children ?? []).some((c) => c.status === "waiting" || c.status === "failed" || needsYouBelow(c));

export function AgentTree({
  root,
  collapsed: controlledCollapsed,
  defaultCollapsed = [],
  onCollapsedChange,
  onSelect,
  selected,
  now,
  formatCost = defaultFormatCost,
  title = "Agents",
  className = "",
}: AgentTreeProps) {
  const [internalCollapsed, setInternalCollapsed] = useState<string[]>(defaultCollapsed);
  const collapsed = controlledCollapsed ?? internalCollapsed;

  const live = now === undefined;
  const [clock, setClock] = useState(() => Date.now());
  // Clocks, spinners and exits only run while the tree is in view, the page is in front, and motion is welcome
  const scrollRef = useRef<HTMLDivElement>(null);
  const visible = useVisualActivity(scrollRef, true);
  const reducedMotion = useReducedMotion();
  const animate = visible && !reducedMotion;
  const needsClock = live && visible && anyTicking(root);
  // How the first level fits: side by side on a bar when every agent has room, else wrapped into columns, else stacked
  const [width, setWidth] = useState(0);
  // The team arrives once, as the tab opens; the attribute goes once it has played so later changes don't replay it
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setIntro(false), 1500);
    return () => window.clearTimeout(id);
  }, []);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const first = root.children?.length ?? 0;
  const mode = first > 0 && width >= first * SPREAD_W ? "spread" : Math.floor((width + GAP) / (CARD_W + GAP)) >= 2 ? "board" : "stack";
  useEffect(() => {
    if (!needsClock) return;
    setClock(Date.now());
    const id = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [needsClock]);
  const nowMs = live ? clock : now instanceof Date ? now.getTime() : now;

  const toggle = (id: string) => {
    const next = collapsed.includes(id) ? collapsed.filter((c) => c !== id) : [...collapsed, id];
    if (controlledCollapsed === undefined) setInternalCollapsed(next);
    onCollapsedChange?.(next);
  };

  let total = 0;
  let running = 0;
  let waiting = 0;
  const count = (a: TreeAgent) => {
    total++;
    if (a.status === "running") running++;
    if (a.status === "waiting") waiting++;
    a.children?.forEach(count);
  };
  count(root);

  return (
    <>
      <style href="xn-agent-tree" precedence="default">
        {css}
      </style>
      <section className={["xn-at", className].filter(Boolean).join(" ")} aria-label={title} data-mode={mode} data-intro={intro || undefined} data-animate={animate || undefined}>
        <header className="xn-at__head">
          <h2 className="xn-at__title">{title}</h2>
          <div className="xn-at__stats">
            <span>
              {total} {total === 1 ? "agent" : "agents"}
            </span>
            <span className="xn-at__stat-run">{running} running</span>
            {waiting > 0 && (
              <span className="xn-at__stat-wait">
                {waiting} {waiting === 1 ? "needs" : "need"} a decision
              </span>
            )}
            <span className="xn-at__stat-cost">{formatCost(branchCost(root))}</span>
          </div>
        </header>

        <div ref={scrollRef} className="xn-at__scroll">
          <ul className="xn-at__tree">
            <Branch node={root} depth={0} collapsed={collapsed} onToggle={toggle} onSelect={onSelect} selected={selected} nowMs={nowMs} formatCost={formatCost} />
          </ul>
        </div>
      </section>
    </>
  );
}

type BranchProps = {
  node: TreeAgent;
  depth: number;
  collapsed: string[];
  onToggle: (id: string) => void;
  onSelect?: (agent: TreeAgent) => void;
  selected?: string;
  nowMs: number;
  formatCost: (n: number) => string;
};

function Branch({ node, depth, collapsed, onToggle, onSelect, selected, nowMs, formatCost }: BranchProps) {
  const kids = node.children ?? [];
  const hasKids = kids.length > 0;
  const folded = collapsed.includes(node.id);
  const clickable = !!onSelect && node.selectable !== false;
  const isSelected = selected === node.id;
  const alertBelow = folded && needsYouBelow(node);

  const reduced = useReducedMotion();
  // Only a branch the person just unfolded animates in; branches present from the start do not
  const [wasFolded, setWasFolded] = useState(folded);
  const [justOpened, setJustOpened] = useState(false);
  if (wasFolded !== folded) {
    setWasFolded(folded);
    setJustOpened(wasFolded && !folded);
  }
  // A folded branch stays mounted for its short exit, then goes
  const [kept, setKept] = useState(!folded);
  useEffect(() => {
    if (!folded) {
      setKept(true);
      return;
    }
    if (reduced) {
      setKept(false);
      return;
    }
    const id = window.setTimeout(() => setKept(false), EXIT_MS);
    return () => window.clearTimeout(id);
  }, [folded, reduced]);
  const showKids = hasKids && (!folded || kept);

  // A change of state settles in once; neither the first render nor the clock's ticks animate
  const seen = useRef(node.status);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (seen.current === node.status) return;
    seen.current = node.status;
    setChanged(true);
  }, [node.status]);

  const end = node.ended ?? (ticking(node.status) ? nowMs : undefined);
  const time = node.started !== undefined && end !== undefined ? formatTime(end - node.started) : "";
  const note = node.status === "waiting" ? node.ask : node.status === "failed" ? node.error : undefined;
  const foldLabel = `${folded ? "Show" : "Hide"} ${kids.length} sub-${kids.length === 1 ? "agent" : "agents"} of ${node.name}`;

  const body = (
    <>
      <span className="xn-at__top">
        <span className="xn-at__avatar" aria-hidden="true">
          {node.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="xn-at__who">
          <span className="xn-at__name">
            {clickable && <span className="xn-at__sr">Open run for </span>}
            {node.name}
          </span>
          {node.model && <span className="xn-at__model">{node.model}</span>}
        </span>
        <span key={node.status} className="xn-at__badge" data-status={node.status} data-changed={changed || undefined}>
          {node.status === "running" && <span className="xn-at__spin" aria-hidden="true" />}
          {STATUS_LABEL[node.status]}
        </span>
      </span>

      <span className="xn-at__task">{node.task}</span>
      {note && (
        <span className="xn-at__note" data-status={node.status}>
          {note}
        </span>
      )}
      {alertBelow && (
        <span className="xn-at__note" data-status="waiting">
          A sub-agent needs a decision
        </span>
      )}

      {node.tools && node.tools.length > 0 && (
        <span className="xn-at__tools">
          <span className="xn-at__sr">Tools: </span>
          {node.tools.map((t) => (
            <span key={t} className="xn-at__tool">
              {t}
            </span>
          ))}
        </span>
      )}

      <span className="xn-at__foot">
        <span className="xn-at__cost">
          <span className="xn-at__sr">Cost </span>
          {formatCost(branchCost(node))}
        </span>
        {time && (
          <>
            <span aria-hidden="true">·</span>
            <span>{time}</span>
          </>
        )}
        {isSelected && <span className="xn-at__viewing">Viewing</span>}
      </span>
    </>
  );

  return (
    <li className="xn-at__node" style={{ "--d": depth } as CSSProperties}>
      <div className="xn-at__card" data-status={node.status} data-selected={isSelected || undefined} data-folds={hasKids || undefined}>
        {clickable ? (
          <button type="button" className="xn-at__main" aria-current={isSelected || undefined} onClick={() => onSelect?.(node)}>
            {body}
          </button>
        ) : (
          <div className="xn-at__main">{body}</div>
        )}
        {hasKids && (
          <button type="button" className="xn-at__fold" aria-expanded={!folded} aria-label={foldLabel} onClick={() => onToggle(node.id)}>
            {kids.length}
            <svg className="xn-at__chev" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {showKids && <span className="xn-at__port" data-root={depth === 0 || undefined} data-leaving={folded || undefined} data-entering={justOpened || undefined} aria-hidden="true" />}
      </div>

      {showKids && (
        <ul className={depth === 0 ? "xn-at__top-level" : "xn-at__stack"} data-leaving={folded || undefined} data-entering={justOpened || undefined}>
          {kids.map((child) => (
            <Branch key={child.id} node={child} depth={depth + 1} collapsed={collapsed} onToggle={onToggle} onSelect={onSelect} selected={selected} nowMs={nowMs} formatCost={formatCost} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** A level that stacks: a line down the left with an elbow into each card */
const stacked = (list: string) => /* css */ `
${list} { display: flex; flex-direction: column; gap: 10px; margin: 10px 0 0 22px; }
${list} > .xn-at__node { position: relative; padding-left: 24px; }
${list} > .xn-at__node::before { content: ""; position: absolute; left: 0; top: -10px; width: 22px; height: 42px; border-left: 2px solid var(--xn-at-link); border-bottom: 2px solid var(--xn-at-link); border-bottom-left-radius: 12px; }
${list} > .xn-at__node:not(:last-child)::after { content: ""; position: absolute; left: 0; top: 32px; bottom: -10px; border-left: 2px solid var(--xn-at-link); }
`;

const css = /* css */ `
.xn-at {
  --xn-at-card: #131e2b;
  --xn-at-raised: #1b2939;
  --xn-at-chip: #26364a;
  --xn-at-border: #405268;
  --xn-at-link: #5f8fcf;
  --xn-at-text: #f4f6fb;
  --xn-at-muted: #b3c4d8;
  --xn-at-accent: #9ecbff;
  --xn-at-warning: #f5d39a;
  --xn-at-critical: #ffaaa3;
  --xn-at-success: #9be7c7;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  font-family: inherit;
  color: var(--xn-at-text);
}
.xn-at *, .xn-at *::before, .xn-at *::after { box-sizing: border-box; }
.xn-at :where(ul) { list-style: none; margin: 0; padding: 0; }
.xn-at__sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

.xn-at__head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 24px; margin-bottom: 16px; }
.xn-at__title { margin: 0; font-size: 26px; letter-spacing: -0.03em; }
.xn-at__stats { display: flex; flex-wrap: wrap; gap: 4px 20px; font-size: 15px; color: var(--xn-at-muted); font-variant-numeric: tabular-nums; }
.xn-at__stat-run { color: var(--xn-at-accent); }
.xn-at__stat-wait { color: var(--xn-at-warning); font-weight: 650; }
.xn-at__stat-cost { color: var(--xn-at-text); font-weight: 650; }

.xn-at__scroll { padding: 6px; margin: -6px -6px 0; }
.xn-at__node { position: relative; display: flex; flex-direction: column; align-items: stretch; }

/* Deeper levels always stack */
${stacked(".xn-at__stack")}

.xn-at__card { position: relative; border-radius: 16px; background: var(--xn-at-card); border: 1px solid var(--xn-at-border); transition: transform 160ms cubic-bezier(.22, 1, .36, 1), border-color 160ms cubic-bezier(.22, 1, .36, 1), background-color 160ms cubic-bezier(.22, 1, .36, 1); }
.xn-at__card[data-status="queued"], .xn-at__card[data-status="paused"] { background: #101925; }
.xn-at__card[data-status="waiting"] { border-color: #8a7347; }
.xn-at__card[data-status="failed"] { border-color: #8a5655; }
.xn-at__card[data-selected] { border-color: var(--xn-at-accent); background: var(--xn-at-raised); box-shadow: 0 0 0 1px var(--xn-at-accent); }

/* The select button is the whole card; the fold button sits on top of its foot */
.xn-at__main { display: flex; flex-direction: column; align-items: stretch; gap: 10px; width: 100%; padding: 14px 16px 6px; border: 0; border-radius: 16px; background: transparent; color: inherit; font: inherit; text-align: left; }
button.xn-at__main { cursor: pointer; }
button.xn-at__main:hover { background: rgba(158, 203, 255, 0.05); }
.xn-at__main:focus-visible, .xn-at__fold:focus-visible { outline: 3px solid var(--xn-at-accent); outline-offset: 2px; }

.xn-at__top { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px 10px; }
.xn-at__avatar { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: #243b55; color: #b7e0ff; font-size: 16px; font-weight: 700; }
.xn-at__who { flex: 1 1 120px; min-width: 0; display: flex; flex-direction: column; }
.xn-at__name { font-size: 18px; line-height: 1.25; font-weight: 650; overflow-wrap: break-word; }
.xn-at__model { font-size: 14px; color: var(--xn-at-muted); }

.xn-at__badge { flex: none; display: inline-flex; align-items: center; gap: 6px; margin-left: auto; padding: 5px 10px; border-radius: 8px; background: var(--xn-at-chip); color: var(--xn-at-muted); font-size: 13px; font-weight: 650; text-align: right; }
.xn-at__badge[data-status="running"] { background: #213a57; color: var(--xn-at-accent); }
.xn-at__badge[data-status="waiting"] { background: #3d3524; color: var(--xn-at-warning); }
.xn-at__badge[data-status="done"] { background: #1d3c34; color: var(--xn-at-success); }
.xn-at__badge[data-status="failed"] { background: #432a2c; color: var(--xn-at-critical); }
.xn-at__spin { flex: none; width: 12px; height: 12px; border-radius: 50%; border: 2px solid rgba(158, 203, 255, 0.3); border-top-color: var(--xn-at-accent); animation: xn-at-rot 1s linear infinite; }
@keyframes xn-at-rot { to { transform: rotate(360deg); } }

.xn-at__task { font-size: 16px; line-height: 1.4; color: #d3e0ee; }
.xn-at__note { align-self: flex-start; padding: 6px 10px; border-radius: 8px; font-size: 14px; line-height: 1.35; }
.xn-at__note[data-status="waiting"] { background: #3d3524; color: var(--xn-at-warning); }
.xn-at__note[data-status="failed"] { background: #432a2c; color: var(--xn-at-critical); }

.xn-at__tools { display: flex; flex-wrap: wrap; gap: 6px; }
.xn-at__tool { padding: 2px 8px; border-radius: 6px; background: var(--xn-at-chip); color: var(--xn-at-muted); font-size: 13px; }

/* The foot keeps clear of the fold button */
.xn-at__foot { display: flex; align-items: center; flex-wrap: wrap; gap: 2px 8px; min-height: 44px; padding-right: 76px; font-size: 15px; color: var(--xn-at-muted); font-variant-numeric: tabular-nums; }
.xn-at__card:not([data-folds]) .xn-at__foot { padding-right: 0; }
.xn-at__cost { color: var(--xn-at-text); font-weight: 600; }
.xn-at__viewing { font-size: 13px; font-weight: 650; color: var(--xn-at-accent); }

.xn-at__fold { position: absolute; right: 10px; bottom: 6px; min-width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 0 10px; border-radius: 12px; background: transparent; color: var(--xn-at-muted); font: inherit; font-size: 15px; font-variant-numeric: tabular-nums; cursor: pointer; }
.xn-at__fold:hover { background: var(--xn-at-chip); color: var(--xn-at-text); }
.xn-at__chev { transition: transform 160ms cubic-bezier(.22, 1, .36, 1); }
.xn-at__fold[aria-expanded="false"] .xn-at__chev { transform: rotate(-90deg); }

/* The dot where a card hands work to the level below */
.xn-at__port { position: absolute; bottom: -7px; left: 17px; z-index: 1; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--xn-at-link); background: var(--xn-at-card); pointer-events: none; }

/* Stack: one column, every level hung on its parent's line */
.xn-at__tree { display: block; }
${stacked('.xn-at[data-mode="stack"] .xn-at__top-level')}
/* On a phone the hanging indent is tight so cards keep their width */
.xn-at[data-mode="stack"] :is(.xn-at__stack, .xn-at__top-level) { gap: 8px; margin: 8px 0 0 10px; }
.xn-at[data-mode="stack"] :is(.xn-at__stack, .xn-at__top-level) > .xn-at__node { padding-left: 12px; }
.xn-at[data-mode="stack"] :is(.xn-at__stack, .xn-at__top-level) > .xn-at__node::before { top: -8px; width: 10px; height: 40px; border-bottom-left-radius: 8px; }
.xn-at[data-mode="stack"] :is(.xn-at__stack, .xn-at__top-level) > .xn-at__node:not(:last-child)::after { top: 32px; bottom: -8px; }
.xn-at[data-mode="stack"] .xn-at__port { left: 5px; }

/* Board: more agents than fit side by side, so the first level wraps into columns under the root */
.xn-at[data-mode="board"] .xn-at__tree > .xn-at__node > .xn-at__card { width: 332px; align-self: center; }
.xn-at[data-mode="board"] .xn-at__port[data-root] { display: none; }
.xn-at[data-mode="board"] .xn-at__top-level { display: grid; grid-template-columns: repeat(auto-fill, minmax(332px, 1fr)); gap: 16px; align-items: start; margin-top: 20px; }

/* Spread: the first level runs side by side under the root, hung on a bar */
.xn-at[data-mode="spread"] .xn-at__tree { display: flex; justify-content: center; }
.xn-at[data-mode="spread"] .xn-at__tree > .xn-at__node { align-items: center; }
.xn-at[data-mode="spread"] .xn-at__tree > .xn-at__node > .xn-at__card { width: 332px; }
.xn-at[data-mode="spread"] .xn-at__port[data-root] { left: calc(50% - 6px); }
.xn-at[data-mode="spread"] .xn-at__top-level { display: flex; justify-content: center; position: relative; }
.xn-at[data-mode="spread"] .xn-at__top-level::before { content: ""; position: absolute; top: 0; left: 50%; width: 2px; height: 14px; margin-left: -1px; background: var(--xn-at-link); }
.xn-at[data-mode="spread"] .xn-at__top-level > .xn-at__node { flex: none; width: 348px; padding: 28px 8px 0; }
.xn-at[data-mode="spread"] .xn-at__top-level > .xn-at__node::before { content: ""; position: absolute; top: 13px; left: 0; right: 0; height: 2px; background: var(--xn-at-link); }
.xn-at[data-mode="spread"] .xn-at__top-level > .xn-at__node:first-child::before { left: 50%; height: 15px; margin-left: -1px; background: none; border-top: 2px solid var(--xn-at-link); border-left: 2px solid var(--xn-at-link); border-top-left-radius: 12px; }
.xn-at[data-mode="spread"] .xn-at__top-level > .xn-at__node:last-child::before { right: 50%; height: 15px; margin-right: -1px; background: none; border-top: 2px solid var(--xn-at-link); border-right: 2px solid var(--xn-at-link); border-top-right-radius: 12px; }
.xn-at[data-mode="spread"] .xn-at__top-level > .xn-at__node:only-child::before { display: none; }
.xn-at[data-mode="spread"] .xn-at__top-level > .xn-at__node:not(:first-child):not(:last-child)::after { content: ""; position: absolute; top: 13px; left: 50%; width: 2px; height: 15px; margin-left: -1px; background: var(--xn-at-link); }
.xn-at[data-mode="spread"] .xn-at__top-level > .xn-at__node:only-child::after { content: ""; position: absolute; top: 0; left: 50%; width: 2px; height: 28px; margin-left: -1px; background: var(--xn-at-link); }

/* Motion: opacity and transform only. A branch settles in when unfolded and lifts away when folded; a card that
   changes state settles once; buttons press in. Nothing animates the card's size. */
@keyframes xn-at-in { from { opacity: 0; transform: translateY(-14px); } }
@keyframes xn-at-out { to { opacity: 0; transform: translateY(-10px); } }
@keyframes xn-at-settle { from { opacity: 0.4; transform: translateY(3px) scale(0.94); } }
@keyframes xn-at-rise { from { opacity: 0; transform: translateY(16px); } }
@keyframes xn-at-fade { from { opacity: 0; } }
@keyframes xn-at-ring { from { opacity: 0.8; transform: scale(1); } to { opacity: 0; transform: scale(1.07, 1.12); } }
.xn-at [data-entering] { animation: xn-at-in 280ms cubic-bezier(.22, 1, .36, 1) both; }
.xn-at [data-leaving] { animation: xn-at-out 180ms cubic-bezier(.22, 1, .36, 1) forwards; }
.xn-at__badge[data-changed] { animation: xn-at-settle 240ms cubic-bezier(.22, 1, .36, 1) both; }
/* Opening the tab: the team arrives down its hierarchy – Jarvis, then its agents, then their sub-agents */
.xn-at[data-intro] .xn-at__card { animation: xn-at-rise 420ms cubic-bezier(.22, 1, .36, 1) both; animation-delay: calc(var(--d, 0) * 140ms); }
.xn-at[data-intro] .xn-at__node > ul { animation: xn-at-fade 420ms ease-out both; animation-delay: calc(var(--d, 0) * 140ms + 160ms); }
/* The card you chose sends out a ring once */
.xn-at__card[data-selected]::after { content: ""; position: absolute; inset: -2px; border-radius: inherit; border: 2px solid var(--xn-at-accent); pointer-events: none; animation: xn-at-ring 560ms cubic-bezier(.22, 1, .36, 1) both; }
@media (hover: hover) { .xn-at__card:has(button.xn-at__main:hover) { transform: translateY(-2px); } }
.xn-at__main, .xn-at__fold { transition: transform 100ms cubic-bezier(.22, 1, .36, 1), background-color 160ms cubic-bezier(.22, 1, .36, 1); }
.xn-at__main:active, .xn-at__fold:active { transform: scale(0.98); }
/* The spinner only turns while the tree is in view and the page is in front */
.xn-at:not([data-animate]) .xn-at__spin { animation-play-state: paused; }

@media (prefers-reduced-motion: reduce) {
  .xn-at__card, .xn-at__chev, .xn-at__main, .xn-at__fold { transition: none; }
  .xn-at__main:active, .xn-at__fold:active, .xn-at__card:has(button.xn-at__main:hover) { transform: none; }
  .xn-at__spin, .xn-at [data-entering], .xn-at [data-leaving], .xn-at__badge[data-changed], .xn-at[data-intro] .xn-at__card, .xn-at[data-intro] .xn-at__node > ul, .xn-at__card[data-selected]::after { animation: none; }
  .xn-at__card[data-selected]::after { display: none; }
}
`;
