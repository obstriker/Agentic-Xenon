import { createRoot } from "react-dom/client";
import { DecisionTree } from "./ui-xenon/decision-tree";

// Standalone preview of the Decision Tree, kept apart from the main app. Open /decisions.html in the dev server.
import { decisionTrees as decisions } from "./views/needs-trees";


createRoot(document.getElementById("root")!).render(<DecisionTree decisions={decisions} onResolve={(a) => console.log("resolved", a.decision.id, a.option.id, a.choice?.id)} />);
