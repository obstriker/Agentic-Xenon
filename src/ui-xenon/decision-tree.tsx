"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

/*
 * Decision Tree – an agent lays out its options as branches and you pick one by click or key, in a single self-contained file.
 * Original Xenon component, rebuilt from a screen recording of the design. The styles are injected below.
 *
 * Configure it with props: `labels` replaces every word it shows, `icon` the mark before the title, `index` /
 * `onIndexChange` page through the decisions yourself, `advanceMs`, `keyboard`, `agentPath` and `showPager` switch
 * behaviour, `compact` fits a narrow panel. Restyle it with CSS variables set through `style` or `className`, or in a rule such as
 * `.my-theme .xdt` (a variable set on a parent does not reach it), for example `style={{ "--xdt-accent": "#e0a040" }}` – every colour below is one: --xdt-bg, -panel, -surface, -line, -text,
 * -muted, -accent, -select (chosen outline), -glow, -risk-high-bg and so on (see the defaults in the stylesheet).
 */

export type DecisionRisk = "low" | "medium" | "high";

export type DecisionChoice = {
  id: string;
  title: string;
  detail?: string;
  /** A warning fact shown highlighted, e.g. "Skips 1,284 tests" */
  flag?: string;
  icons?: ReactNode[];
  agentPick?: boolean;
};

export type DecisionOption = {
  id: string;
  label: string;
  icon?: ReactNode;
  agentPick?: boolean;
  /** A free-text escape hatch, shown dimmed with no follow-up */
  other?: boolean;
  /** The follow-up question and its answers. A single answer with no question is a plain outcome */
  followUp?: { question?: string; choices: DecisionChoice[] };
};

export type Decision = {
  id: string;
  agent: { name: string; model: string; icon?: ReactNode };
  risk: DecisionRisk;
  question: string;
  details?: string;
  options: DecisionOption[];
};

export type DecisionAnswer = { decision: Decision; option: DecisionOption; choice?: DecisionChoice };

export type DecisionTreeProps = {
  decisions: Decision[];
  title?: string;
  /** Called once an option (and its follow-up answer, if it has one) is picked */
  onResolve?: (answer: DecisionAnswer) => void;
  /** Smaller type and columns for a narrow panel */
  compact?: boolean;
  /** Replace any of the words the component shows */
  labels?: Partial<DecisionLabels>;
  /** The mark before the title; defaults to a branching glyph. Pass `null` for none */
  icon?: ReactNode;
  /** Show the dots and "1 of 3" (default: only when there is more than one decision) */
  showPager?: boolean;
  /** Which decision is showing, if you page through them yourself – use with `onIndexChange` */
  index?: number;
  onIndexChange?: (index: number) => void;
  /** Milliseconds before moving to the next undecided one after an answer. 0 stays put. Default 1100 */
  advanceMs?: number;
  /** Listen for 1-9, ←, →, Enter and Esc (default true). Switch off when several of these share a page */
  keyboard?: boolean;
  /** Let the root card light the agent's own path, and Enter accept it (default true) */
  agentPath?: boolean;
  className?: string;
  style?: CSSProperties;
};

/** Every word the component shows – pass any of them in `labels` */
export type DecisionLabels = {
  waiting: (count: number) => string;
  allDecided: string;
  pager: (position: number, total: number) => string;
  agentPick: string;
  risk: Record<DecisionRisk, string>;
  pickBranch: string;
  next: string;
  then: string;
  decided: string;
  agentPath: string;
  accept: string;
  clickAway: string;
  approved: string;
  running: string;
  showPath: string;
};

export const defaultDecisionLabels: DecisionLabels = {
  waiting: (n) => `${n} waiting for you`,
  allDecided: "All decided",
  pager: (i, n) => `${i} of ${n}`,
  agentPick: "Agent's pick",
  risk: { low: "Low risk", medium: "Medium risk", high: "High risk" },
  pickBranch: "Pick a branch",
  next: "next",
  then: "Then",
  decided: "Decided",
  agentPath: "Agent's path",
  accept: "accept",
  clickAway: "click away to reset",
  approved: "Approved",
  running: "running",
  showPath: "Show the agent's path",
};

type Path = { d: string; on: boolean };

const rounded = (x1: number, y1: number, x2: number, y2: number) => {
  const dy = y2 - y1;
  if (Math.abs(dy) < 2) return `M${x1} ${y1}H${x2}`;
  const mid = x1 + (x2 - x1) / 2;
  const r = Math.min(14, Math.abs(dy) / 2, Math.abs(x2 - x1) / 2);
  const s = dy > 0 ? 1 : -1;
  return `M${x1} ${y1}H${mid - r}Q${mid} ${y1} ${mid} ${y1 + s * r}V${y2 - s * r}Q${mid} ${y2} ${mid + r} ${y2}H${x2}`;
};

export function DecisionTree({ decisions, title = "Decisions", onResolve, compact, labels, icon, showPager, index: controlledIndex, onIndexChange, advanceMs = 1100, keyboard = true, agentPath = true, className, style }: DecisionTreeProps) {
  const L = useMemo(() => ({ ...defaultDecisionLabels, ...labels, risk: { ...defaultDecisionLabels.risk, ...labels?.risk } }), [labels]);
  const [innerIndex, setInnerIndex] = useState(0);
  const index = controlledIndex ?? innerIndex;
  const [picked, setPicked] = useState<Record<string, { option: string; choice?: string }>>({});
  const [option, setOption] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  // The agent's own path through the tree, lit end to end when its root card is clicked
  const [trail, setTrail] = useState(false);
  const [paths, setPaths] = useState<Path[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const ref = (key: string) => (el: HTMLElement | null) => void (el ? nodes.current.set(key, el) : nodes.current.delete(key));

  const decision = decisions[index];
  const chosen = decision && picked[decision.id];
  const open = decision?.options.find((o) => o.id === option);
  const pickOpt = agentPath ? decision?.options.find((o) => o.agentPick && o.followUp) : undefined;
  const pickChoice = pickOpt?.followUp && (pickOpt.followUp.choices.find((c) => c.agentPick) ?? pickOpt.followUp.choices[0]);
  const trailOn = trail && !!pickOpt && !open && !chosen;
  const clear = () => {
    setOption(null);
    setFocus(null);
    setTrail(false);
  };
  const waiting = decisions.filter((d) => !picked[d.id]).length;

  const go = useCallback(
    (to: number) => {
      const next = Math.min(decisions.length - 1, Math.max(0, to));
      if (controlledIndex === undefined) setInnerIndex(next);
      onIndexChange?.(next);
      setOption(null);
      setFocus(null);
      setTrail(false);
    },
    [decisions.length, controlledIndex, onIndexChange],
  );

  const resolve = useCallback(
    (o: DecisionOption, c?: DecisionChoice) => {
      setPicked((p) => ({ ...p, [decision.id]: { option: o.id, choice: c?.id } }));
      onResolve?.({ decision, option: o, choice: c });
      const next = decisions.findIndex((d, i) => i > index && !picked[d.id]);
      if (next >= 0 && advanceMs > 0) setTimeout(() => go(next), advanceMs);
    },
    [decision, decisions, go, index, onResolve, picked, advanceMs],
  );

  const pickOption = useCallback(
    (o: DecisionOption) => {
      if (chosen) return;
      const choices = o.followUp?.choices ?? [];
      if (!choices.length) return resolve(o);
      if (choices.length === 1 && !o.followUp?.question) return resolve(o, choices[0]);
      setTrail(false);
      setOption(o.id);
      setFocus((choices.find((c) => c.agentPick) ?? choices[0]).id);
    },
    [chosen, resolve],
  );

  // Keys work only while the widget is on screen and nobody is typing
  const latest = useRef({ decision, open, pickOption, resolve, go, index, chosen, trailOn, pickOpt, pickChoice });
  latest.current = { decision, open, pickOption, resolve, go, index, chosen, trailOn, pickOpt, pickChoice };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = root.current;
      if (!el || el.offsetParent === null || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const { decision, open, pickOption, resolve, go, index, chosen, trailOn, pickOpt, pickChoice } = latest.current;
      if (e.key === "ArrowRight") return go(index + 1);
      if (e.key === "ArrowLeft") return open || trailOn ? (setOption(null), setTrail(false)) : go(index - 1);
      if (e.key === "Escape" && (open || trailOn)) return (setOption(null), setTrail(false));
      if (e.key === "Enter" && trailOn && pickOpt) return resolve(pickOpt, pickChoice);
      if (chosen || !/^[1-9]$/.test(e.key)) return;
      const n = Number(e.key) - 1;
      if (open) {
        const c = open.followUp!.choices[n];
        if (c) resolve(open, c);
      } else if (decision.options[n]) pickOption(decision.options[n]);
    };
    if (!keyboard) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard]);

  // Connector lines are measured from the real boxes so they follow any content height
  const measure = useCallback(() => {
    const host = body.current;
    if (!host || !decision) return;
    const h = host.getBoundingClientRect();
    const box = (key: string) => {
      const r = nodes.current.get(key)?.getBoundingClientRect();
      return r && { l: r.left - h.left, r: r.right - h.left, t: r.top - h.top, b: r.bottom - h.top, m: (r.top + r.bottom) / 2 - h.top };
    };
    const card = box("card");
    const out: Path[] = [];
    if (!card) return setPaths(out);
    decision.options.forEach((o) => {
      const p = box(`opt:${o.id}`);
      if (!p) return;
      const lead = trailOn && pickOpt?.id === o.id;
      const on = open ? open.id === o.id : chosen ? chosen.option === o.id : lead;
      if ((open || chosen) && !on) return;
      out.push({ d: rounded(card.r, card.m, p.l, p.m), on });
      const f = o.followUp;
      if (!f) return;
      const q = box(`q:${o.id}`);
      const first = q ?? box(`c:${o.id}:${f.choices[0].id}`);
      if (!first) return;
      out.push({ d: rounded(p.r, p.m, first.l, first.m), on });
      if (!q) return;
      const spine = q.l + 22;
      const ends = f.choices.map((c) => ({ id: c.id, ...box(`c:${o.id}:${c.id}`)! })).filter((x) => x.m !== undefined);
      if (!ends.length) return;
      const last = ends[ends.length - 1];
      const lit = (id: string) => on && (!lead || id === pickChoice?.id);
      out.push({ d: `M${spine} ${q.b}V${last.m - 10}Q${spine} ${last.m} ${spine + 10} ${last.m}H${last.l}`, on: lit(last.id) || (on && lead) });
      ends.slice(0, -1).forEach((c) => out.push({ d: `M${spine} ${c.m - 10}Q${spine} ${c.m} ${spine + 10} ${c.m}H${c.l}`, on: lit(c.id) }));
    });
    setPaths(out);
  }, [decision, open, chosen, trailOn, pickOpt, pickChoice]);

  useLayoutEffect(() => {
    measure();
    const host = body.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [measure]);

  const footer = useMemo(() => {
    if (!decision) return null;
    if (chosen) return <>{L.decided}</>;
    if (trailOn)
      return (
        <>
          {L.agentPath} <i>·</i> {L.accept} <kbd>↵</kbd> <i>·</i> {L.clickAway}
        </>
      );
    if (open) return <>{L.then} <kbd>1</kbd> – <kbd>{open.followUp!.choices.length}</kbd></>;
    return (
      <>
        {L.pickBranch} <kbd>1</kbd> – <kbd>{decision.options.length}</kbd> <i>·</i> {L.next} <kbd>→</kbd>
      </>
    );
  }, [decision, open, chosen, trailOn, L]);

  if (!decision) return null;
  return (
    <div
      ref={root}
      style={style}
      className={`xdt${compact ? " xdt-compact" : ""}${className ? ` ${className}` : ""}`}
      onClick={(e) => {
        // Clicking anywhere that is not a branch, an answer or the root card puts every branch back
        if (!(e.target as HTMLElement).closest(".xdt-opt,.xdt-choice,.xdt-card")) clear();
      }}
    >
      <style>{CSS}</style>
      <header className="xdt-head">
        <span className="xdt-title">
          {icon !== undefined ? (
            icon
          ) : (
          <svg viewBox="0 0 20 20" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <circle cx="4.5" cy="10" r="2.4" />
            <circle cx="15" cy="4.5" r="2.4" />
            <circle cx="15" cy="15.5" r="2.4" />
            <path d="M6.8 9l6-3.4M6.8 11l6 3.4" />
          </svg>
          )}
          <b>{title}</b>
          <span>{waiting ? L.waiting(waiting) : L.allDecided}</span>
        </span>
        {(showPager ?? decisions.length > 1) && (
        <span className="xdt-pager">
          <span className="xdt-dots" aria-hidden="true">
            {decisions.map((d, i) => (
              <i key={d.id} data-on={i === index} data-done={!!picked[d.id]} />
            ))}
          </span>
          {L.pager(index + 1, decisions.length)}
        </span>
        )}
      </header>

      <div className="xdt-body" ref={body} key={decision.id}>
        <svg className="xdt-lines" aria-hidden="true">
          {paths.map((p, i) => (
            <path key={i} d={p.d} data-on={p.on} />
          ))}
        </svg>

        <section
          className="xdt-card"
          ref={ref("card")}
          data-trail={trailOn}
          role={pickOpt ? "button" : undefined}
          tabIndex={pickOpt ? 0 : undefined}
          aria-pressed={pickOpt ? trailOn : undefined}
          aria-label={L.showPath}
          onClick={() => {
            if (chosen || !pickOpt) return;
            setOption(null);
            setTrail((t) => !t);
          }}
          onKeyDown={(e) => {
            if (e.key === " ") {
              e.preventDefault();
              e.currentTarget.click();
            }
          }}
        >
          <span className="xdt-risk" data-risk={decision.risk}>
            {L.risk[decision.risk]}
          </span>
          <div className="xdt-who">
            <Tile size={58}>{decision.agent.icon ?? <Icons.spark />}</Tile>
            <div>
              <b>{decision.agent.name}</b>
              <span>{decision.agent.model}</span>
            </div>
          </div>
          <h3>{decision.question}</h3>
          {decision.details && <p>{decision.details}</p>}
        </section>

        {decision.options.map((o, i) => {
          const lead = trailOn && pickOpt?.id === o.id;
          const on = open?.id === o.id || chosen?.option === o.id;
          const hidden = (!!open || !!chosen) && !on;
          const faded = trailOn && !lead;
          const f = o.followUp;
          return (
            <div className="xdt-row" key={o.id} data-hidden={hidden} data-faded={faded}>
              <button
                type="button"
                ref={ref(`opt:${o.id}`)}
                className="xdt-opt"
                data-on={on || lead}
                data-other={o.other}
                disabled={!!chosen || hidden}
                onClick={() => pickOption(o)}
              >
                <kbd>{i + 1}</kbd>
                {o.icon && <Tile>{o.icon}</Tile>}
                <span className="xdt-optText">
                  <b>{o.label}</b>
                  {o.agentPick && <em>{L.agentPick}</em>}
                </span>
              </button>

              <div className="xdt-group" data-show={!!f && !open && !chosen ? "peek" : on ? "open" : "off"}>
                {f?.question && (
                  <div className="xdt-q" ref={ref(`q:${o.id}`)}>
                    {f.question}
                  </div>
                )}
                <div className="xdt-choices" data-spine={!!f?.question}>
                  {f?.choices.map((c, ci) => {
                    const sel = chosen?.option === o.id && chosen.choice === c.id;
                    const lit = (on && !chosen && (focus ? focus === c.id : c.agentPick)) || (lead && c.id === pickChoice?.id);
                    const dim = (on && !chosen && !lit) || (!!chosen && on && !sel) || (lead && !lit);
                    return (
                      <div key={c.id} className="xdt-choiceWrap">
                        <button
                          type="button"
                          ref={ref(`c:${o.id}:${c.id}`)}
                          className="xdt-choice"
                          data-lit={lit || sel}
                          data-dim={dim}
                          data-plain={!f.question}
                          disabled={!on || !!chosen}
                          onMouseEnter={() => on && setFocus(c.id)}
                          onClick={() => resolve(o, c)}
                        >
                          <span className="xdt-ctop">
                            {f.question && <kbd>{ci + 1}</kbd>}
                            {c.icons?.[0] && f.question && <Tile size={26}>{c.icons[0]}</Tile>}
                            <b>{c.title}</b>
                            {c.agentPick && <em>{L.agentPick}</em>}
                          </span>
                          <span className="xdt-cbot">
                            {c.flag ? <mark>{c.flag}</mark> : c.detail && <span className="xdt-detail">{c.detail}</span>}
                            {c.icons && (
                              <span className="xdt-icons">
                                {c.icons.map((ic, k) => (
                                  <Tile key={k} size={30}>
                                    {ic}
                                  </Tile>
                                ))}
                              </span>
                            )}
                          </span>
                        </button>
                        {sel && (
                          <div className="xdt-done">
                            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M3 8.5l3.2 3L13 4.5" />
                            </svg>
                            {L.approved} <i>·</i> {L.running}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <footer className="xdt-foot">{footer}</footer>
    </div>
  );
}

function Tile({ children, size = 32 }: { children: ReactNode; size?: number }) {
  return (
    <span className="xdt-tile" style={{ width: size, height: size }}>
      {children}
    </span>
  );
}

/** Small brand-style glyphs for the demo data; pass any node as an icon in real use */
export const Icons = {
  spark: () => (
    <svg viewBox="0 0 24 24" width="22" height="22" stroke="#e58f78" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <path key={i} d="M12 3.5v5" transform={`rotate(${i * 30} 12 12)`} />
      ))}
    </svg>
  ),
  vercel: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M12 4l9 16H3z" />
    </svg>
  ),
  github: () => (
    <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  ),
  slack: () => (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="10" y="2" width="4" height="9" rx="2" fill="#36c5f0" />
      <rect x="13" y="10" width="9" height="4" rx="2" fill="#2eb67d" />
      <rect x="10" y="13" width="4" height="9" rx="2" fill="#ecb22e" />
      <rect x="2" y="10" width="9" height="4" rx="2" fill="#e01e5a" />
    </svg>
  ),
  status: () => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#4660e8" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M3.500 10a12 12 0 0 1 17 0M7 13.500a7 7 0 0 1 10 0" />
      <circle cx="12" cy="17.500" r="1.400" fill="#4660e8" />
    </svg>
  ),
  flag: () => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M3 17l5-9h4l-5 9zm7 0l5-9h4l-5 9z" />
    </svg>
  ),
  sentry: () => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 19c0-7 4-13 8-13s8 6 8 13M8 19c0-4 2-8 4-8s4 4 4 8" />
    </svg>
  ),
  stripe: () => (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#635bff" />
      <path d="M12.500 8.500c-1.600-.6-2.300-.4-2.300.2 0 1.200 4 .8 4 3.400 0 1.700-1.600 2.500-3.400 2.300" stroke="#fff" strokeWidth="1.600" fill="none" strokeLinecap="round" />
    </svg>
  ),
};

const CSS = `
.xdt{
  --xdt-bg:#1d1d20;--xdt-panel:#222226;--xdt-surface:#1c1c1f;--xdt-surface-hover:#212125;--xdt-choice:#1f1f22;--xdt-tile:#1b1b1e;--xdt-tile-deep:#18181b;
  --xdt-line:#2c2c31;--xdt-line-strong:#3a3a41;--xdt-text:#f4f4f6;--xdt-muted:#8d8d96;--xdt-kbd:#2e2e33;
  --xdt-accent:#7388f4;--xdt-accent-soft:rgba(115,136,244,.1);--xdt-select:#4358c4;--xdt-select-bg:#1d1f2b;--xdt-lit-bg:#1b1d2a;--xdt-glow:rgba(80,100,240,.55);--xdt-path-on:#5a6cc8;--xdt-done-line:#3a4796;--xdt-dot-on:#fff;
  --xdt-flag-bg:#463d25;--xdt-flag-text:#dfb866;
  --xdt-risk-high-bg:#4a2a2a;--xdt-risk-high-text:#f2917e;--xdt-risk-medium-bg:#4a3321;--xdt-risk-medium-text:#e9a574;--xdt-risk-low-bg:#24402f;--xdt-risk-low-text:#7fd1a0;
  --xdt-radius:24px;
  position:relative;box-sizing:border-box;display:flex;flex-direction:column;gap:34px;min-height:100%;padding:56px 70px 40px;background:var(--xdt-bg);color:var(--xdt-text);
  border-radius:var(--xdt-radius);border:1px solid var(--xdt-line);font:500 15px/1.35 Inter,ui-sans-serif,system-ui,sans-serif;letter-spacing:-.01em}
.xdt *{box-sizing:border-box}
.xdt :where(button){font:inherit;color:inherit;letter-spacing:inherit;text-align:left;background:none;border:0;padding:0;cursor:pointer}
.xdt :where(button):disabled{cursor:default}
.xdt kbd{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 5px;border-radius:6px;background:var(--xdt-kbd);color:var(--xdt-muted);font:500 12px/1 inherit;font-family:inherit}
.xdt i{font-style:normal;color:var(--xdt-muted);margin:0 4px}
.xdt-head{display:flex;align-items:center;justify-content:space-between}
.xdt-title{display:flex;align-items:center;gap:12px;color:var(--xdt-accent)}
.xdt-title b{color:var(--xdt-text);font-size:25px;font-weight:600}
.xdt-title span{color:var(--xdt-muted);font-size:23px}
.xdt-pager{display:flex;align-items:center;gap:12px;color:var(--xdt-muted);font-size:23px;padding-right:14px}
.xdt-dots{display:flex;gap:4px}
.xdt-dots i{width:10px;height:10px;margin:0;border-radius:5px;background:var(--xdt-line-strong);transition:width .25s,background .25s}
.xdt-dots i[data-on=true]{width:16px;background:var(--xdt-dot-on)}
.xdt-dots i[data-done=true]:not([data-on=true]){background:var(--xdt-accent)}
.xdt-body{position:relative;flex:1;display:grid;grid-template-columns:410px minmax(300px,410px) minmax(0,1fr);column-gap:0;row-gap:28px;align-content:center;align-items:center;margin-top:14px;animation:xdt-in .35s ease-out}
@keyframes xdt-in{from{opacity:0;transform:translateY(6px)}}
.xdt-lines{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.xdt-lines path{fill:none;stroke:var(--xdt-line-strong);stroke-width:1.3;transition:stroke .25s}
.xdt-lines path[data-on=true]{stroke:var(--xdt-path-on)}
.xdt-card{grid-column:1;grid-row:1/-1;align-self:center;margin-right:56px;position:relative;z-index:1;display:flex;flex-direction:column;gap:18px;padding:32px;border-radius:18px;background:var(--xdt-panel);border:1px solid var(--xdt-line)}
.xdt-risk{position:absolute;left:4px;top:-52px;padding:5px 14px;border-radius:8px;font-size:15px;font-weight:500}
.xdt-risk[data-risk=high]{background:var(--xdt-risk-high-bg);color:var(--xdt-risk-high-text)}
.xdt-risk[data-risk=medium]{background:var(--xdt-risk-medium-bg);color:var(--xdt-risk-medium-text)}
.xdt-risk[data-risk=low]{background:var(--xdt-risk-low-bg);color:var(--xdt-risk-low-text)}
.xdt-who{display:flex;align-items:center;gap:16px}
.xdt-who b{display:block;font-size:21px;font-weight:500}
.xdt-who span{color:var(--xdt-muted);font-size:21px}
.xdt-card h3{margin:0;font-size:25px;line-height:1.6;font-weight:500;letter-spacing:-.02em}
.xdt-card p{margin:0;color:var(--xdt-muted);font-size:21px;line-height:1.6}
.xdt-tile{color:var(--xdt-text);flex:none;display:inline-grid;place-items:center;border-radius:9px;background:var(--xdt-tile);border:1px solid var(--xdt-line)}
.xdt-card .xdt-tile{border-radius:12px}
.xdt-row{display:contents}
.xdt-row>*{position:relative;z-index:1;transition:opacity .3s}
.xdt-row[data-hidden=true]>*{opacity:0;pointer-events:none}
.xdt-row[data-faded=true]>*{opacity:.3}
.xdt-card:not([role=button]){cursor:default}
.xdt-card{cursor:pointer;transition:border-color .2s,box-shadow .2s}
.xdt-card:hover{border-color:var(--xdt-line-strong)}
.xdt-card[data-trail=true]{border-color:var(--xdt-select);box-shadow:0 8px 50px -8px var(--xdt-glow)}
.xdt-card:focus-visible{outline:2px solid var(--xdt-accent);outline-offset:2px}
.xdt-opt{grid-column:2;display:flex;align-items:center;gap:12px;margin-right:48px;padding:16px 22px;border-radius:14px;background:var(--xdt-surface);border:1px solid var(--xdt-line);font-size:26px;line-height:1.3;transition:border-color .2s,box-shadow .2s,background .2s}
.xdt-opt:hover:not(:disabled){border-color:var(--xdt-line-strong);background:var(--xdt-surface-hover)}
.xdt-opt[data-on=true]{border-color:var(--xdt-select);box-shadow:0 8px 50px -8px var(--xdt-glow);background:var(--xdt-select-bg)}
.xdt-opt[data-other=true]{color:var(--xdt-muted)}
.xdt-opt kbd{font-size:20px;height:34px;min-width:34px;border-radius:8px}
.xdt-opt .xdt-tile{width:36px;height:36px}
.xdt-optText{display:flex;flex-direction:column;min-width:0}
.xdt-optText b{font-size:26px;font-weight:500;white-space:nowrap}
.xdt-optText em{font-style:normal;color:var(--xdt-accent);font-size:22px}
.xdt-group{grid-column:3;display:flex;flex-direction:column;gap:14px;min-width:0}
.xdt-group[data-show=off]{visibility:hidden}
.xdt-q{align-self:flex-start;padding:12px 22px;border-radius:14px;background:var(--xdt-surface);border:1px solid var(--xdt-line);font-size:23px;font-weight:500}
.xdt-choices{display:flex;flex-direction:column;gap:12px;padding-left:44px}
.xdt-choices[data-spine=false]{padding-left:0}
.xdt-choiceWrap{display:flex;flex-direction:column;gap:10px;align-items:flex-start}
.xdt-choice{display:flex;flex-direction:column;gap:6px;max-width:100%;padding:15px 22px;border-radius:14px;background:var(--xdt-choice);border:1px solid var(--xdt-line);transition:opacity .25s,border-color .2s,box-shadow .2s,background .2s}
.xdt-choice[data-plain=true]{display:grid;grid-template-columns:1fr auto;column-gap:24px;row-gap:2px;align-items:center;padding:16px 24px}
.xdt-choice[data-plain=true] .xdt-cbot{display:contents}
.xdt-choice[data-plain=true] .xdt-detail{grid-column:1}
.xdt-choice[data-plain=true] .xdt-icons{grid-column:2;grid-row:1/3}
.xdt-ctop{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.xdt-ctop b{font-size:23px;font-weight:500}
.xdt-ctop em{font-style:normal;color:var(--xdt-accent);font-size:21px}
.xdt-cbot{display:flex;align-items:center;justify-content:space-between;gap:20px;color:var(--xdt-muted);font-size:22px}
.xdt-cbot mark{background:var(--xdt-flag-bg);color:var(--xdt-flag-text);padding:0 5px;border-radius:5px;font-size:22px}
.xdt-icons{display:inline-flex;gap:2px;padding:1px;border-radius:9px;background:var(--xdt-tile-deep)}
.xdt-icons .xdt-tile{border:0;background:transparent}
.xdt-choice:hover:not(:disabled){border-color:var(--xdt-line-strong)}
.xdt-choice[data-lit=true]{border-color:var(--xdt-select);box-shadow:0 8px 50px -10px var(--xdt-glow);background:var(--xdt-lit-bg)}
.xdt-choice[data-dim=true]{opacity:.35}
.xdt-done{display:flex;align-items:center;gap:8px;margin-left:34px;padding:8px 16px;border-radius:12px;background:var(--xdt-select-bg);border:1px solid var(--xdt-done-line);font-size:21px;animation:xdt-in .3s ease-out}
.xdt-done svg{width:18px;height:18px}
.xdt-done i{margin:0 2px}
.xdt-foot{display:flex;align-items:center;gap:8px;color:var(--xdt-muted);font-size:21px}
.xdt-foot kbd{font-size:17px;height:28px;min-width:30px;border-radius:7px}
.xdt-compact{--s:.62;gap:18px;padding:30px 28px 22px;border-radius:18px;font-size:12px}
.xdt-compact .xdt-title b{font-size:17px}.xdt-compact .xdt-title span{font-size:14px}.xdt-compact .xdt-title svg{width:20px;height:20px}
.xdt-compact .xdt-pager{font-size:14px}
.xdt-compact .xdt-body{grid-template-columns:250px minmax(210px,275px) minmax(0,1fr);row-gap:16px;margin-top:6px}
.xdt-compact .xdt-card{margin-right:34px;padding:20px;gap:12px;border-radius:14px}
.xdt-compact .xdt-risk{top:-36px;font-size:12px;padding:3px 10px}
.xdt-compact .xdt-who{gap:10px}.xdt-compact .xdt-who b,.xdt-compact .xdt-who span{font-size:14px}
.xdt-compact .xdt-card h3{font-size:16px;line-height:1.5}.xdt-compact .xdt-card p{font-size:13px;line-height:1.5}
.xdt-compact .xdt-card .xdt-tile{width:38px!important;height:38px!important}
.xdt-compact .xdt-opt{margin-right:30px;padding:10px 12px;gap:8px;border-radius:11px}
.xdt-compact .xdt-opt kbd{font-size:13px;height:24px;min-width:24px}.xdt-compact .xdt-opt .xdt-tile{width:26px;height:26px}
.xdt-compact .xdt-optText b{font-size:16px}.xdt-compact .xdt-optText em{font-size:13px}
.xdt-compact .xdt-q{padding:8px 14px;font-size:14px;border-radius:11px}
.xdt-compact .xdt-choices{padding-left:28px;gap:8px}
.xdt-compact .xdt-choice{padding:10px 14px;border-radius:11px}.xdt-compact .xdt-choice[data-plain=true]{padding:10px 14px}
.xdt-compact .xdt-ctop b{font-size:14px}.xdt-compact .xdt-ctop em{font-size:12px}.xdt-compact .xdt-cbot,.xdt-compact .xdt-cbot mark{font-size:13px}
.xdt-compact .xdt-done{font-size:13px;padding:5px 11px;margin-left:22px}.xdt-compact .xdt-done svg{width:13px;height:13px}
.xdt-compact .xdt-foot{font-size:13px}.xdt-compact .xdt-foot kbd{font-size:11px;height:20px;min-width:20px}
@media (prefers-reduced-motion:reduce){.xdt *{animation:none!important;transition:none!important}}
`;
