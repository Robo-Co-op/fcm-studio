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
        renderProject={(document, controls) => (
          <App
            key={document.id}
            initialProject={document}
            readOnly={controls.readOnly}
            sharedRole={controls.role}
            onBack={controls.onBack}
            onProjectChange={controls.onChange}
            cloudStatus={controls.status}
            onCloudUndo={controls.onUndo}
            canCloudUndo={controls.canUndo}
            onSaveBaseline={controls.onSaveBaseline}
            onSaveScenario={controls.onSaveScenario}
            onSaveRun={controls.onSaveRun}
          />
        )}
      />
    </ReactFlowProvider>
  </React.StrictMode>,
);
