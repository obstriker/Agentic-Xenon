import { createRoot } from "react-dom/client";
import { App } from "./App";
import { BackendProvider } from "./api/backend";
import { ApiProvider } from "./api/hooks";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <ApiProvider>
    <BackendProvider>
      <App />
    </BackendProvider>
  </ApiProvider>,
);
