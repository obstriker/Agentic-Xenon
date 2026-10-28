import type { Decision } from "./ui-xenon/decision-tree";
import { decisionTrees } from "./views/needs-trees";
import type { LedgerChange } from "./ui-xenon/agent-ledger";

export type AgentStatus = "working" | "waiting" | "done";

export type Agent = {
  name: string;
  desc: string;
  step: string;
  cost: number;
  progress: number;
  status: AgentStatus;
  tasks: string[];
  findings: string[];
};

export const STATUS_LABEL: Record<AgentStatus, string> = {
  working: "IN PROGRESS",
  waiting: "NEEDS YOU",
  done: "COMPLETE",
};

export const agents: Agent[] = [
  {
    name: "Market landscape",
    desc: "Mapping competitors and emerging product shifts",
    step: "Cross-checking pricing models",
    cost: 3.84,
    progress: 62,
    status: "working",
    tasks: ["Scope research questions", "Collect competitor materials", "Verify pricing and market segments", "Synthesize opportunity landscape"],
    findings: [
      "Three competitors are introducing usage-based pricing",
      "Mid-market demand is shifting toward bundled workflows",
      "Enterprise procurement remains the biggest friction point",
    ],
  },
  {
    name: "Protocol research",
    desc: "Evaluating implementation patterns and security assumptions",
    step: "Testing protocol assumptions",
    cost: 2.17,
    progress: 43,
    status: "working",
    tasks: ["Collect protocol documentation", "Compare implementation patterns", "Investigate security assumptions", "Publish technical assessment"],
    findings: ["Handshake compatibility varies by implementation", "Two specifications disagree on timeout behavior"],
  },
  {
    name: "Dataset synthesis",
    desc: "Comparing public datasets and source reliability",
    step: "Waiting for dataset permission",
    cost: 1.62,
    progress: 55,
    status: "waiting",
    tasks: ["Find candidate data sources", "Rate source reliability", "Request gated dataset", "Build synthesis"],
    findings: ["Seven candidate datasets identified", "Two datasets require additional permission"],
  },
  {
    name: "Literature review",
    desc: "Extracting evidence across academic and industry publications",
    step: "Grouping evidence clusters",
    cost: 5.31,
    progress: 78,
    status: "working",
    tasks: ["Search publications", "Screen relevance", "Extract key evidence", "Draft cited review"],
    findings: ["Consistent support for the primary hypothesis", "Source quality varies across three study groups"],
  },
  {
    name: "Risk assessment",
    desc: "Identifying unresolved assumptions and potential failure modes",
    step: "Waiting for risk tolerance",
    cost: 0.98,
    progress: 35,
    status: "waiting",
    tasks: ["Catalogue assumptions", "Estimate impact", "Ask for risk tolerance", "Prioritize mitigations"],
    findings: ["Two risks need a human policy decision", "The primary dependency has no fallback"],
  },
  {
    name: "Executive briefing",
    desc: "Turning research findings into a decision-ready summary",
    step: "Drafting key takeaways",
    cost: 1.48,
    progress: 82,
    status: "working",
    tasks: ["Collect source findings", "Draft executive summary", "Check all citations", "Prepare deliverable"],
    findings: ["Five themes have emerged across the research"],
  },
];

export const usd = { style: "currency", currency: "USD" } as const;

/* ---------- Human in the loop ---------- */

export type Approval = { risk: "low" | "medium" | "high"; preview: { label: string; value: string }[] };

export type Request =
  | { name: string; agent: string; question: string; details: string; type: "choice"; options: string[]; approval?: Approval }
  | { name: string; agent: string; question: string; details: string; type: "text" }
  | { name: string; agent: string; question: string; details: string; type: "tree"; tree: Decision };

export const requests: Request[] = [
  {
    name: "Dataset access",
    agent: "Dataset synthesis",
    question: "May I read the licensed benchmark dataset for this research?",
    details: "Access is limited to read-only retrieval. No data will be published or shared outside this workspace.",
    type: "choice",
    options: ["Allow once", "Allow for this mission", "Deny"],
    approval: {
      risk: "medium",
      preview: [
        { label: "Dataset", value: "Licensed benchmark dataset" },
        { label: "Access", value: "Read-only retrieval" },
        { label: "Shared outside workspace", value: "No" },
      ],
    },
  },
  {
    name: "Research direction",
    agent: "Risk assessment",
    question: "Which risk profile should the analysis optimize for?",
    details: "This determines the weighting of candidate failure modes and mitigation proposals.",
    type: "choice",
    options: ["Conservative", "Balanced", "Exploratory"],
  },
  {
    name: "Clarify scope",
    agent: "Market landscape",
    question: "Which geographic market should I prioritize?",
    details: "You can write a specific region or customer segment. The agent will apply it to the remaining research.",
    type: "text",
  },
  {
    name: "Incident response",
    agent: "Incident agent",
    question: decisionTrees[0].question,
    details: decisionTrees[0].details ?? "",
    type: "tree",
    tree: decisionTrees[0],
  },
  {
    name: "Renewal offer",
    agent: "Sales agent",
    question: decisionTrees[1].question,
    details: decisionTrees[1].details ?? "",
    type: "tree",
    tree: decisionTrees[1],
  },
];

/* ---------- Quotas ---------- */

export type Quota = {
  name: string;
  sub: string;
  reset: string;
  segments: { label: string; value: number; color: string }[];
  daily: number[];
  actionLabel?: string;
};

export const quotas: Quota[] = [
  {
    name: "Claude",
    sub: "Team subscription",
    reset: "Reset in 2h 18m",
    segments: [
      { label: "Research", value: 38, color: "#9dc6f7" },
      { label: "Briefings", value: 21, color: "#6fa3de" },
      { label: "Other", value: 14, color: "#4a78ac" },
    ],
    daily: [40, 52, 47, 61, 58, 66, 73],
  },
  {
    name: "Codex",
    sub: "Usage allowance",
    reset: "Reset in 4h 05m",
    segments: [
      { label: "Code", value: 52, color: "#f0bf84" },
      { label: "Review", value: 27, color: "#d99a55" },
      { label: "Other", value: 12, color: "#a8723c" },
    ],
    daily: [55, 62, 70, 74, 81, 86, 91],
    actionLabel: "Shift load to Gemini",
  },
  {
    name: "Gemini",
    sub: "Daily quota",
    reset: "Reset in 17h 41m",
    segments: [
      { label: "Search", value: 17, color: "#91ddbd" },
      { label: "Other", value: 10, color: "#5fb592" },
    ],
    daily: [20, 18, 25, 22, 30, 24, 27],
  },
];

/* ---------- Agent network ---------- */

export const graphTools = [
  { id: "web", label: "Web search" },
  { id: "docs", label: "Documents" },
  { id: "data", label: "Datasets" },
  { id: "cite", label: "Citations" },
  { id: "code", label: "Code sandbox" },
];

/** [agent index, tool id, how busy the link is] – sample traffic */
const traffic: [number, string, number][] = [
  [0, "web", 0.8], [0, "docs", 0.4], [1, "docs", 0.6], [1, "code", 0.5], [2, "data", 0.2],
  [3, "web", 0.5], [3, "cite", 0.9], [4, "docs", 0.1], [5, "cite", 0.4], [5, "docs", 0.3],
];
export const graphLinks = traffic.map(([i, tool, load]) => ({ agent: agents[i].name, tool, load }));

/** Tasks finished so far: one per 25% of progress. The task at this index is the one running. */
export const doneTasks = (a: Agent) => Math.floor(a.progress / 25);

/** What each task does and which tool it calls – shown on the plan */
export const taskMeta: Record<string, { detail: string; tool: string }> = {
  "Scope research questions": { detail: "Define what to compare and why", tool: "scope.plan" },
  "Collect competitor materials": { detail: "Pricing pages, filings and announcements", tool: "web.search" },
  "Verify pricing and market segments": { detail: "Cross-check prices against two sources", tool: "sheets.compare" },
  "Synthesize opportunity landscape": { detail: "One-page map of gaps and openings", tool: "docs.write" },
  "Collect protocol documentation": { detail: "Specs, RFCs and vendor notes", tool: "web.fetch" },
  "Compare implementation patterns": { detail: "Handshake, retries and timeouts", tool: "code.analyze" },
  "Investigate security assumptions": { detail: "Threat model against each pattern", tool: "sandbox.run" },
  "Publish technical assessment": { detail: "Findings with open questions", tool: "docs.write" },
  "Find candidate data sources": { detail: "Public and licensed datasets", tool: "web.search" },
  "Rate source reliability": { detail: "Provenance, freshness and coverage", tool: "score.sources" },
  "Request gated dataset": { detail: "Needs your approval to read", tool: "data.request" },
  "Build synthesis": { detail: "Merge sources into one table", tool: "data.merge" },
  "Search publications": { detail: "Academic and industry papers", tool: "scholar.search" },
  "Screen relevance": { detail: "Keep papers that match the question", tool: "screen.filter" },
  "Extract key evidence": { detail: "Claims, sample sizes and effects", tool: "pdf.extract" },
  "Draft cited review": { detail: "Every claim linked to its source", tool: "docs.write" },
  "Catalogue assumptions": { detail: "List what the plan relies on", tool: "notes.collect" },
  "Estimate impact": { detail: "Likelihood and cost per assumption", tool: "model.estimate" },
  "Ask for risk tolerance": { detail: "Needs your policy decision", tool: "human.ask" },
  "Prioritize mitigations": { detail: "Rank fixes by impact", tool: "docs.write" },
  "Collect source findings": { detail: "Pull results from all agents", tool: "findings.read" },
  "Draft executive summary": { detail: "One page, decisions first", tool: "docs.write" },
  "Check all citations": { detail: "Every figure traced to a source", tool: "citations.verify" },
  "Prepare deliverable": { detail: "Export the final briefing", tool: "slides.create" },
};

/* ---------- Ledger: what each agent changed in your systems (sample data) ---------- */

export const ledgerSeed: Record<string, LedgerChange[]> = {
  "Market landscape": [
    { id: "a1", system: "Google Sheets", target: "Competitor pricing", action: "created", before: "—", after: "New sheet · 12 rows", at: "9m ago" },
    { id: "a2", system: "Google Sheets", target: "Competitor pricing › Plans", action: "updated", before: "3 plans", after: "5 plans, 2 usage-based", at: "6m ago", dependsOn: ["a1"] },
    { id: "a3", system: "Slack", target: "#research", action: "sent", before: "—", after: "Posted the pricing recap", at: "4m ago", dependsOn: ["a2"], irreversible: true },
    { id: "a4", system: "Notion", target: "Q2 pricing notes", action: "archived", before: "Active page", after: "Archived", at: "3m ago" },
  ],
  "Protocol research": [
    { id: "b1", system: "GitHub", target: "protocol-notes/handshake.md", action: "created", before: "—", after: "New file · 84 lines", at: "12m ago" },
    { id: "b2", system: "GitHub", target: "protocol-notes/handshake.md", action: "updated", before: "84 lines", after: "112 lines, timeout table added", at: "8m ago", dependsOn: ["b1"] },
    { id: "b3", system: "Linear", target: "SEC-142 · Timeout mismatch", action: "created", before: "—", after: "Ticket opened, unassigned", at: "5m ago", dependsOn: ["b2"] },
  ],
  "Dataset synthesis": [
    { id: "c1", system: "Google Drive", target: "Datasets/candidates.csv", action: "created", before: "—", after: "New file · 7 rows", at: "11m ago" },
    { id: "c2", system: "Google Drive", target: "Datasets/candidates.csv", action: "updated", before: "7 rows", after: "7 rows + reliability score", at: "7m ago", dependsOn: ["c1"] },
  ],
  "Literature review": [
    { id: "d1", system: "Zotero", target: "Review library", action: "updated", before: "0 items", after: "38 items", at: "14m ago" },
    { id: "d2", system: "Zotero", target: "Review library › Screened", action: "updated", before: "38 items", after: "21 kept, 17 dropped", at: "9m ago", dependsOn: ["d1"] },
    { id: "d3", system: "Google Docs", target: "Draft review", action: "created", before: "—", after: "Outline · 4 sections", at: "4m ago", dependsOn: ["d2"] },
  ],
  "Risk assessment": [
    { id: "e1", system: "Notion", target: "Assumptions register", action: "created", before: "—", after: "14 assumptions", at: "10m ago" },
    { id: "e2", system: "Notion", target: "Assumptions register", action: "updated", before: "14 assumptions", after: "14 assumptions, impact scored", at: "5m ago", dependsOn: ["e1"] },
  ],
  "Executive briefing": [
    { id: "f1", system: "Google Docs", target: "Executive summary", action: "created", before: "—", after: "1-page draft", at: "13m ago" },
    { id: "f2", system: "Google Docs", target: "Executive summary", action: "updated", before: "1-page draft", after: "Citations linked", at: "7m ago", dependsOn: ["f1"] },
    { id: "f3", system: "Email", target: "Leadership list", action: "sent", before: "—", after: "Summary sent to 6 people", at: "2m ago", dependsOn: ["f2"], irreversible: true },
  ],
};

/* ---------- Limits per agent (sample data) ---------- */

export type AgentLimits = { budget: number; context: { used: number; max: number }; calls: { used: number; max: number } };

/** Sample caps and usage at page load; tokens and calls grow as steps finish */
export const agentLimits: Record<string, AgentLimits> = {
  "Market landscape": { budget: 6, context: { used: 98_000, max: 128_000 }, calls: { used: 142, max: 200 } },
  "Protocol research": { budget: 6, context: { used: 54_000, max: 128_000 }, calls: { used: 96, max: 200 } },
  "Dataset synthesis": { budget: 4, context: { used: 38_000, max: 128_000 }, calls: { used: 61, max: 200 } },
  "Literature review": { budget: 6, context: { used: 121_000, max: 128_000 }, calls: { used: 177, max: 200 } },
  "Risk assessment": { budget: 4, context: { used: 22_000, max: 128_000 }, calls: { used: 30, max: 200 } },
  "Executive briefing": { budget: 3, context: { used: 61_000, max: 128_000 }, calls: { used: 88, max: 200 } },
};

/* ---------- Team: who delegated what to whom (sample data) ---------- */

export const coordinator = { name: "Jarvis", model: "Opus 5.5", task: "Plans the missions and hands work to the research agents", tools: ["Web search", "Documents"], cost: 0.42 };

export const agentModels: Record<string, string> = {
  "Market landscape": "Sonnet 5.5",
  "Protocol research": "GPT-6 Sol",
  "Dataset synthesis": "Gemini 3.8 Pro",
  "Literature review": "Sonnet 5.5",
  "Risk assessment": "Opus 5.5",
  "Executive briefing": "Sonnet 5.5",
};

export type SubAgent = { name: string; model: string; task: string; tools: string[]; status: "running" | "waiting" | "done" | "queued"; cost: number; ask?: string };

/** Sub-agents an agent handed work to. Their state follows the agent: a finished run finishes them, a paused one pauses them. */
export const subAgents: Record<string, SubAgent[]> = {
  "Market landscape": [
    { name: "Scraper", model: "Gemini 3.8 Flash", task: "Read the pricing pages of five competitors", tools: ["Web search"], status: "running", cost: 0.21 },
    { name: "Analyst", model: "Sonnet 5.5", task: "Summarize 120 reviews that mention price", tools: ["Documents"], status: "running", cost: 0.34 },
  ],
  "Protocol research": [
    { name: "Spec reader", model: "GPT-6 Mini", task: "Compare the timeout rules in both specifications", tools: ["Documents"], status: "done", cost: 0.12 },
    { name: "Tester", model: "GPT-6 Mini", task: "Run the handshake against three implementations", tools: ["Code sandbox"], status: "running", cost: 0.09 },
  ],
  "Dataset synthesis": [
    { name: "Source rater", model: "Gemini 3.8 Flash", task: "Rate the seven candidate datasets for reliability", tools: ["Datasets", "Citations"], status: "done", cost: 0.18 },
    { name: "Access requester", model: "Gemini 3.8 Flash", task: "Ask the provider for the gated dataset", tools: ["Datasets"], status: "waiting", cost: 0.03, ask: "Needs your permission to request the gated dataset" },
  ],
  "Literature review": [
    { name: "Screener", model: "Sonnet 5.5", task: "Screen 340 publications for relevance", tools: ["Web search"], status: "done", cost: 0.4 },
    { name: "Extractor", model: "Sonnet 5.5", task: "Pull the key evidence from the 48 that remain", tools: ["Documents", "Citations"], status: "running", cost: 0.55 },
  ],
  "Risk assessment": [{ name: "Impact estimator", model: "Sonnet 5.5", task: "Estimate the impact of each open assumption", tools: ["Documents"], status: "queued", cost: 0 }],
  "Executive briefing": [{ name: "Citation checker", model: "Gemini 3.8 Flash", task: "Check every citation in the summary", tools: ["Citations"], status: "running", cost: 0.11 }],
};
