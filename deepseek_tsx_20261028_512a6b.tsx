import * as React from "react";
import { UsageMeter } from "./UsageMeter";

export default function App() {
  const [tokens, setTokens] = React.useState(6500);

  return (
    <div style={{ padding: 40, background: "#0a0a0b", minHeight: "100vh", display: "flex", flexDirection: "column", gap: 32 }}>
      
      {/* Basic Usage */}
      <UsageMeter 
        label="API Calls" 
        value={tokens} 
        max={10000} 
        unit="calls"
      />

      {/* Warning State (Over 75%) */}
      <UsageMeter 
        label="Context Window" 
        value={92000} 
        max={128000} 
        unit="tokens"
      />

      {/* Critical State with Percentage */}
      <UsageMeter 
        label="Monthly Spend" 
        value={980} 
        max={1000} 
        showPercentage
        thresholds={{ warning: 0.8, critical: 0.95 }}
      />

      {/* Live Animation Test */}
      <div style={{ marginTop: 20 }}>
        <button 
          onClick={() => setTokens(t => t > 9000 ? 1000 : t + 800)}
          style={{ padding: "8px 16px", background: "#27272a", color: "#fff", border: "none", borderRadius: 6, marginBottom: 16, cursor: "pointer" }}
        >
          Simulate Usage Increase
        </button>
        <UsageMeter 
          label="Live Demo" 
          value={tokens} 
          max={10000} 
        />
      </div>

    </div>
  );
}