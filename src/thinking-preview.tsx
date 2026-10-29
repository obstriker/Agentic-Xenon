import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ThinkingLoader } from "./ui-xenon/thinking-loader";

// Standalone preview of the Thinking Loader. Open /thinking.html in the dev server.
// Plays the sequence of the reference recording at its size (lg): five phases, "Thought for 10s", then it starts again.
// ?done freezes the finished state, ?phase=N freezes phase N, ?size=sm|md|lg picks a size.
const PHASES = ["Thinking", "Searching the web", "Reading 12 sources", "Comparing pricing", "Writing response"];
const INTERVAL = 2200;
const params = new URLSearchParams(location.search);
const size = (["sm", "md", "lg"].includes(params.get("size") ?? "") ? params.get("size") : "lg") as "sm" | "md" | "lg";

function Preview() {
  const [run, setRun] = useState(0);
  const [done, setDone] = useState(params.has("done"));
  useEffect(() => {
    if (params.has("done") || params.has("phase")) return;
    // the last phase gets its turn, then the check holds for a moment before the next run
    const id = window.setTimeout(() => (done ? (setDone(false), setRun((r) => r + 1)) : setDone(true)), done ? 2200 : INTERVAL * PHASES.length);
    return () => window.clearTimeout(id);
  }, [done, run]);
  return (
    <div style={{ minHeight: 640, display: "grid", placeContent: "center" }}>
      <ThinkingLoader key={run} size={size} phases={PHASES} interval={INTERVAL} phase={params.has("phase") ? Number(params.get("phase")) : undefined} done={done} doneLabel="Thought for 10s" />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
