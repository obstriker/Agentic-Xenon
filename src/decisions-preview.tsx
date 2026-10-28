import { useState } from "react";
import { createRoot } from "react-dom/client";
import { DecisionTree, type DecisionTreeProps } from "./ui-xenon/decision-tree";
import { decisionTrees as decisions } from "./views/needs-trees";
import { VARIANTS, pillStyle, type Variant } from "./preview-config";

// Standalone preview of the Decision Tree, kept apart from the main app. Open /decisions.html in the dev server.
// The bar at the top reconfigures it: a light theme through CSS variables, and the words through `labels`.
const LIGHT = { "--xdt-bg": "#ffffff", "--xdt-panel": "#f6f7fa", "--xdt-surface": "#f3f4f8", "--xdt-surface-hover": "#eceef4", "--xdt-choice": "#f6f7fa", "--xdt-tile": "#ffffff", "--xdt-tile-deep": "#eef0f5", "--xdt-line": "#dfe1e8", "--xdt-line-strong": "#c9ccd6", "--xdt-text": "#16171b", "--xdt-muted": "#6d707a", "--xdt-kbd": "#e6e8ef", "--xdt-accent": "#3f55d8", "--xdt-accent-soft": "rgba(63,85,216,.1)", "--xdt-select": "#5468e8", "--xdt-select-bg": "#eef1ff", "--xdt-lit-bg": "#eef1ff", "--xdt-glow": "rgba(63,85,216,.35)", "--xdt-path-on": "#5468e8", "--xdt-done-line": "#5468e8", "--xdt-dot-on": "#16171b", "--xdt-flag-bg": "#f7ecc7", "--xdt-flag-text": "#8a6a10", "--xdt-risk-high-bg": "#fbe1de", "--xdt-risk-high-text": "#c0392b", "--xdt-risk-medium-bg": "#fbead8", "--xdt-risk-medium-text": "#b8671f", "--xdt-risk-low-bg": "#dff3e8", "--xdt-risk-low-text": "#1e8f5a" } as React.CSSProperties;

const SPANISH: Partial<DecisionTreeProps> = {
  title: "Decisiones",
  labels: {
    waiting: (n) => `${n} esperando tu respuesta`,
    allDecided: "Todo decidido",
    pager: (i, n) => `${i} de ${n}`,
    agentPick: "Elección del agente",
    risk: { low: "Riesgo bajo", medium: "Riesgo medio", high: "Riesgo alto" },
    pickBranch: "Elige una rama",
    next: "siguiente",
    then: "Después",
    decided: "Decidido",
    agentPath: "Camino del agente",
    accept: "aceptar",
    clickAway: "haz clic fuera para reiniciar",
    approved: "Aprobado",
    running: "en marcha",
    showPath: "Mostrar el camino del agente",
  },
};

function Page() {
  const [variant, setVariant] = useState<Variant>("default");
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 12, background: variant === "light" ? "#e9ebf1" : "#111", margin: -18, padding: 18, boxSizing: "content-box" }}>
      <div style={{ display: "flex", gap: 8 }}>
        {VARIANTS.map((v) => (
          <button key={v.id} style={pillStyle(variant === v.id)} onClick={() => setVariant(v.id)}>
            {v.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DecisionTree decisions={decisions} style={variant === "light" ? LIGHT : undefined} {...(variant === "spanish" ? SPANISH : {})} onResolve={(a) => console.log("resolved", a.decision.id, a.option.id, a.choice?.id)} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Page />);
