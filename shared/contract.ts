/**
 * The API contract: every shape that crosses the wire, shared by the server and the app.
 * JSON-safe only (no React nodes). Icons in decision trees are looked up by key on the client.
 */

export type AgentStatus = "working" | "waiting" | "done";
export type PlanStatus = "done" | "running" | "waiting" | "failed" | "queued";
export type RunStatus = "running" | "paused" | "done";
export type Risk = "low" | "medium" | "high";

export interface AgentLimits {
  /** USD */
  budget: number;
  context: { used: number; max: number };
  calls: { used: number; max: number };
}

export interface Agent {
  id: string;
  name: string;
  desc: string;
  /** The line shown while the agent works */
  step: string;
  /** Spend so far, USD */
  cost: number;
  /** 0–100 */
  progress: number;
  status: AgentStatus;
  model: string;
  /** The CLI running the agent, e.g. "claude" or "omp" (herdr). Empty when unknown */
  kind?: string;
  /** Plan labels, in order. The live plan is `PlanStep[]` */
  tasks: string[];
  findings: string[];
  /** Not every runtime knows these; the State tab hides the meters without them */
  limits?: AgentLimits;
}

export interface SteerNote {
  id: string;
  text: string;
  /** Set once the agent has picked the note up */
  picked?: "next" | "now";
}

export interface PlanStep {
  id: string;
  label: string;
  status: PlanStatus;
  detail?: string;
  tool?: string;
  /** Finished steps: how long they took, ms */
  duration?: number;
  /** Running steps: ms since epoch */
  startedAt?: number;
  /** Set while the run is paused */
  pausedAt?: number;
  error?: string;
  notes?: SteerNote[];
}

export interface Run {
  agentId: string;
  status: RunStatus;
  startedAt: number;
  pausedAt?: number;
  finishedAt?: number;
}

/** Notes the agent has not picked up yet */
export interface Steering {
  runs: Run[];
  queues: Record<string, SteerNote[]>;
}

export interface Approval {
  risk: Risk;
  preview: { label: string; value: string }[];
}

export interface DecisionChoice { id: string; title: string; detail?: string; flag?: string; agentPick?: boolean; iconKeys?: string[] }
export interface DecisionOption {
  id: string;
  label: string;
  agentPick?: boolean;
  other?: boolean;
  followUp?: { question?: string; choices: DecisionChoice[] };
}
export interface Decision {
  id: string;
  agent: { name: string; model: string };
  risk: Risk;
  question: string;
  details?: string;
  options: DecisionOption[];
}

interface RequestBase {
  id: string;
  name: string;
  /** The asking agent's name */
  agent: string;
  question: string;
  details: string;
  /** Set once answered */
  answer?: { value: string; at: number };
}
export type HumanRequest =
  | (RequestBase & { type: "choice"; options: string[]; approval?: Approval })
  | (RequestBase & { type: "text" })
  | (RequestBase & { type: "tree"; tree: Decision });

export interface Quota {
  name: string;
  sub: string;
  reset: string;
  segments: { label: string; value: number; color: string }[];
  daily: number[];
  actionLabel?: string;
}

export type LedgerAction = "created" | "updated" | "archived" | "sent";
export interface LedgerChange {
  id: string;
  system: string;
  target: string;
  action: LedgerAction;
  before: string;
  after: string;
  at: string;
  dependsOn?: string[];
  irreversible?: boolean;
  undone?: boolean;
}

/* ---------- Requests and responses ---------- */

export type SteerRequest = { text: string; mode: "queue" | "interrupt"; /** Promote a queued note */ queuedId?: string };
export type AnswerRequest = { value: string };
export type PlanUpdate = { steps: PlanStep[] };
export type UndoResult = { undone: string[] };
/** Logical key names as herdr takes them, e.g. "enter", "esc", "ctrl+c" */
export type KeysRequest = { keys: string[] };
export type OutputResponse = { text: string };
export type ApiError = { error: string };

/** Server-sent event on `/api/events`: something changed, refetch that resource */
export interface ChangeEvent {
  topic: "agents" | "plan" | "runs" | "requests" | "quotas" | "ledger";
  agentId?: string;
}

/** Agent ids can hold characters like `:` (herdr pane ids), so they travel URL-encoded */
const enc = encodeURIComponent;

/** Every route, for the client and for docs */
export const routes = {
  agents: "/api/agents",
  plan: (id: string) => `/api/agents/${enc(id)}/plan`,
  steering: "/api/steering",
  steer: (id: string) => `/api/agents/${enc(id)}/steer`,
  note: (id: string, noteId: string) => `/api/agents/${enc(id)}/queue/${noteId}`,
  pause: (id: string) => `/api/agents/${enc(id)}/pause`,
  resume: (id: string) => `/api/agents/${enc(id)}/resume`,
  ledger: (id: string) => `/api/agents/${enc(id)}/ledger`,
  output: (id: string, lines = 80) => `/api/agents/${enc(id)}/output?lines=${lines}`,
  keys: (id: string) => `/api/agents/${enc(id)}/keys`,
  undo: (changeId: string) => `/api/ledger/${changeId}/undo`,
  requests: "/api/requests",
  answer: (id: string) => `/api/requests/${id}/answer`,
  quotas: "/api/quotas",
  events: "/api/events",
} as const;
