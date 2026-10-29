import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./variants.css";
import { demo } from "./views/live/plan";

// Preview of the Command view in three visual treatments. Same layout, same components; only styling differs.
// Pick one with #a, #b or #c (or #current). The app renders at the Xeneon Edge's native 2560x720 and scales to fit.
const W = 2560;
const H = 720;
const NAMES: Record<string, string> = { current: "Current", a: "A · Glass", b: "B · Instrument", c: "C · Signal" };
const DEMO_SPEED = 0.12; // steps take 5 to 9 s instead of 40 to 72 s
const read = () => (location.hash.slice(1) in NAMES ? location.hash.slice(1) : "a");

function Preview() {
  const [variant, setVariant] = useState(read);
  const [scale, setScale] = useState(1);
  const [fast, setFast] = useState(() => location.search.includes("demo"));
  demo.speed = fast ? DEMO_SPEED : 1;
  useEffect(() => {
    const onHash = () => setVariant(read());
    const onSize = () => setScale(Math.min(innerWidth / W, (innerHeight - 56) / H));
    onSize();
    addEventListener("hashchange", onHash);
    addEventListener("resize", onSize);
    return () => {
      removeEventListener("hashchange", onHash);
      removeEventListener("resize", onSize);
    };
  }, []);
  return (
    <div className="altPage">
      <nav className="altBar">
        {Object.entries(NAMES).map(([k, n]) => (
          <a key={k} href={`#${k}`} className={k === variant ? "on" : ""}>
            {n}
          </a>
        ))}
        <button className={`altDemo${fast ? " on" : ""}`} aria-pressed={fast} onClick={() => setFast((f) => !f)}>
          Demo tasks {fast ? "on" : "off"}
        </button>
      </nav>
      <div className="altStage" style={{ width: W * scale, height: H * scale }}>
        <div className="altFrame" data-variant={variant} style={{ width: W, height: H, transform: `scale(${scale})` }}>
          <App />
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
