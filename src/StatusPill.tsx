import { STATUS_LABEL, type AgentStatus } from "./data";

export function StatusPill({ status, label }: { status: AgentStatus; label?: string }) {
  return <span className={`status ${status}`}>{label ?? STATUS_LABEL[status]}</span>;
}
