// entrypoints/options/main.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "../../src/styles/global.css"; // グローバル CSS を読み込む

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("root element not found");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
