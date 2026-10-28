import { useBackend } from "../api/backend";
import { UsageMeter } from "../ui-xenon/usage-meter";

export function Monitor({ active, toast }: { active: boolean; toast: (text: string) => void }) {
  const { quotas } = useBackend();
  return (
    <section className={`view screen${active ? " active" : ""}`}>
      <div className="screenTop">
        <h1>Quotas &amp; capacity</h1>
        <small>Compact provider monitoring · sample data</small>
      </div>
      <div className="monitor">
        {quotas.map((q) => (
          <UsageMeter
            key={q.name}
            name={q.name}
            plan={q.sub}
            segments={q.segments}
            daily={q.daily}
            reset={q.reset}
            actionLabel={q.actionLabel}
            onAction={() => toast(`${q.actionLabel} · demonstration`)}
          />
        ))}
      </div>
    </section>
  );
}
