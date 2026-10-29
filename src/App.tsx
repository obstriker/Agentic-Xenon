import { useCallback, useEffect, useRef, useState } from "react";
import { useBackend } from "./api/backend";
import { AgentExpander, type ExpandState } from "./AgentExpander";
import { Command } from "./views/Command";
import { Live } from "./views/Live";
import { Needs } from "./views/Needs";
import { Monitor } from "./views/Monitor";

export type View = "command" | "needs" | "live" | "monitor";

const NAV: { view: View; label: string; icon: React.ReactNode }[] = [
  {
    view: "command",
    label: "Command",
    icon: (
      <>
        <rect x="3" y="3" width="8" height="8" rx="2" />
        <rect x="13" y="3" width="8" height="8" rx="2" />
        <rect x="3" y="13" width="8" height="8" rx="2" />
        <rect x="13" y="13" width="8" height="8" rx="2" />
      </>
    ),
  },
  {
    view: "needs",
    label: "Human in the loop",
    icon: (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
  },
  {
    view: "live",
    label: "Agent live view",
    icon: (
      <>
        <circle cx="5" cy="12" r="2" />
        <circle cx="19" cy="5" r="2" />
        <circle cx="19" cy="19" r="2" />
        <path d="M7 12h5l5-7M12 12l5 7" />
      </>
    ),
  },
  { view: "monitor", label: "Quotas", icon: <path d="M4 18V9m5 9V5m5 13v-8m5 8V3" /> },
];

export function App() {
  const [view, setView] = useState<View>("command");
  const [chosen, setChosen] = useState(0);
  const [expand, setExpand] = useState<ExpandState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef(0);

  // Every agent's plan and run come from the server, so the cards, the dialog and the live view agree on where each stands
  const { agents, plans, steering, requests, onError } = useBackend();
  const pending = requests.filter((r) => !r.answer).length;

  const showToast = useCallback((text: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => onError(showToast), [onError, showToast]);

  const go = (v: View) => {
    setExpand(null);
    setView(v);
  };

  const closeExpand = () => setExpand((e) => (e && !e.closing ? { ...e, closing: true } : e));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeExpand();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const mainRef = useRef<HTMLElement>(null);

  return (
    <div id="shell">
      <nav className="rail" aria-label="Main navigation">
        <div className="logo" aria-label="Xenon">
          X
        </div>
        {NAV.map((n) => (
          <button
            key={n.view}
            className={`nav${view === n.view ? " active" : ""}`}
            aria-label={n.label}
            title={n.label}
            onClick={() => go(n.view)}
          >
            <svg viewBox="0 0 24 24">{n.icon}</svg>
            {n.view === "needs" && <span className="num">{pending}</span>}
          </button>
        ))}
        <div className="spacer" />
        <button
          className="nav"
          aria-label="Help"
          title="Help"
          onClick={() => showToast("Tap a card to expand · select Live Run · tap Jarvis · swipe between decisions")}
        >
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1 .9-1.7 1.3-1.7 3.2M12 17h.01" />
          </svg>
        </button>
      </nav>

      <main className="main" ref={mainRef}>
        {/* The stage and the expanded-agent dialog each set their component theme. */}
        <div className="stage dark">
          <Command
            active={view === "command"}
            pending={pending}
            plans={plans}
            onOpenAgent={(i, rect) => {
              setChosen(i);
              setExpand({ index: i, rect, closing: false });
            }}
            onNeeds={() => go("needs")}
          />
          <Live
            active={view === "live"}
            agent={agents[chosen]}
            plans={plans}
            steering={steering}
            onChoose={setChosen}
            onNeeds={() => go("needs")}
            onBack={() => go("command")}
          />
          <Needs active={view === "needs"} toast={showToast} />
          <Monitor active={view === "monitor"} />
        </div>

        <div className={`shade${expand && !expand.closing ? " on" : ""}`} onClick={closeExpand} />
        {expand && (
          <AgentExpander
            state={expand}
            plans={plans}
            host={mainRef}
            onClose={closeExpand}
            onDone={() => setExpand(null)}
            onRun={() => go("live")}
            onRespond={() => go("needs")}
          />
        )}

        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </main>
    </div>
  );
}
