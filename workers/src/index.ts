import { Hono } from "hono";
import type { Bindings } from "./types";
import { extensionOnlyCors } from "./lib/cors";

import { detectRoute } from "./routes/detect";
import { licenseRoute } from "./routes/license";
import { webhookRoute } from "./routes/webhook";

const app = new Hono<{ Bindings: Bindings }>();

// CORS (拡張機能 ID 限定。webhook / health はバイパス)
app.use("*", extensionOnlyCors());

// ルーティング
app.route("/api/detect", detectRoute);
app.route("/api/license", licenseRoute);
app.route("/api/webhook", webhookRoute);
app.get("/api/health", (c) =>
  c.json({
    status: "ok",
    service: "ai-post-filter-api",
    timestamp: new Date().toISOString(),
  })
);

// 404
app.notFound((c) => c.json({ error: "not_found" }, 404));

// 5xx
app.onError((err, c) => {
  console.error("unhandled_error", {
    message: err.message,
    path: new URL(c.req.url).pathname,
  });
  return c.json({ error: "internal_error" }, 500);
});

export default app;
