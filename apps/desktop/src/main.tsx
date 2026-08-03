import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import type { CompanionBridge } from "./types.js";
import "./styles.css";

const root = document.querySelector("#root");

if (root === null) {
  throw new Error("The desktop application root was not found");
}

async function explicitPreviewBridge(): Promise<CompanionBridge | undefined> {
  const runtimeMode = new URLSearchParams(window.location.search).get("mode");
  if (runtimeMode !== "browser-preview" && runtimeMode !== "automated-test") {
    return undefined;
  }
  if (import.meta.env.VITE_GIELINOR_ENABLE_PREVIEW !== "true") {
    return undefined;
  }
  const fixture = new URLSearchParams(window.location.search).get("fixture") ?? "first-run";
  const { DemoCompanionBridge } = await import("./lib/bridge.js");
  return new DemoCompanionBridge(fixture, runtimeMode);
}

void explicitPreviewBridge().then((bridge) => {
  createRoot(root).render(
    <StrictMode>
      <App {...(bridge === undefined ? {} : { bridge })} />
    </StrictMode>,
  );
});
