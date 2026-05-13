import type { Context, MiddlewareHandler } from "hono";
import type { Bindings } from "../types";

/**
 * 拡張機能 ID 限定の CORS ミドルウェア。
 * Chrome 拡張からのリクエストのみを許可
 */
export const extensionOnlyCors = (): MiddlewareHandler<{
  Bindings: Bindings;
}> => {
  return async (c: Context<{ Bindings: Bindings }>, next) => {
    const origin = c.req.header("Origin") ?? "";
    
    // ⭐ あなたの拡張機能 ID を直接設定
    const EXTENSION_ID = "fhjejcelpgodkmofkpgghonalepmdpld";
    const allowed = `chrome-extension://${EXTENSION_ID}`;
    const isAllowed = origin === allowed;

    // OPTIONS リクエスト（プリフライト）の処理
    if (c.req.method === "OPTIONS") {
      if (!isAllowed) {
        return c.text("Forbidden", 403);
      }
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        },
      });
    }

    // webhook 系は Origin チェック不要 (別の署名検証あり)
    const path = new URL(c.req.url).pathname;
    if (path.startsWith("/api/webhook") || path === "/api/health") {
      await next();
      return;
    }

    // それ以外は拡張機能からのリクエストのみ許可
    if (!isAllowed) {
      return c.json({ error: "forbidden_origin" }, 403);
    }

    await next();
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");
  };
};