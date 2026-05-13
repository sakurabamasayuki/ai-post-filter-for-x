import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "../../src/styles/global.css";

const rootEl = document.getElementById("root");

function renderFatal(message: string) {
  if (!rootEl) return;

  rootEl.innerHTML = `
    <div style="
      padding:16px;
      min-width:360px;
      min-height:480px;
      box-sizing:border-box;
      background:#0f172a;
      color:#f8fafc;
      font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    ">
      <h2 style="margin:0 0 12px;font-size:16px;">Popup crashed</h2>
      <pre style="
        margin:0;
        white-space:pre-wrap;
        word-break:break-word;
        color:#fca5a5;
        font-size:12px;
        line-height:1.5;
      ">${message}</pre>
    </div>
  `;
}

window.addEventListener("error", (event) => {
  console.error("[popup] window error", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[popup] unhandled rejection", event.reason);
});

if (!rootEl) {
  throw new Error('Popup root element "#root" was not found.');
}

try {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (err) {
  const message =
    err instanceof Error ? err.stack || err.message : String(err);
  console.error("[popup] render failed", err);
  renderFatal(message);
}
