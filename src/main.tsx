import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import StairsPlayground from "./stairs/StairsPlayground";
import "./stairs.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root mount point");
}

createRoot(root).render(
  <StrictMode>
    <StairsPlayground />
  </StrictMode>,
);
