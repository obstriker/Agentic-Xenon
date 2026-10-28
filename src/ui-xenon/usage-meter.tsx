"use client";

import { useId, type ReactNode } from "react";
import { NumberTicker } from "../ui/number-ticker";
import { Button } from "../ui/button";

/*
 * Usage Meter – a provider's usage as a stacked meter, in a single self-contained file.
 * Original Xenon component, written from the public one-line description of the affectUI Pro "Usage Meter".
 * It is not affectUI code. The styles are injected below, so no extra files are needed.
 */

export type UsageSegment = { label: string; value: number; color: string };

export type UsageMeterProps = {
  name: string;
  plan: string;
  /** What the used share is made of – the values add up to the used percentage */
  segments: UsageSegment[];
  /** Daily usage in percent of the limit, oldest first – drawn as a sparkline */
  daily: number[];
  /** e.g. "Reset in 2h 18m" */
  reset: string;
  /** From this used percentage on, the card speaks up */
  warnAt?: number;
  /** Button shown near the limit */
  actionLabel?: ReactNode;
  onAction?: () => void;
  className?: string;
};

const W = 160;
const H = 36;

function sparkPath(values: number[]) {
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? W / (values.length - 1) : 0;
  const pts = values.map((v, i) => [i * step, H - 4 - (v / max) * (H - 10)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return { line, area: `${line} L${W} ${H} L0 ${H} Z`, last: pts[pts.length - 1] };
}

export function UsageMeter({ name, plan, segments, daily, reset, warnAt = 85, actionLabel, onAction, className }: UsageMeterProps) {
  const used = Math.min(100, Math.round(segments.reduce((sum, s) => sum + s.value, 0)));
  const near = used >= warnAt;
  const spark = sparkPath(daily);
  const fade = useId();
  let offset = 0;

  return (
    <>
      <style href="xn-usage-meter" precedence="default">
        {css}
      </style>
      <article className={["xn-um", className].filter(Boolean).join(" ")} data-near={near || undefined} aria-label={`${name} usage`}>
        <header className="xn-um__head">
          <div>
            <h2 className="xn-um__name">{name}</h2>
            <small className="xn-um__plan">{plan}</small>
          </div>
          <svg className="xn-um__spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily usage, last ${daily.length} days`}>
            <defs>
              <linearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="currentColor" stopOpacity="0.32" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="xn-um__spark-area" d={spark.area} fill={`url(#${fade})`} />
            <path className="xn-um__spark-line" d={spark.line} pathLength={1} />
            <circle className="xn-um__spark-dot" cx={spark.last[0]} cy={spark.last[1]} r="3" />
          </svg>
        </header>

        <div className="xn-um__figure">
          <NumberTicker value={used} />
          <span className="xn-um__pct">%</span>
          <small className="xn-um__used">used</small>
        </div>

        <div className="xn-um__bar" role="progressbar" aria-label={`${name} used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={used}>
          {segments.map((s, i) => {
            const left = offset;
            offset += s.value;
            return (
              <span
                key={s.label}
                className="xn-um__seg"
                title={`${s.label} · ${s.value}%`}
                style={{ left: `${left}%`, width: `${s.value}%`, background: s.color, animationDelay: `${120 + i * 110}ms` }}
              />
            );
          })}
          <span className="xn-um__limit" style={{ left: `${warnAt}%` }} aria-hidden="true" />
        </div>

        <ul className="xn-um__legend">
          {segments.map((s) => (
            <li key={s.label}>
              <i style={{ background: s.color }} aria-hidden="true" />
              {s.label}
              <b>{s.value}%</b>
            </li>
          ))}
        </ul>

        {near ? (
          <div className="xn-um__alert" role="status">
            <span>
              Only <b>{100 - used}%</b> left · {reset.toLowerCase()}
            </span>
            {actionLabel && (
              <Button size="md" variant="secondary" onClick={onAction}>
                {actionLabel}
              </Button>
            )}
          </div>
        ) : (
          <footer className="xn-um__foot">
            <span>{reset}</span>
            <b>{100 - used}% remaining</b>
          </footer>
        )}
      </article>
    </>
  );
}

const css = /* css */ `
.xn-um {
  --xn-um-card: #182536;
  --xn-um-line: #34475c;
  --xn-um-ink: #f4f6fb;
  --xn-um-muted: #aec0d6;
  --xn-um-track: #26364a;
  --xn-um-warn: #f0bf84;
  --xn-um-ease: cubic-bezier(0.22, 1, 0.36, 1);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  background: var(--xn-um-card);
  border: 1px solid var(--xn-um-line);
  border-radius: 16px;
  color: var(--xn-um-ink);
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  transition: border-color 300ms ease, box-shadow 300ms ease;
}
.xn-um *, .xn-um *::before, .xn-um *::after { box-sizing: border-box; }
.xn-um[data-near] { border-color: rgba(240, 191, 132, 0.45); box-shadow: 0 0 0 1px rgba(240, 191, 132, 0.12), 0 12px 40px -18px rgba(240, 191, 132, 0.35); }

.xn-um__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.xn-um__name { margin: 0; font-size: 23px; font-weight: 650; letter-spacing: -0.02em; }
.xn-um__plan { font-size: 15px; color: var(--xn-um-muted); }

.xn-um__spark { width: 120px; height: 36px; flex: none; overflow: visible; }
.xn-um__spark-area { stroke: none; }
.xn-um__spark-line { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1; animation: xn-um-draw 900ms var(--xn-um-ease) 200ms forwards; }
.xn-um__spark-dot { fill: currentColor; }
.xn-um { --xn-um-spark: #9ecbff; }
.xn-um__spark { color: var(--xn-um-spark); }
.xn-um[data-near] .xn-um__spark { color: var(--xn-um-warn); }

.xn-um__figure { display: flex; align-items: baseline; font-size: 45px; font-weight: 700; letter-spacing: -0.05em; line-height: 1; }
.xn-um__pct { margin-left: 1px; }
.xn-um__used { margin-left: 10px; font-size: 16px; font-weight: 400; letter-spacing: 0; color: var(--xn-um-muted); }

.xn-um__bar { position: relative; height: 12px; border-radius: 8px; background: var(--xn-um-track); overflow: hidden; }
.xn-um__seg { position: absolute; top: 0; bottom: 0; transform-origin: left center; animation: xn-um-grow 700ms var(--xn-um-ease) both; }
.xn-um__seg + .xn-um__seg { box-shadow: -2px 0 0 var(--xn-um-card); }
.xn-um__limit { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: rgba(255, 255, 255, 0.5); }

.xn-um__legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; padding: 0; list-style: none; font-size: 14px; color: var(--xn-um-muted); }
.xn-um__legend li { display: inline-flex; align-items: center; gap: 7px; }
.xn-um__legend i { width: 9px; height: 9px; border-radius: 50%; }
.xn-um__legend b { color: var(--xn-um-ink); font-weight: 600; }

.xn-um__foot { display: flex; align-items: center; justify-content: space-between; font-size: 16px; color: var(--xn-um-muted); }
.xn-um__foot b { color: var(--xn-um-ink); }

/* Near the limit the card speaks up: a warm strip with the way out */
.xn-um__alert { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 9px 9px 9px 16px; border-radius: 12px; background: #352b1f; border: 1px solid rgba(240, 191, 132, 0.28); color: #f5d7ae; font-size: 15px; animation: xn-um-nudge 2.8s var(--xn-um-ease) 600ms infinite; }
.xn-um__alert b { color: #fff; }
/* The way out is a solid amber button, so it reads as part of the warning instead of a gray button on brown */
.dark .xn-um__alert .ui-button { --ui-btn-surface: #f0bf84; --ui-btn-surface-hover: #f6cc99; --ui-btn-ink: #2a1c08; --ui-btn-line: transparent; --ui-btn-surface-shadow: rgba(0, 0, 0, 0.3); }

@keyframes xn-um-grow { from { transform: scaleX(0); } }
@keyframes xn-um-draw { to { stroke-dashoffset: 0; } }
@keyframes xn-um-nudge { 0%, 70%, 100% { box-shadow: 0 0 0 0 rgba(240, 191, 132, 0); } 82% { box-shadow: 0 0 0 5px rgba(240, 191, 132, 0.16); } }

@media (prefers-reduced-motion: reduce) {
  .xn-um__seg, .xn-um__alert { animation: none; }
  .xn-um__spark-line { animation: none; stroke-dashoffset: 0; }
}
`;
