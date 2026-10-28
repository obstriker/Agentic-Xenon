import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AgentSteering, type AgentSteeringProps, type SteerNote, type SteerStep } from "./ui-xenon/agent-steering";
import { VARIANTS, pageStyle, pillStyle, type Variant } from "./preview-config";

// Standalone preview of the Agent Steering card. Every card is fully live: pause, resume, queue, "Now", remove, and the run
// advances when you press "Finish this step" so queued notes get picked up. Open /steering.html in the dev server.
const titles = ["Read schema and 14 migrations", "Plan the split into accounts and profiles", "Write migration 0042_split_users", "Dry run on staging", "Open a pull request for review"];
const durations = [1400, 4600, 5200, 2600, 1800];
let ids = 0;

const initial = (done: number, notes: Record<number, SteerNote[]> = {}): SteerStep[] => {
  const t = Date.now();
  return titles.map((title, i) => ({
    id: `s${i}`,
    title,
    status: i < done ? "done" : i === done && done < titles.length ? "active" : "pending",
    duration: i < done ? durations[i] : undefined,
    startedAt: i === done && done < titles.length ? t : undefined,
    notes: notes[i],
  }));
};

function Demo({ extra, done = 1, notes, queue: q0 = [], startedAgo = 128000, paused = false, finished = false }: { extra?: Partial<AgentSteeringProps>; done?: number; notes?: Record<number, SteerNote[]>; queue?: SteerNote[]; startedAgo?: number; paused?: boolean; finished?: boolean }) {
  const [steps, setSteps] = useState(() => initial(finished ? titles.length : done, notes));
  const [queue, setQueue] = useState<SteerNote[]>(q0);
  const [status, setStatus] = useState<"running" | "paused" | "done">(finished ? "done" : paused ? "paused" : "running");
  const [startedAt] = useState(() => Date.now() - startedAgo);
  const [finishedAt, setFinishedAt] = useState<number | undefined>(finished ? Date.now() : undefined);
  const live = useRef({ steps, queue, status });
  live.current = { steps, queue, status };

  // "Finish this step" moves the run on; notes queued for the next step land on it when it starts
  const advance = () => {
    const { steps, queue, status } = live.current;
    if (status !== "running") return;
    const i = steps.findIndex((s) => s.status === "active");
    if (i < 0) return;
    const now = Date.now();
    setSteps(
      steps.map((s, k) => {
        if (k === i) return { ...s, status: "done" as const, duration: now - (s.startedAt ?? now) };
        if (k === i + 1) return { ...s, status: "active" as const, startedAt: now, notes: [...(s.notes ?? []), ...queue.map((n) => ({ ...n, picked: "next" as const }))] };
        return s;
      }),
    );
    if (i < steps.length - 1) setQueue([]);
    else {
      setStatus("done");
      setFinishedAt(now);
    }
  };

  const interrupt = (text: string, queuedId?: string) => {
    if (queuedId) setQueue((q) => q.filter((n) => n.id !== queuedId));
    setSteps((ss) => ss.map((s) => (s.status === "active" ? { ...s, notes: [...(s.notes ?? []), { id: `n${++ids}`, text, picked: "now" as const }] } : s)));
  };

  return (
    <>
    <AgentSteering
      {...extra}
      title="Migrate users table"
      agent="Opus 5.5"
      status={status}
      startedAt={startedAt}
      finishedAt={finishedAt}
      steps={steps}
      queue={queue}
      onQueue={(text) => setQueue((q) => [...q, { id: `q${++ids}`, text }])}
      onInterrupt={interrupt}
      onRemove={(id) => setQueue((q) => q.filter((n) => n.id !== id))}
      onPause={() => setStatus("paused")}
      onResume={() => setStatus("running")}
    />
    {status !== "done" && (
      <button type="button" className="demo-advance" onClick={advance} disabled={status !== "running"}>
        Finish this step →
      </button>
    )}
    </>
  );
}

const LIGHT = { "--as-bg": "#ffffff", "--as-border": "#dcdde3", "--as-text": "#15161a", "--as-text-muted": "#6b6e78", "--as-faint": "#8a8d97", "--as-accent": "#4a5fe0", "--as-ok": "#1f9d63", "--as-check-bg": "#4a5fe0", "--as-note-bg": "#f3f4f8", "--as-note-border": "#e1e3ea", "--as-input-bg": "#f3f4f8", "--as-btn": "#d8dae2", "--as-btn-hover": "#c8cbd6", "--as-strong": "#000000", "--as-soft": "#4a4d57", "--as-line": "#cfd1da", "--as-empty": "#b9bcc6", "--as-clock": "#8a8d97", "--as-step-text": "#3b3e48", "--as-note-text": "#1b1d22", "--as-shimmer-lo": "#8a8d97", "--as-spin-track": "#d7dbf5", "--as-count-bg": "#e6e8ef", "--as-input-border": "#d5d7df", "--as-border-disabled": "#e1e3ea", "--as-field-disabled": "rgba(243,244,248,.6)", "--as-focus": "#4a5fe0", "--as-hover": "rgba(0,0,0,.05)", "--as-halo": "rgba(74,95,224,.15)", "--as-halo-warn": "rgba(200,140,40,.18)", "--as-kbd-text": "#6b6e78", "--as-send-icon": "#5a5d68", "--as-send-on-bg": "#15161a", "--as-send-on-icon": "#ffffff" } as React.CSSProperties;

const SPANISH: Partial<AgentSteeringProps> = {
  placeholder: "Guía al agente…",
  labels: { stepOf: (i, n) => `Paso ${i} de ${n}`, steps: (n) => `${n} ${n === 1 ? "paso" : "pasos"}`, running: "En marcha", paused: "En pausa", done: "Hecho", doneIn: (c) => `Hecho en ${c}`, pause: "Pausar", resume: "Reanudar", plan: "Plan", queued: "En cola para el siguiente paso", queueLeft: "Quedaron en la cola", now: "Ahora", interruptWith: (t) => `Interrumpir ahora con “${t}”`, remove: (t) => `Quitar “${t}”`, steer: "Guía al agente", finished: "La ejecución ha terminado", queueAction: "Poner en cola para el siguiente paso", hintNext: "siguiente paso", hintInterrupt: "interrumpir ahora", unused: "Las notas que seguían en la cola no se usaron", pickedUp: "Recibida", interrupted: "Interrumpió", announce: (t) => `El agente recibió la nota: ${t}` },
};

const extraFor = (v: Variant): Partial<AgentSteeringProps> => (v === "light" ? { style: LIGHT } : v === "spanish" ? SPANISH : {});

const Label = ({ children }: { children: string }) => <h3 style={{ margin: "0 0 10px", fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase", color: "#8f8f98", fontWeight: 600 }}>{children}</h3>;
const Cell = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <Label>{label}</Label>
    {children}
  </div>
);

function Page() {
  const [variant, setVariant] = useState<Variant>("default");
  const extra = extraFor(variant);
  return (
    <div style={pageStyle(variant, "#0b1220")}>
    <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
      {VARIANTS.map((v) => (
        <button key={v.id} style={pillStyle(variant === v.id)} onClick={() => setVariant(v.id)}>
          {v.label}
        </button>
      ))}
    </div>
    <div key={variant} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))", gap: 36, alignItems: "start", maxWidth: 1500 }}>
      <Cell label="Running · type a note, Enter queues it, Ctrl+Enter interrupts">
        <Demo extra={extra} />
      </Cell>
      <Cell label="Note queued · click Now to interrupt, × to remove">
        <Demo extra={extra} queue={[{ id: "q0", text: "Use Postgres 16 syntax – prod isn't on 17 yet" }]} startedAgo={130000} />
      </Cell>
      <Cell label="Notes picked up and interrupted">
        <Demo extra={extra} done={2} startedAgo={138000} notes={{ 2: [{ id: "n1", text: "Use Postgres 16 syntax – prod isn't on 17 yet", picked: "next" }, { id: "n2", text: "Keep the old users view for a week", picked: "now" }] }} />
      </Cell>
      <Cell label="Paused · press play to resume">
        <Demo extra={extra} done={3} paused startedAgo={150000} />
      </Cell>
      <Cell label="Finished">
        <Demo extra={extra} finished startedAgo={140000} />
      </Cell>
    </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Page />);
