"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import interUrl from "../assets/fonts/inter-latin-wght-normal.woff2?url";

/*
 * Thinking Loader (Xenon) – a small "the model is working" pill, in a single self-contained file.
 * A spinner of eight rays and a label with a light sweeping over it. The label walks through
 * phases (Thinking → Searching the web → …): the old one rolls up and blurs out, the new one
 * rolls in, and the pill glides to its new width. When done, the spinner turns into a check
 * and the label settles on "Thought for 6s".
 * Dark navy by default, sized for the Edge. Restyle with the --xn-tl-* variables (ink, text, ray, bg, line, shine, done, h, font, icon).
 */

export type ThinkingLoaderProps = {
  /** Labels to walk through, one after another */
  phases?: string[];
  /** Time per phase, in ms */
  interval?: number;
  /** Show a specific phase instead of advancing on a timer – e.g. from your stream events */
  phase?: number;
  /** Start over after the last phase instead of holding it */
  loop?: boolean;
  /** Finished: the spinner turns into a check and the label into doneLabel */
  done?: boolean;
  /** Label once done – a string, or a function that gets the seconds since the loader started */
  doneLabel?: string | ((seconds: number) => string);
  /** sm = 14px text, md = 20px, lg = 26px (the size of the reference recording) */
  size?: "sm" | "md" | "lg";
  /** "pill" = bordered capsule, "plain" = just the spinner and the label, e.g. inside a chat bubble */
  variant?: "pill" | "plain";
  className?: string;
};

const DEFAULT_PHASES = ["Thinking", "Searching the web", "Reading sources", "Writing response"];
const RAYS = Array.from({ length: 8 }, (_, i) => i);
// 75s reads "1m 15s", a long run "2h 05m" or "3d 4h"
const took = (s: number) => {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
};

export function ThinkingLoader({
  phases: phasesProp = DEFAULT_PHASES,
  interval: intervalProp = 2200,
  phase,
  loop = false,
  done = false,
  doneLabel = (s) => `Thought for ${took(s)}`,
  size = "md",
  variant = "pill",
  className,
}: ThinkingLoaderProps) {
  // An empty or missing list still says something; 0 or NaN never spins the timer every frame
  const given = Array.isArray(phasesProp) ? phasesProp.map((p) => String(p ?? "")) : [];
  const phases = given.length ? given : DEFAULT_PHASES.slice(0, 1);
  const interval = Number.isFinite(intervalProp) && intervalProp > 0 ? Math.max(intervalProp, 200) : 2200;
  const [step, setStep] = useState(0);
  const [started, setStarted] = useState(() => Date.now());
  const [seconds, setSeconds] = useState<number | null>(null);

  // Read the clock in the same render that turns done on – and restart it when work starts again
  const elapsed = seconds ?? Math.max(1, Math.round((Date.now() - started) / 1000));
  if (done && seconds === null) setSeconds(elapsed);
  if (!done && seconds !== null) {
    setSeconds(null);
    setStarted(Date.now());
    setStep(0);
  }

  // Advance through the phases on a timer – unless the phase is controlled
  useEffect(() => {
    if (done || (phase !== undefined && Number.isFinite(phase)) || phases.length < 2) return;
    const id = window.setInterval(() => {
      setStep((s) => (s + 1 < phases.length ? s + 1 : loop ? 0 : s));
    }, interval);
    return () => window.clearInterval(id);
  }, [done, phase, phases.length, interval, loop]);

  const wanted = phase !== undefined && Number.isFinite(phase) ? Math.floor(phase) : step;
  const index = Math.min(Math.max(wanted, 0), Math.max(phases.length - 1, 0));
  const label = String((done ? (typeof doneLabel === "function" ? doneLabel(elapsed) : doneLabel) : phases[index]) ?? "");

  // The label on screen and the one rolling out – swapped during render so both animate in the same frame
  const [shown, setShown] = useState({ key: 0, text: label });
  const [leaving, setLeaving] = useState<{ key: number; text: string } | null>(null);
  if (label !== shown.text) {
    setLeaving(shown);
    setShown({ key: shown.key + 1, text: label });
  }

  // The text box takes the width of the incoming label, so the pill glides to its new size
  const root = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  const current = useRef<HTMLSpanElement>(null);
  const measured = useRef(false);
  // Width of the label, capped by the room next to the spinner – a label that doesn't fit ends in "…"
  const fit = useRef(() => {});
  fit.current = () => {
    const r = root.current;
    const b = box.current;
    const c = current.current;
    if (!r || !b || !c) return;
    // Layout pixels (offset/scroll/client), so it stays right inside a CSS zoom or transform (+1 covers rounding)
    const full = c.scrollWidth + 1;
    const parent = r.parentElement;
    // Measured with the box at the label's full width – a parent that wraps around the pill grows with it, so only a
    // container that's really too narrow cuts the label. Without a transition, so the pill still glides from where it was.
    const was = { width: b.style.width, transition: b.style.transition };
    b.style.transition = "none";
    b.style.width = `${full}px`;
    const pad = parent ? getComputedStyle(parent) : null;
    const inner = parent && pad ? parent.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight) : 0;
    const room = parent ? Math.floor(inner - (r.offsetWidth - b.offsetWidth)) : full;
    b.style.width = was.width;
    b.getBoundingClientRect();
    b.style.transition = was.transition;
    const cut = room > 0 && full > room;
    r.toggleAttribute("data-cut", cut);
    b.style.width = `${cut ? room : full}px`;
  };
  useLayoutEffect(() => {
    const b = box.current;
    if (!b) return;
    if (!measured.current) b.style.transition = "none";
    fit.current();
    if (!measured.current) {
      b.getBoundingClientRect();
      b.style.transition = "";
      measured.current = true;
    }
  }, [shown.key]);
  // A container that narrows or widens gets the label fitted again
  useEffect(() => {
    const parent = root.current?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fit.current());
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  return (
    <span
      ref={root}
      className={["xn-tl", className].filter(Boolean).join(" ")}
      data-size={size}
      data-variant={variant}
      data-done={done || undefined}
      role="status"
      aria-live="polite"
    >
      {/* React 19 hoists this into <head> once, no matter how many loaders render */}
      <style href="xn-thinking-loader" precedence="default">
        {css}
      </style>

      <span className="xn-tl__icon" aria-hidden="true">
        <svg className="xn-tl__spinner" viewBox="0 0 14 14">
          {RAYS.map((i) => (
            <line
              key={i}
              x1="7"
              y1="0.65"
              x2="7"
              y2="3.65"
              transform={`rotate(${i * 45} 7 7)`}
              style={{ animationDelay: `${(i - 8) * 100}ms` }}
            />
          ))}
        </svg>
        <svg className="xn-tl__check" viewBox="0 0 14 14">
          <path d="M3.1 6.7 5.3 9.5 12 2.9" pathLength={1} />
        </svg>
      </span>

      <span ref={box} className="xn-tl__text">
        {leaving && (
          <span
            key={leaving.key}
            className="xn-tl__label xn-tl__label--out"
            aria-hidden="true"
            dir="auto"
            onAnimationEnd={() => setLeaving(null)}
          >
            {leaving.text}
          </span>
        )}
        <span
          key={shown.key}
          ref={current}
          className={["xn-tl__label", shown.key > 0 && "xn-tl__label--in", !done && "xn-tl__shine"].filter(Boolean).join(" ")}
          data-text={shown.text}
          title={shown.text}
          dir="auto"
        >
          {shown.text}
        </span>
      </span>
    </span>
  );
}

const css = /* css */ `
@font-face {
  font-family: "XN Inter";
  src: url(${interUrl}) format("woff2");
  font-weight: 100 900;
  font-display: swap;
}
/* Everything is in em, so the loader keeps its proportions at any size: --xn-tl-font is the only dial */
.xn-tl {
  --xn-tl-ink: #ebeaed;
  --xn-tl-text: #aaa9ac;
  --xn-tl-ray: #688df9;
  --xn-tl-bg: #1b1a1d;
  --xn-tl-line: #353437;
  --xn-tl-shine: rgba(255, 255, 255, 0.95);
  --xn-tl-done: #688df9;
  --xn-tl-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --xn-tl-font: 20px;
  display: inline-flex;
  align-items: center;
  gap: 0.558em;
  box-sizing: border-box;
  height: 2.692em;
  padding: 0 0.88em 0.115em 0.79em;
  border-radius: 0.538em;
  background: var(--xn-tl-bg);
  box-shadow: inset 0 0 0 1px var(--xn-tl-line);
  color: var(--xn-tl-text);
  font-family: "XN Inter", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: var(--xn-tl-font);
  font-weight: 550;
  letter-spacing: -0.006em;
  line-height: 1;
  max-width: 100%;
  vertical-align: middle;
  -webkit-font-smoothing: antialiased;
}
.xn-tl[data-size="sm"] { --xn-tl-font: 14px; }
.xn-tl[data-size="md"] { --xn-tl-font: 20px; }
.xn-tl[data-size="lg"] { --xn-tl-font: 26px; }
.xn-tl[data-variant="plain"] {
  height: auto;
  padding: 0;
  background: none;
  box-shadow: none;
}

/* Spinner and check share one square and swap with a little scale */
.xn-tl__icon {
  position: relative;
  flex: none;
  width: 1.077em;
  height: 1.077em;
}
.xn-tl__icon svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  transition: opacity 240ms ease, transform 420ms var(--xn-tl-ease);
}
.xn-tl__spinner line {
  stroke: var(--xn-tl-ray);
  stroke-width: 1.25;
  stroke-linecap: round;
  opacity: 0.18;
  animation: xn-tl-ray 800ms linear infinite;
}
.xn-tl__check {
  opacity: 0;
  transform: scale(0.6);
  fill: none;
  stroke: var(--xn-tl-done);
  stroke-width: 1.15;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.xn-tl__check path {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
}
.xn-tl[data-done] .xn-tl__spinner {
  opacity: 0;
  transform: scale(0.6) rotate(-45deg);
}
.xn-tl[data-done] .xn-tl__check {
  opacity: 1;
  transform: none;
}
.xn-tl[data-done] .xn-tl__check path {
  animation: xn-tl-draw 360ms var(--xn-tl-ease) 120ms forwards;
}

/* The text box glides to the width of the incoming label; labels roll through it */
/* min-width 0: in a narrow container the box gives way and the label ends in "…" */
.xn-tl__text {
  position: relative;
  display: block;
  min-width: 0;
  height: 1.3em;
  overflow: hidden;
  transition: width 460ms var(--xn-tl-ease);
}
.xn-tl__label {
  position: absolute;
  top: 0;
  left: 0;
  line-height: 1.3em;
  white-space: nowrap;
}
.xn-tl[data-cut] .xn-tl__label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.xn-tl[data-done] .xn-tl__label {
  color: var(--xn-tl-ink);
}
.xn-tl__label--in {
  animation: xn-tl-in 460ms var(--xn-tl-ease) both;
}
.xn-tl__label--out {
  animation: xn-tl-out 320ms var(--xn-tl-ease) both;
}

/* A soft light sweeping over the label while it works */
.xn-tl__shine::after {
  content: attr(data-text);
  content: attr(data-text) / "";
  position: absolute;
  inset: 0;
  white-space: nowrap;
  color: transparent;
  background: linear-gradient(90deg, transparent 38%, var(--xn-tl-shine) 50%, transparent 62%) 100% 0 / 300% 100% no-repeat;
  -webkit-background-clip: text;
  background-clip: text;
  animation: xn-tl-sweep 1.8s linear infinite;
  pointer-events: none;
}

@keyframes xn-tl-ray {
  0% { opacity: 1; }
  100% { opacity: 0.18; }
}
@keyframes xn-tl-in {
  from { opacity: 0; transform: translateY(70%); filter: blur(3px); }
  to { opacity: 1; transform: none; filter: none; }
}
@keyframes xn-tl-out {
  from { opacity: 1; transform: none; filter: none; }
  to { opacity: 0; transform: translateY(-70%); filter: blur(3px); }
}
@keyframes xn-tl-draw {
  to { stroke-dashoffset: 0; }
}
@keyframes xn-tl-sweep {
  from { background-position: 100% 0; }
  to { background-position: 0% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .xn-tl *,
  .xn-tl *::after {
    animation-duration: 1ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
  .xn-tl__spinner line { opacity: 0.6; }
  .xn-tl__shine::after { display: none; }
  .xn-tl__check path { stroke-dashoffset: 0; }
}

`;
