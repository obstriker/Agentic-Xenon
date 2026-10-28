import * as React from "react";

export interface UsageMeterProps {
  label?: string;
  value: number;
  max: number;
  /** Optional unit label, e.g. "tokens" or "requests" */
  unit?: string;
  /** Shows the percentage instead of the fraction (e.g., "65%") */
  showPercentage?: boolean;
  /** Changes color when nearing or exceeding the limit */
  thresholds?: {
    warning?: number; // e.g. 0.8 for 80%
    critical?: number; // e.g. 0.95 for 95%
  };
  className?: string;
}

export function UsageMeter({
  label,
  value,
  max,
  unit,
  showPercentage = false,
  thresholds = { warning: 0.75, critical: 0.9 },
  className = "",
}: UsageMeterProps) {
  const safeMax = max > 0 ? max : 1;
  const percentage = Math.min(Math.max(value / safeMax, 0), 1);
  const percentageDisplay = Math.round(percentage * 100);

  // Determine color state based on thresholds
  let state = "normal";
  if (thresholds.critical !== undefined && percentage >= thresholds.critical) {
    state = "critical";
  } else if (thresholds.warning !== undefined && percentage >= thresholds.warning) {
    state = "warning";
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(num);
  };

  return (
    <div className={`um-root ${className}`}>
      <style>{css}</style>

      <div className="um-header">
        {label && <span className="um-label">{label}</span>}
        <span className="um-values" aria-live="polite">
          {showPercentage ? (
            <span className="um-val-current">{percentageDisplay}%</span>
          ) : (
            <>
              <span className="um-val-current">{formatNumber(value)}</span>
              <span className="um-val-max"> / {formatNumber(max)}</span>
            </>
          )}
          {unit && <span className="um-unit"> {unit}</span>}
        </span>
      </div>

      <div 
        className="um-track" 
        role="progressbar" 
        aria-valuenow={value} 
        aria-valuemin={0} 
        aria-valuemax={max}
        aria-label={label || "Usage"}
      >
        <div 
          className={`um-fill um-fill--${state}`} 
          style={{ width: `${percentageDisplay}%` }}
        >
          {/* Inner shimmer effect for motion */}
          <div className="um-shimmer" />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- css */

const css = `
.um-root {
  --um-bg: #141416;
  --um-track: #27272a;
  --um-text: #f0f0f4;
  --um-text-muted: #8c8c96;
  
  --um-bar-normal: #5c8bff;
  --um-bar-warning: #f59e0b;
  --um-bar-critical: #ef4444;

  width: 100%;
  max-width: 460px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--um-text);
  box-sizing: border-box;
}

.um-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 8px;
  font-size: 13px;
}

.um-label {
  color: var(--um-text-muted);
  font-weight: 500;
}

.um-values {
  font-variant-numeric: tabular-nums;
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.um-val-current {
  font-weight: 600;
  color: var(--um-text);
  transition: color 0.3s ease;
}

.um-val-max {
  color: var(--um-text-muted);
}

.um-unit {
  color: var(--um-text-muted);
  font-size: 11px;
  margin-left: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.um-track {
  width: 100%;
  height: 8px;
  background: var(--um-track);
  border-radius: 99px;
  overflow: hidden;
  position: relative;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
}

.um-fill {
  height: 100%;
  border-radius: 99px;
  position: relative;
  /* Spring-like easing for the width change */
  transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.4s ease;
}

.um-fill--normal { background: var(--um-bar-normal); }
.um-fill--warning { background: var(--um-bar-warning); }
.um-fill--critical { background: var(--um-bar-critical); }

/* Subtle moving shimmer on the fill bar */
.um-shimmer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.15) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  transform: translateX(-100%);
  animation: um-shimmer-anim 2.5s infinite;
}

@keyframes um-shimmer-anim {
  100% {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .um-fill {
    transition: width 0s, background-color 0s;
  }
  .um-shimmer {
    animation: none;
    display: none;
  }
}
`;