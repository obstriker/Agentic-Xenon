import { useBackend } from "../api/backend";
import { UsageMeter } from "../ui-xenon/usage-meter";
import type { Quota } from "../../shared/contract";

const PROVIDERS = ["Claude", "Codex", "Gemini"] as const;
const STATES = { loading: "Checking", live: "Connected", stale: "Last known usage", unavailable: "Unavailable" };
const WINDOW_COLORS = ["#9dc6f7", "#b6a4f5", "#91ddbd", "#f0bf84"];

function resetLabel(at?: number) {
  if (!at) return "Reset time not reported";
  const minutes = Math.max(0, Math.ceil((at - Date.now()) / 60_000));
  if (!minutes) return "Awaiting reset update";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes % 1440 / 60);
  return `Resets in ${days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`}`;
}

function SubscriptionCard({ provider, rows }: { provider: typeof PROVIDERS[number]; rows: Quota[] }) {
  const first = rows[0];
  const status = first?.status ?? "loading";
  const windows = rows.filter((q) => q.segments.length > 0);
  return (
    <section className="subscription" data-status={status} aria-label={`${provider} subscription`}>
      <UsageMeter
        name={provider}
        plan={first?.sub ?? "Checking subscription…"}
        segments={[]}
        daily={[]}
        windows={windows.map((q, i) => {
          const color = /weekly/i.test(q.window ?? "") ? "#ff716b" : WINDOW_COLORS[i % WINDOW_COLORS.length];
          return { id: q.name, label: q.window ?? "Usage", segments: q.segments.map((s) => ({ ...s, color: q.segments.length === 1 ? color : s.color })), reset: resetLabel(q.resetsAt), daily: q.daily, color };
        })}
        historyLabel={`${provider} recent usage readings · 0 to 100 percent · blue session and red weekly`}
        spend={first?.spend ? { ...first.spend, reset: resetLabel(first.spend.resetsAt) } : undefined}
        emptyMessage={first?.message ?? "Reading your signed-in account…"}
        reset=""
      />
      {first?.details?.map((detail) => <p className="subscriptionNote" key={detail}>{detail}</p>)}
      {status === "stale" && <p className="subscriptionNote" role="status">{first?.message ?? "The usage source has not updated recently."}</p>}
      <footer className="subscriptionFoot">
        {first?.updatedAt ? <span>Updated {new Date(first.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> : <span>No usage received yet</span>}
        <span className="subscriptionState" role="status">{STATES[status]}</span>
      </footer>
    </section>
  );
}

export function Monitor({ active }: { active: boolean }) {
  const { quotas } = useBackend();
  return (
    <section className={`view screen${active ? " active" : ""}`}>
      <div className="screenTop">
        <h1>Subscription usage</h1>
        <small>Claude, Codex &amp; Gemini · checks every minute</small>
      </div>
      <div className="monitor">
        {PROVIDERS.map((provider) => <SubscriptionCard key={provider} provider={provider} rows={quotas.filter((q) => q.provider === provider)} />)}
      </div>
    </section>
  );
}
