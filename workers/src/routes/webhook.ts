import { Hono } from "hono";
import type { Bindings } from "../types";
import { kvPutJson, kvDelete, kvGetJson } from "../lib/cache";
import {
  normalizeWebhookPayload,
  verifyWebhookSignature,
  actionFromEvent,
  buildLicenseInfo,
  type LsWebhookPayload,
} from "../lib/lemonsqueezy-webhook";

export const webhookRoute = new Hono<{ Bindings: Bindings }>();

webhookRoute.post("/lemonsqueezy", async (c) => {
  // 1. 署名検証
  const signature = c.req.header("x-signature") ?? "";
  if (!signature) {
    return c.json({ error: "missing_signature" }, 401);
  }

  const rawBody = await c.req.text();

  const ok = await verifyWebhookSignature(
    c.env.LEMONSQUEEZY_WEBHOOK_SECRET,
    rawBody,
    signature
  );
  if (!ok) {
    console.warn("webhook_invalid_signature");
    return c.json({ error: "invalid_signature" }, 401);
  }

  // 2. JSON パース
  let payload: LsWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as LsWebhookPayload;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  // 3. 正規化
  const event = normalizeWebhookPayload(payload);

  if (!event.eventName) {
    return c.json({ ok: true, skipped: "no_event_name" });
  }

  if (!event.licenseKey) {
    console.log("webhook_no_license_key", { eventName: event.eventName });
    return c.json({ ok: true, skipped: "no_license_key" });
  }

  // 4. 重複処理防止(idempotency): event_id をキーに 24h ロック
  const eventId = payload.data?.id ?? "";
  if (eventId) {
    const dedupeKey = `webhook:processed:${eventId}`;
    const processed = await kvGetJson<{ at: number }>(
      c.env.LICENSE_CACHE,
      dedupeKey
    );
    if (processed) {
      console.log("webhook_duplicate_skipped", { eventId });
      return c.json({ ok: true, skipped: "duplicate" });
    }
    await kvPutJson(
      c.env.LICENSE_CACHE,
      dedupeKey,
      { at: Date.now() },
      60 * 60 * 24
    );
  }

  // 5. アクション決定
  const action = actionFromEvent(event.eventName, event.status);

  const cacheKey = `license:${event.licenseKey}`;
  const ttl = parseInt(c.env.LICENSE_CACHE_TTL_SECONDS, 10) || 3600;

  if (action === "activate") {
    const info = buildLicenseInfo(event, "activate");
    await kvPutJson(c.env.LICENSE_CACHE, cacheKey, info, ttl);
    console.log("webhook_activate", {
      eventName: event.eventName,
      status: event.status,
    });
  } else if (action === "revoke") {
    await kvDelete(c.env.LICENSE_CACHE, cacheKey);
    console.log("webhook_revoke", {
      eventName: event.eventName,
      status: event.status,
    });
  } else {
    console.log("webhook_ignored", { eventName: event.eventName });
  }

  return c.json({ ok: true, action });
});
