import { ApprovalCard } from "../ui-xenon/approval-card";
import { DecisionTree } from "../ui-xenon/decision-tree";
import { useState } from "react";
import type { HumanRequest } from "../../shared/contract";
import { useBackend } from "../api/backend";
import { decisionTrees } from "./needs-trees";
import { Button } from "../ui/button";
import { SegmentedControl } from "../ui/segmented-control";

type Props = {
  active: boolean;
  toast: (text: string) => void;
};

export function Needs({ active, toast }: Props) {
  const { requests, answer, reopen } = useBackend();
  const [open, setOpen] = useState(0);
  const remaining = requests.filter((r) => !r.answer).length;
  // Requests come and go with the agents, so keep the selection inside the list
  const at = Math.min(open, requests.length - 1);

  const respond = (reply: string) => {
    answer(requests[at].id, reply);
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
            <button key={r.id} className={`request${at === i ? " active" : ""}${r.answer ? " resolved" : ""}`} onClick={() => setOpen(i)}>
              <span className="reqmark" aria-hidden="true">
                {r.answer ? "✓" : "◇"}
              </span>
              <div>
                <h3>{r.name}</h3>
                <p>
                  {r.agent} · {r.answer ? "Resolved" : "Waiting for you"}
                </p>
              </div>
              <span className="reqarrow" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </div>
        {/* keyed so a half-typed answer never leaks into another request */}
        {requests.length === 0 ? (
          <div className="panel review">
            <h2>Nothing needs you</h2>
            <p>No agent is waiting for a decision. When one is blocked on an approval, it shows up here.</p>
          </div>
        ) : (
        <Review
          key={requests[at].id}
          request={requests[at]}
          response={requests[at].answer?.value}
          onRespond={respond}
          onChange={() => reopen(requests[at].id)}
          onDefer={() => setOpen((o) => (o + 1) % requests.length)}
          toast={toast}
        />
        )}
      </div>
    </section>
  );
}

type ReviewProps = {
  request: HumanRequest;
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
            <DecisionTree compact decisions={[decisionTrees.find((t) => t.id === r.tree.id) ?? r.tree]} onResolve={(a) => {
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
