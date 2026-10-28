"use client";

/*
 * Limit Meter – one value against a limit, in a single self-contained file.
 * Based on a component generated with DeepSeek (named UsageMeter there; renamed because Xenon already has a
 * UsageMeter card) and adapted for Xenon: navy palette, readable sizes, the hoisted <style> the other
 * components use, an optional number formatter, and a word next to the color so the warning isn't color-only.
 */

export interface LimitMeterProps {
  label?: string;
  value: number;
  max: number;
  /** Optional unit label, e.g. "tokens" or "calls" */
  unit?: string;
  /** Shows the percentage instead of the fraction (e.g., "65%") */
  showPercentage?: boolean;
  /** Changes color when nearing or exceeding the limit */
  thresholds?: {
    warning?: number; // e.g. 0.8 for 80%
    critical?: number; // e.g. 0.95 for 95%
  };
  /** Formats value and max – e.g. as dollars. Defaults to a plain number with one decimal at most */
  format?: (n: number) => string;
  className?: string;
}

type MeterState = "normal" | "warning" | "critical";

const STATE_WORD: Record<MeterState, string | null> = { normal: null, warning: "Getting close", critical: "Almost out" };

const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const formatPlain = (n: number) => plain.format(n);

export function LimitMeter({ label, value, max, unit, showPercentage = false, thresholds = { warning: 0.75, critical: 0.9 }, format = formatPlain, className = "" }: LimitMeterProps) {
  const safeMax = max > 0 ? max : 1;
  const ratio = Math.min(Math.max(value / safeMax, 0), 1);
  const percent = Math.round(ratio * 100);

  const state: MeterState =
    thresholds.critical !== undefined && ratio >= thresholds.critical ? "critical" : thresholds.warning !== undefined && ratio >= thresholds.warning ? "warning" : "normal";
  const word = STATE_WORD[state];

  return (
    <>
      <style href="xn-limit-meter" precedence="default">
        {css}
      </style>
      <div className={["xn-lm", className].filter(Boolean).join(" ")} data-state={state}>
        <div className="xn-lm__head">
          <span className="xn-lm__label">
            {label}
            {word && <span className="xn-lm__tag">{word}</span>}
          </span>
          <span className="xn-lm__values">
            {showPercentage ? (
              <span className="xn-lm__current">{percent}%</span>
            ) : (
              <>
                <span className="xn-lm__current">{format(value)}</span>
                <span className="xn-lm__max"> / {format(max)}</span>
              </>
            )}
            {unit && <span className="xn-lm__unit">{unit}</span>}
          </span>
        </div>

        <div
          className="xn-lm__track"
          role="progressbar"
          aria-valuenow={Math.min(Math.max(value, 0), safeMax)}
          aria-valuemin={0}
          aria-valuemax={safeMax}
          aria-valuetext={`${format(value)} of ${format(max)}${unit ? ` ${unit}` : ""}`}
          aria-label={label || "Usage"}
        >
          <div className="xn-lm__fill" style={{ width: `${percent}%` }}>
            <div className="xn-lm__shimmer" />
          </div>
        </div>
      </div>
    </>
  );
}

const css = /* css */ `
.xn-lm {
  --xn-lm-track: #26364a;
  --xn-lm-text: #f4f6fb;
  --xn-lm-muted: #a9bed3;
  --xn-lm-normal: #9ecbff;
  --xn-lm-warning: #f0bf84;
  --xn-lm-critical: #ff8f86;
  box-sizing: border-box;
  width: 100%;
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--xn-lm-text);
}
.xn-lm *, .xn-lm *::before, .xn-lm *::after { box-sizing: border-box; }

.xn-lm__head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 10px; font-size: 16px; }
.xn-lm__label { display: inline-flex; align-items: baseline; gap: 10px; color: var(--xn-lm-muted); font-weight: 500; }
.xn-lm__tag { font-size: 13px; font-weight: 650; color: var(--xn-lm-warning); }
.xn-lm[data-state="critical"] .xn-lm__tag { color: var(--xn-lm-critical); }

.xn-lm__values { display: flex; align-items: baseline; font-variant-numeric: tabular-nums; }
.xn-lm__current { font-weight: 650; color: var(--xn-lm-text); }
.xn-lm__max { color: var(--xn-lm-muted); white-space: pre; }
.xn-lm__unit { margin-left: 6px; font-size: 13px; color: var(--xn-lm-muted); text-transform: uppercase; letter-spacing: 0.05em; }

.xn-lm__track { width: 100%; height: 10px; background: var(--xn-lm-track); border-radius: 99px; overflow: hidden; position: relative; }
.xn-lm__fill { height: 100%; border-radius: 99px; position: relative; background: var(--xn-lm-normal); transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.4s ease; }
.xn-lm[data-state="warning"] .xn-lm__fill { background: var(--xn-lm-warning); }
.xn-lm[data-state="critical"] .xn-lm__fill { background: var(--xn-lm-critical); }

/* A soft band of light moves along the fill */
.xn-lm__shimmer { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.28) 50%, rgba(255, 255, 255, 0) 100%); transform: translateX(-100%); animation: xn-lm-shimmer 2.5s infinite; }
@keyframes xn-lm-shimmer { 100% { transform: translateX(100%); } }

@media (prefers-reduced-motion: reduce) {
  .xn-lm__fill { transition: none; }
  .xn-lm__shimmer { animation: none; display: none; }
}
`;
