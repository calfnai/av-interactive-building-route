import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import FPSResonanceProbe from "./FPSResonanceProbe";
import InteractiveModel from "./InteractiveModel";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root mount point");
}

const probe = new URLSearchParams(window.location.search).get("probe");

createRoot(root).render(
  <StrictMode>
    {probe === "fps-resonance" ? <FPSResonanceProbe /> : <InteractiveModel />}
  </StrictMode>,
);
