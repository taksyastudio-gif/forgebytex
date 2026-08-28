import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { loader } from "@monaco-editor/react";
import "./index.css";
import App from "./App";

// Monaco is copied into public/monaco so the editor never depends on a CDN.
loader.config({
  paths: {
    vs: "/monaco/vs",
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
