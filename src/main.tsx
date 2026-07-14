import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import InteractiveModel from "./InteractiveModel";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root mount point");
}

createRoot(root).render(
  <StrictMode>
    <InteractiveModel />
  </StrictMode>,
);
