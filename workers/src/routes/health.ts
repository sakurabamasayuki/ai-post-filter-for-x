import { Hono } from "hono";
import type { Bindings } from "../types";

export const healthRoute = new Hono<{ Bindings: Bindings }>();

healthRoute.get("/", (c) => {
  return c.json({
    ok: true,
    service: "ai-post-filter-api",
    timestamp: new Date().toISOString(),
  });
});
