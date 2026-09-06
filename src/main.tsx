import React from "react";
import ReactDOM from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";
import App from "./App";
import { CloudRoot } from "./cloud/CloudRoot";
import "@xyflow/react/dist/style.css";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ReactFlowProvider>
      <CloudRoot
        renderLocal={(openCloud) => <App onCloud={openCloud} />}
        renderProject={(document, back) => (
          <App
            key={document.id}
            initialProject={document}
            readOnly
            onBack={back}
          />
        )}
      />
    </ReactFlowProvider>
  </React.StrictMode>,
);
