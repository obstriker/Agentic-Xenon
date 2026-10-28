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
  waiting: "Needs you",
  paused: "Paused",
  done: "Done",
  failed: "Failed",
};

const defaultFormatCost = (n: number) => `$${n.toFixed(2)}`;

/* Small glyphs: the model's mark on a card, and a tile for each tool. Stand-ins drawn here, not the vendors' logos. */
const svg = { viewBox: "0 0 24 24", "aria-hidden": true, focusable: false } as const;

/** The mark of the model behind an agent, or its first letter */
function ModelMark({ model, name }: { model?: string; name: string }) {
  const m = (model ?? "").toLowerCase();
  if (/opus|sonnet|haiku|claude/.test(m))
    return (
      <svg {...svg} width="22" height="22" stroke="#e58f78" strokeWidth="1.7" strokeLinecap="round" fill="none">
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d="M12 3.5v5" transform={`rotate(${i * 30} 12 12)`} />
        ))}
      </svg>
    );
  if (/gpt|openai|codex/.test(m))
    return (
      <svg {...svg} width="22" height="22" stroke="#f0f0f2" strokeWidth="1.5" strokeLinejoin="round" fill="none">
        {[0, 60, 120].map((r) => (
          <rect key={r} x="6.5" y="3.2" width="11" height="17.6" rx="5.5" transform={`rotate(${r} 12 12)`} />
        ))}
      </svg>
    );
  if (/gemini/.test(m))
    return (
      <svg {...svg} width="22" height="22" fill="#5d7cf5">
        <path d="M12 2c.7 5.4 4.600 9.300 10 10-5.400.7-9.300 4.600-10 10-.7-5.400-4.600-9.300-10-10 5.400-.7 9.300-4.600 10-10z" />
      </svg>
    );
  return <span className="xn-at__letter">{name.slice(0, 1).toUpperCase()}</span>;
}

/** A tile for a tool, chosen by what its name says it is */
function ToolGlyph({ name }: { name: string }) {
  const n = name.toLowerCase();
  const line = { ...svg, width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  let icon;
  if (/github|git\b|repo/.test(n))
    icon = (
      <svg {...svg} width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
      </svg>
    );
  else if (/slack/.test(n))
    icon = (
      <svg {...svg} width="15" height="15">
        <rect x="10" y="2" width="4" height="9" rx="2" fill="#36c5f0" />
        <rect x="13" y="10" width="9" height="4" rx="2" fill="#2eb67d" />
        <rect x="10" y="13" width="4" height="9" rx="2" fill="#ecb22e" />
        <rect x="2" y="10" width="9" height="4" rx="2" fill="#e01e5a" />
      </svg>
    );
  else if (/notion/.test(n))
    icon = (
      <svg {...svg} width="15" height="15" fill="none" stroke="#f0f0f2" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
        <rect x="4" y="3.500" width="16" height="17" rx="2.500" />
        <path d="M9 16.500v-9l6 9v-9" />
      </svg>
    )
  else if (/figma/.test(n))
    icon = (
      <svg {...svg} width="15" height="15">
        <rect x="7" y="2.500" width="5" height="5" rx="2.500" fill="#f24e1e" />
        <rect x="12" y="2.500" width="5" height="5" rx="2.500" fill="#ff7262" />
        <rect x="7" y="7.500" width="5" height="5" rx="2.500" fill="#a259ff" />
        <circle cx="14.500" cy="10" r="2.500" fill="#1abcfe" />
        <rect x="7" y="12.500" width="5" height="5" rx="2.500" fill="#0acf83" />
      </svg>
    )
  else if (/stripe|billing|payment/.test(n))
    icon = (
      <svg {...svg} width="16" height="16">
        <rect x="3" y="3" width="18" height="18" rx="5" fill="#635bff" />
        <path d="M14.500 9.500c-1.300-.6-3.300-.5-3.300.8 0 1.900 3.700 1.100 3.700 3.200 0 1.400-1.900 1.900-3.600 1" stroke="#fff" strokeWidth="1.700" fill="none" strokeLinecap="round" />
      </svg>
    )
  else if (/hubspot|crm/.test(n))
    icon = (
      <svg {...svg} width="15" height="15" fill="none" stroke="#ff7a59" strokeWidth="2" strokeLinecap="round">
        <circle cx="14" cy="14" r="3.500" />
        <path d="M14 10.500V5M10.700 12.500L6 9.500M10.700 15.500L7 19" />
        <circle cx="14" cy="4" r="1.300" fill="#ff7a59" />
        <circle cx="5.500" cy="9" r="1.300" fill="#ff7a59" />
      </svg>
    )
  else if (/search|web|browse/.test(n))
    icon = (
      <svg {...line}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.500 4.500" />
      </svg>
    );
  else if (/dataset|database|sql|table|sheet/.test(n))
    icon = (
      <svg {...line}>
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v6c0 1.700 3.100 3 7 3s7-1.300 7-3V6M5 12v6c0 1.700 3.100 3 7 3s7-1.300 7-3v-6" />
      </svg>
    );
  else if (/citation|quote|source|reference/.test(n))
    icon = (
      <svg {...line}>
        <path d="M9 7H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v1.500A2.500 2.500 0 0 1 5.500 18M20 7h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v1.500a2.500 2.500 0 0 1-2.500 2.500" />
      </svg>
    );
  else if (/code|sandbox|terminal|shell/.test(n))
    icon = (
      <svg {...line}>
        <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.500 5l-3 14" />
      </svg>
    );
  else if (/doc|note|page|write/.test(n))
    icon = (
      <svg {...line}>
        <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" />
      </svg>
    );
  else icon = <span className="xn-at__letter">{name.slice(0, 1).toUpperCase()}</span>;
  return (
    <span className="xn-at__tool" title={name}>
      <span className="xn-at__sr">{name}</span>
      {icon}
    </span>
  );
}

/** A number that glides to its new value instead of jumping – costs tick up rather than flicker */
function useTween(target: number, ms: number) {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    if (ms <= 0 || current.current === target) {
      current.current = target;
      setValue(target);
      return;
    }
    const from = current.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min((t - t0) / ms, 1);
      current.current = from + (target - from) * (1 - Math.pow(1 - k, 3));
      setValue(current.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

function Money({ value, format }: { value: number; format: (n: number) => string }) {
  const reduced = useReducedMotion();
  return <>{format(useTween(value, reduced ? 0 : 700))}</>;
}

/** Ids of the agents above `id`, outermost first */
const ancestorsOf = (a: TreeAgent, id: string, path: string[] = []): string[] | null => {
  if (a.id === id) return path;
  for (const c of a.children ?? []) {
    const hit = ancestorsOf(c, id, [...path, a.id]);
    if (hit) return hit;
  }
  return null;
};

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

/** What below this agent needs a person: a failure first, then a question */
const needsYouBelow = (a: TreeAgent): "failed" | "waiting" | null => {
  const kids = a.children ?? [];
  const found = [...kids.map((c) => c.status), ...kids.map((c) => needsYouBelow(c))];
  return found.includes("failed") ? "failed" : found.includes("waiting") ? "waiting" : null;
};

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
  const byStatus: Record<"waiting" | "failed", TreeAgent[]> = { waiting: [], failed: [] };
  const count = (a: TreeAgent) => {
    total++;
    if (a.status === "running") running++;
    if (a.status === "waiting" || a.status === "failed") byStatus[a.status].push(a);
    a.children?.forEach(count);
  };
  count(root);

  // The "needs you" and "failed" counts open a list; choosing an agent opens its branch, scrolls to it and flashes it
  const [menu, setMenu] = useState<"waiting" | "failed" | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const head = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => {
      if (!head.current?.contains(e.target as Node)) setMenu(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);
  const jump = (id: string) => {
    setMenu(null);
    const above = ancestorsOf(root, id) ?? [];
    const next = collapsed.filter((c) => !above.includes(c));
    if (next.length !== collapsed.length) {
      if (controlledCollapsed === undefined) setInternalCollapsed(next);
      onCollapsedChange?.(next);
    }
    window.setTimeout(() => {
      const el = scrollRef.current?.querySelector(`[data-agent="${CSS.escape(id)}"]`);
      el?.scrollIntoView({ block: "center", inline: "center", behavior: reducedMotion ? "auto" : "smooth" });
      setFlash(id);
      window.setTimeout(() => setFlash(null), 1500);
    }, 80);
  };

  return (
    <>
      <style href="xn-agent-tree" precedence="default">
        {css}
      </style>
      <section className={["xn-at", className].filter(Boolean).join(" ")} aria-label={title} data-mode={mode} data-intro={intro || undefined} data-animate={animate || undefined}>
        <header className="xn-at__head" ref={head}>
          <h2 className="xn-at__title">
            <svg {...svg} width="18" height="18" fill="currentColor">
              <path d="M10.500 3.500c.6 3.600 2.400 5.400 6 6-3.600.6-5.400 2.400-6 6-.6-3.600-2.400-5.400-6-6 3.600-.6 5.400-2.400 6-6z" />
              <circle cx="18.500" cy="17.500" r="1.700" />
            </svg>
            {title}
          </h2>
          <div className="xn-at__stats">
            <span key={`agents-${total}`} data-bump={!intro || undefined}>
              {total} {total === 1 ? "agent" : "agents"}
            </span>
            {running > 0 && (
              <span key={`running-${running}`} className="xn-at__stat-run" data-bump={!intro || undefined}>
                {running} running
              </span>
            )}
            {(["waiting", "failed"] as const).map(
              (kind) =>
                byStatus[kind].length > 0 && (
                  <span key={kind} className="xn-at__menuwrap">
                    <button type="button" className="xn-at__chip" data-kind={kind} aria-haspopup="menu" aria-expanded={menu === kind} onClick={() => setMenu(menu === kind ? null : kind)}>
                      {byStatus[kind].length} {kind === "failed" ? "failed" : byStatus[kind].length === 1 ? "needs you" : "need you"}
                      <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">
                        <path d="M5 7.500 10 12.500 15 7.500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {menu === kind && (
                      <ul className="xn-at__menu" role="menu">
                        {byStatus[kind].map((a) => (
                          <li key={a.id} role="none">
                            <button type="button" role="menuitem" onClick={() => jump(a.id)}>
                              <b>{a.name}</b>
                              <span>{kind === "failed" ? a.error ?? a.task : a.ask ?? a.task}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </span>
                ),
            )}
            <span className="xn-at__stat-cost">
              <Money value={branchCost(root)} format={formatCost} />
            </span>
          </div>
        </header>

        <div ref={scrollRef} className="xn-at__scroll">
          <ul className="xn-at__tree">
            <Branch node={root} depth={0} collapsed={collapsed} onToggle={toggle} onSelect={onSelect} selected={selected} nowMs={nowMs} formatCost={formatCost} flash={flash} settled={!intro} />
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
  flash?: string | null;
  /** The intro has played, so an agent that arrives now is new */
  settled?: boolean;
};

function Branch({ node, depth, collapsed, onToggle, onSelect, selected, nowMs, formatCost, flash, settled }: BranchProps) {
  const kids = node.children ?? [];
  const hasKids = kids.length > 0;
  const folded = collapsed.includes(node.id);
  const clickable = !!onSelect && node.selectable !== false;
  const isSelected = selected === node.id;
  const alertBelow = folded ? needsYouBelow(node) : null;

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
  // An agent that turns up after the tree has settled arrives with a motion of its own
  const [born] = useState(!!settled);
  const seen = useRef(node.status);
  const [changed, setChanged] = useState(false);
  // Counts the changes so every one flares the card, not only the first
  const [flares, setFlares] = useState(0);
  useEffect(() => {
    if (seen.current === node.status) return;
    seen.current = node.status;
    setChanged(true);
    setFlares((f) => f + 1);
  }, [node.status]);

  const end = node.ended ?? (ticking(node.status) ? nowMs : undefined);
  const time = node.started !== undefined && end !== undefined ? formatTime(end - node.started) : "";
  const note = node.status === "waiting" ? node.ask : node.status === "failed" ? node.error : undefined;
  const foldLabel = `${folded ? "Show" : "Hide"} ${kids.length} sub-${kids.length === 1 ? "agent" : "agents"} of ${node.name}`;

  const body = (
    <>
      <span className="xn-at__top">
        <span className="xn-at__avatar" aria-hidden="true">
          <ModelMark model={node.model} name={node.name} />
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
          {node.status === "done" && (
            <svg {...svg} width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.500l4.500 4.500L19 7.500" />
            </svg>
          )}
          {node.status === "failed" && (
            <svg {...svg} width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3.500L2.500 20h19zM12 10v4.500M12 17.500v.01" />
            </svg>
          )}
          {node.status === "waiting" && (
            <svg {...svg} width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="8.500" />
              <path d="M12 7.500V12l3 2" />
            </svg>
          )}
          {STATUS_LABEL[node.status]}
        </span>
      </span>

      <span className="xn-at__task">
        {node.tools && node.tools.length > 0 && (
          <span className="xn-at__tools">
            <span className="xn-at__sr">Tools: </span>
            {node.tools.map((t) => (
              <ToolGlyph key={t} name={t} />
            ))}
          </span>
        )}
        {node.task}
      </span>
      {note && (
        <span className="xn-at__note" data-status={node.status}>
          {note}
        </span>
      )}
      {alertBelow && (
        <span className="xn-at__note" data-status={alertBelow}>
          {alertBelow === "failed" ? "A sub-agent failed" : "A sub-agent needs you"}
        </span>
      )}

      <span className="xn-at__foot">
        <span className="xn-at__cost">
          <span className="xn-at__sr">Cost </span>
          <Money value={branchCost(node)} format={formatCost} />
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
    <li className="xn-at__node" data-born={born || undefined} style={{ "--d": depth } as CSSProperties}>
      <div className="xn-at__card" data-agent={node.id} data-status={node.status} data-selected={isSelected || undefined} data-flash={flash === node.id || undefined} data-flare={flares > 0 ? flares % 2 : undefined} data-folds={hasKids || undefined}>
        {clickable ? (
          <button type="button" className="xn-at__main" aria-current={isSelected || undefined} onClick={() => onSelect?.(node)}>
            {body}
          </button>
        ) : (
          <div className="xn-at__main">{body}</div>
        )}
        {hasKids && (
          <button type="button" className="xn-at__fold" aria-expanded={!folded} aria-label={foldLabel} onClick={() => onToggle(node.id)}>
            {folded ? "+" : ""}
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
            <Branch key={child.id} node={child} depth={depth + 1} collapsed={collapsed} onToggle={onToggle} onSelect={onSelect} selected={selected} nowMs={nowMs} formatCost={formatCost} flash={flash} settled={settled && !justOpened} />
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

/* The look of the reference recording: neutral dark cards, a periwinkle accent, brand marks and tool tiles */
.xn-at {
  --xn-at-card: #1d1d20;
  --xn-at-raised: #232326;
  --xn-at-chip: #2d2d31;
  --xn-at-border: #2a2a2e;
  --xn-at-link: #5a82d6;
  --xn-at-text: #f4f4f6;
  --xn-at-muted: #8f8f98;
  --xn-at-accent: #8fa3ff;
  --xn-at-warning: #e9a574;
  --xn-at-critical: #f2917e;
  --xn-at-success: #7fd9a6;
}
.xn-at__title { display: inline-flex; align-items: center; gap: 12px; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
.xn-at__title svg { color: var(--xn-at-accent); }
.xn-at__head { align-items: center; }
.xn-at__stats { align-items: center; gap: 6px 18px; font-size: 16px; }
.xn-at__stat-cost { font-weight: 600; }
.xn-at__menuwrap { position: relative; display: inline-flex; }
.xn-at__chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px 5px 12px; border: 0; border-radius: 9px; font: inherit; font-size: 16px; cursor: pointer; transition: filter 0.15s; }
.xn-at__chip:hover { filter: brightness(1.2); }
.xn-at__chip[data-kind="failed"] { background: #4a2626; color: var(--xn-at-critical); }
.xn-at__chip[data-kind="waiting"] { background: #4a3321; color: var(--xn-at-warning); }
.xn-at__chip[aria-expanded="true"] svg { transform: rotate(180deg); }
.xn-at__chip svg { transition: transform 0.15s; }
.xn-at__chip:focus-visible { outline: 2px solid var(--xn-at-accent); outline-offset: 2px; }
.xn-at__menu { position: absolute; z-index: 20; top: calc(100% + 8px); right: 0; width: max-content; min-width: 260px; max-width: 340px; padding: 6px; border-radius: 14px; background: #232326; border: 1px solid #34343a; box-shadow: 0 18px 50px #000a; animation: xn-at-fade 0.15s ease-out; }
.xn-at__menu button { display: flex; flex-direction: column; gap: 2px; width: 100%; padding: 9px 12px; border: 0; border-radius: 9px; background: transparent; color: var(--xn-at-text); font: inherit; text-align: left; cursor: pointer; }
.xn-at__menu button:hover, .xn-at__menu button:focus-visible { background: #2d2d33; outline: none; }
.xn-at__menu b { font-size: 15px; font-weight: 600; }
.xn-at__menu span { font-size: 13px; color: var(--xn-at-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.xn-at__card[data-status="queued"], .xn-at__card[data-status="paused"] { background: #19191c; }
.xn-at__card[data-status="waiting"] { border-color: #6e5636; }
.xn-at__card[data-status="failed"] { border-color: #6e3f3d; }
.xn-at__card[data-selected] { background: var(--xn-at-raised); box-shadow: 0 0 0 1px var(--xn-at-accent); }
.xn-at__card[data-flash]::before { content: ""; position: absolute; inset: -3px; border-radius: 19px; border: 2px solid var(--xn-at-accent); pointer-events: none; animation: xn-at-flash 0.5s ease-in-out 3 both; }
@keyframes xn-at-flash { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }
button.xn-at__main:hover { background: rgba(255, 255, 255, 0.03); }
.xn-at__avatar { width: 40px; height: 40px; border-radius: 12px; background: #19191c; border: 1px solid #2a2a2e; color: #d8d8de; }
.xn-at__letter { font-size: 13px; font-weight: 700; }
.xn-at__name { font-size: 19px; font-weight: 600; }
.xn-at__model { font-size: 15px; }
.xn-at__badge { padding: 5px 11px; font-size: 14px; font-weight: 600; background: var(--xn-at-chip); }
.xn-at__badge[data-status="running"] { background: #2a3156; color: #8fa3ff; }
.xn-at__badge[data-status="waiting"] { background: #4a3321; color: var(--xn-at-warning); }
.xn-at__badge[data-status="done"] { background: #1f3a2c; color: var(--xn-at-success); }
.xn-at__badge[data-status="failed"] { background: #4a2626; color: var(--xn-at-critical); }
.xn-at__spin { border-color: rgba(143, 163, 255, 0.28); border-top-color: #8fa3ff; }
.xn-at__task { color: #e6e6ea; font-size: 17px; line-height: 1.5; }
.xn-at__note[data-status="waiting"] { background: #3f2f20; color: var(--xn-at-warning); }
.xn-at__note[data-status="failed"] { background: #432424; color: var(--xn-at-critical); }
.xn-at__tools { display: inline-flex; align-items: center; gap: 1px; padding: 2px; margin-right: 8px; vertical-align: -5px; border-radius: 10px; background: #161619; border: 1px solid #2a2a2e; }
.xn-at__tool { display: inline-grid; place-items: center; width: 24px; height: 24px; padding: 0; border-radius: 7px; background: transparent; color: #d8d8de; font-size: 0; }
.xn-at__tool .xn-at__letter { font-size: 11px; }
.xn-at__cost { font-weight: 650; }
.xn-at__fold { color: var(--xn-at-muted); }
.xn-at__port { background: var(--xn-at-card); }

.xn-at__top { gap: 6px 8px; }
.xn-at__who { flex: 1 1 90px; }
.xn-at__avatar { flex: none; width: 38px; height: 38px; }
.xn-at__badge { padding: 4px 9px; font-size: 13px; }
.xn-at__fold { border: 0; background: transparent; font-size: 16px; }
.xn-at__fold:hover { background: rgba(255, 255, 255, 0.06); }


/* Motion: an agent that arrives later rises into place and its link draws in; a card whose state changes flares once;
   the header counts bump when they change; chips pop in */
@keyframes xn-at-draw { from { clip-path: inset(0 0 100% 0); } }
@keyframes xn-at-drawx { from { clip-path: inset(0 100% 0 0); } }
@keyframes xn-at-flare { 0% { box-shadow: 0 0 0 0 rgba(143, 163, 255, 0.55); } 100% { box-shadow: 0 0 0 14px rgba(143, 163, 255, 0); } }
@keyframes xn-at-bump { 0% { transform: translateY(5px) scale(0.92); opacity: 0.4; } 100% { transform: none; opacity: 1; } }
@keyframes xn-at-pop { from { transform: scale(0.8); opacity: 0; } }
.xn-at__node[data-born] > .xn-at__card { animation: xn-at-rise 480ms cubic-bezier(.22, 1, .36, 1) both; }
.xn-at__node[data-born]::before { animation: xn-at-draw 520ms cubic-bezier(.22, 1, .36, 1) both; }
.xn-at[data-mode="spread"] .xn-at__top-level > .xn-at__node[data-born]::before { animation: xn-at-drawx 520ms cubic-bezier(.22, 1, .36, 1) both; }
.xn-at__node[data-born] .xn-at__port { animation: xn-at-pop 360ms 200ms cubic-bezier(.22, 1, .36, 1) both; }
.xn-at__card[data-flare="1"] { animation: xn-at-flare 800ms ease-out; }
.xn-at__card[data-flare="0"] { animation: xn-at-flare-b 800ms ease-out; }
@keyframes xn-at-flare-b { 0% { box-shadow: 0 0 0 0 rgba(143, 163, 255, 0.55); } 100% { box-shadow: 0 0 0 14px rgba(143, 163, 255, 0); } }
.xn-at__card { transition: border-color 0.4s, background-color 0.4s, box-shadow 0.4s, transform 160ms cubic-bezier(.22, 1, .36, 1); }
.xn-at__stats [data-bump] { animation: xn-at-bump 320ms cubic-bezier(.22, 1, .36, 1) both; }
.xn-at__chip { animation: xn-at-pop 280ms cubic-bezier(.22, 1, .36, 1) both; }
.xn-at__badge { transition: background-color 0.3s, color 0.3s; }

@media (prefers-reduced-motion: reduce) {
  .xn-at__node[data-born] > .xn-at__card, .xn-at__node[data-born]::before, .xn-at__node[data-born] .xn-at__port, .xn-at__card[data-flare], .xn-at__stats [data-bump], .xn-at__chip, .xn-at__card[data-flash]::before { animation: none; }
  .xn-at__card, .xn-at__chev, .xn-at__main, .xn-at__fold { transition: none; }
  .xn-at__main:active, .xn-at__fold:active, .xn-at__card:has(button.xn-at__main:hover) { transform: none; }
  .xn-at__spin, .xn-at [data-entering], .xn-at [data-leaving], .xn-at__badge[data-changed], .xn-at[data-intro] .xn-at__card, .xn-at[data-intro] .xn-at__node > ul, .xn-at__card[data-selected]::after { animation: none; }
  .xn-at__card[data-selected]::after { display: none; }
}
`;
