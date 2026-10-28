import { createRoot } from "react-dom/client";
import { DecisionTree, Icons, type Decision } from "./ui-xenon/decision-tree";

// Standalone preview of the Decision Tree, kept apart from the main app. Open /decisions.html in the dev server.
const decisions: Decision[] = [
  {
    id: "incident",
    agent: { name: "Incident agent", model: "Opus 5.5" },
    risk: "high",
    question: "Checkout errors jumped to 18% after deploy #482 – what should I do?",
    details: "2,140 errors in 12 minutes · about $3.2k in orders an hour at risk.",
    options: [
      {
        id: "rollback",
        label: "Roll back to #481",
        icon: <Icons.vercel />,
        agentPick: true,
        followUp: {
          question: "Tell customers about it?",
          choices: [
            { id: "status", title: "Post on the status page", detail: "Public · updates every 15 min", icons: [<Icons.status />, <Icons.slack />], agentPick: true },
            { id: "team", title: "Only tell the team", detail: "#incidents only · nothing public", icons: [<Icons.slack />] },
          ],
        },
      },
      {
        id: "hotfix",
        label: "Ship a hotfix",
        icon: <Icons.github />,
        followUp: {
          question: "Wait for the test run?",
          choices: [
            { id: "now", title: "Ship right away", flag: "Skips 1,284 tests", icons: [<Icons.github />, <Icons.vercel />] },
            { id: "after", title: "After the tests", detail: "14 min · errors keep coming", icons: [<Icons.github />] },
          ],
        },
      },
      {
        id: "flag",
        label: "Turn the flag off",
        icon: <Icons.flag />,
        followUp: { choices: [{ id: "off", title: "New checkout off for 30%", detail: "The old one takes over", icons: [<Icons.flag />, <Icons.sentry />] }] },
      },
      { id: "other", label: "Other...", other: true },
    ],
  },
  {
    id: "renewal",
    agent: { name: "Sales agent", model: "GPT-6 Sol" },
    risk: "medium",
    question: "Acme wants 25% off their $84k renewal or they'll switch – how should I respond?",
    details: "Renewal in 9 days · 212 seats · they asked twice on yesterday's call.",
    options: [
      {
        id: "offer15",
        label: "Offer 15% instead",
        icon: <Icons.stripe />,
        agentPick: true,
        followUp: {
          question: "Tie it to a longer contract?",
          choices: [
            { id: "two", title: "Only with 2 years", detail: "$71.4k a year until 2028", icons: [<Icons.stripe />], agentPick: true },
            { id: "one", title: "For one year", detail: "$71.4k renews at full price", icons: [<Icons.stripe />] },
          ],
        },
      },
      {
        id: "vp",
        label: "Ask the VP",
        icon: <Icons.slack />,
        followUp: {
          question: "What should I send along?",
          choices: [
            { id: "notes", title: "The call notes", detail: "Summary of yesterday's call", icons: [<Icons.slack />] },
            { id: "margin", title: "Usage and margin", flag: "Margin drops to 41%", icons: [<Icons.stripe />] },
          ],
        },
      },
      {
        id: "accept",
        label: "Accept 25%",
        icon: <Icons.stripe />,
        followUp: { choices: [{ id: "signoff", title: "$63k a year · needs sign-off", icons: [<Icons.stripe />] }] },
      },
      { id: "other", label: "Other...", other: true },
    ],
  },
];

createRoot(document.getElementById("root")!).render(<DecisionTree decisions={decisions} onResolve={(a) => console.log("resolved", a.decision.id, a.option.id, a.choice?.id)} />);
