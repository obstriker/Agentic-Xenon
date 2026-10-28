import { ApprovalCard } from "../ui-xenon/approval-card";
import { DecisionTree } from "../ui-xenon/decision-tree";
import { useState, type Dispatch, type SetStateAction } from "react";
import { requests, type Request } from "../data";
import { Button } from "../ui/button";
import { SegmentedControl } from "../ui/segmented-control";

type Props = {
  active: boolean;
  responses: Record<number, string>;
  setResponses: Dispatch<SetStateAction<Record<number, string>>>;
  toast: (text: string) => void;
};

export function Needs({ active, responses, setResponses, toast }: Props) {
  const [open, setOpen] = useState(0);
  const remaining = requests.filter((_, i) => !responses[i]).length;

  const respond = (reply: string) => {
    setResponses((r) => ({ ...r, [open]: reply }));
    toast("Response recorded · demonstration");
  };

  return (
    <section className={`view screen attention${active ? " active" : ""}`}>
      <div className="screenTop">
        <h1>Human in the loop</h1>
        <small>{remaining} pending decisions · select one to respond</small>
      </div>
      <div className="inbox">
        <div className="requests">
          {requests.map((r, i) => (
            <button key={r.name} className={`request${open === i ? " active" : ""}${responses[i] ? " resolved" : ""}`} onClick={() => setOpen(i)}>
              <span className="reqmark" aria-hidden="true">
                {responses[i] ? "✓" : "◇"}
              </span>
              <div>
                <h3>{r.name}</h3>
                <p>
                  {r.agent} · {responses[i] ? "Resolved" : "Waiting for you"}
                </p>
              </div>
              <span className="reqarrow" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </div>
        {/* keyed so a half-typed answer never leaks into another request */}
        <Review
          key={open}
          request={requests[open]}
          response={responses[open]}
          onRespond={respond}
          onChange={() => setResponses(({ [open]: _gone, ...rest }) => rest)}
          onDefer={() => setOpen((o) => (o + 1) % requests.length)}
          toast={toast}
        />
      </div>
    </section>
  );
}

type ReviewProps = {
  request: Request;
  response?: string;
  onRespond: (reply: string) => void;
  onChange: () => void;
  onDefer: () => void;
  toast: (text: string) => void;
};

function Review({ request: r, response, onRespond, onChange, onDefer, toast }: ReviewProps) {
  const [choice, setChoice] = useState<string>();
  const [text, setText] = useState("");

  const send = () => {
    const reply = r.type === "text" ? text.trim() : choice;
    if (!reply) return toast("Choose an option or write a response");
    onRespond(reply);
  };

  if (r.type === "choice" && r.approval) {
    const actions = r.options.map((label, i) => ({
      id: label,
      label,
      tone: label === "Deny" ? ("deny" as const) : ("approve" as const),
      shortcut: label === "Deny" ? "d" : String(i + 1),
    }));
    return (
      <div className="panel review">
        <ApprovalCard
          agent={r.agent}
          question={r.question}
          details={r.details}
          risk={r.approval.risk}
          preview={r.approval.preview}
          actions={actions}
          resolved={response}
          onResolve={(a) => onRespond(a.label)}
          onUndo={onChange}
        />
        {!response && (
          <footer>
            <Button variant="secondary" size="lg" onClick={onDefer}>
              Decide later
            </Button>
          </footer>
        )}
      </div>
    );
  }

  if (r.type === "tree") {
    return (
      <div className="panel review tree">
        {response ? (
          <>
            <span className="eyebrow">AGENT REQUEST · {r.agent.toUpperCase()}</span>
            <h2>{r.question}</h2>
            <div className="recorded" role="status">
              <span aria-hidden="true">✓</span> Response recorded: {response}
            </div>
            <footer>
              <Button variant="secondary" size="lg" onClick={onChange}>
                Change response
              </Button>
            </footer>
          </>
        ) : (
          <>
            <DecisionTree compact decisions={[r.tree]} onResolve={(a) => {
                const reply = a.choice ? `${a.option.label} → ${a.choice.title}` : a.option.label;
                // let the tree show "Approved · running" before the panel switches to the recorded line
                setTimeout(() => onRespond(reply), 1100);
              }} />
            <footer>
              <Button variant="secondary" size="lg" onClick={onDefer}>
                Decide later
              </Button>
            </footer>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="panel review">
      <span className="eyebrow">AGENT REQUEST · {r.agent.toUpperCase()}</span>
      <h2>{r.question}</h2>
      <p>{r.details}</p>
      {response ? (
        <div className="recorded" role="status">
          <span aria-hidden="true">✓</span> Response recorded: {response}
        </div>
      ) : r.type === "choice" ? (
        <SegmentedControl aria-label="Your answer" size="lg" fullWidth options={r.options.map((o) => ({ value: o, label: o }))} value={choice ?? ""} onChange={setChoice} />
      ) : (
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a short direction to the agent…" aria-label="Your reply" />
      )}
      <footer>
        {response ? (
          <Button variant="secondary" size="lg" onClick={onChange}>
            Change response
          </Button>
        ) : (
          <>
            <Button variant="secondary" size="lg" onClick={onDefer}>
              Decide later
            </Button>
            <Button size="lg" onClick={send} iconRight={<span aria-hidden="true">→</span>}>
              Send to agent
            </Button>
          </>
        )}
      </footer>
    </div>
  );
}
