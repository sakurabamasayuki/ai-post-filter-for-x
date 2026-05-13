import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, LicenseInfo } from "../types";
import { kvGetJson, kvPutJson } from "../lib/cache";
import { validateLicense } from "../lib/lemonsqueezy";

const ValidateSchema = z.object({
  licenseKey: z.string().trim().min(8).max(200),
  force: z.boolean().optional(),
});

export const licenseRoute = new Hono<{ Bindings: Bindings }>();

/**
 * POST /api/license/validate
 *   { licenseKey, force? }
 *   force=true でキャッシュバイパス(ユーザーの「更新」ボタン用)
 */
licenseRoute.post("/validate", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ValidateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      400
    );
  }

  const { licenseKey, force } = parsed.data;
  const cacheKey = `license:${licenseKey}`;

  if (!force) {
    const cached = await kvGetJson<LicenseInfo>(c.env.LICENSE_CACHE, cacheKey);
    if (cached) {
      return c.json({ ...cached, cached: true });
    }
  }

  let info: LicenseInfo;
  try {
    info = await validateLicense(
      c.env.LEMONSQUEEZY_API_KEY,
      licenseKey,
      c.env.LEMONSQUEEZY_STORE_ID
    );
  } catch (e) {
    console.error("license_validate_failure", {
      message: (e as Error).message,
    });
    return c.json({ error: "upstream_failure" }, 502);
  }

  const ttl = parseInt(c.env.LICENSE_CACHE_TTL_SECONDS, 10) || 3600;
  await kvPutJson(c.env.LICENSE_CACHE, cacheKey, info, ttl);

  return c.json({ ...info, cached: false });
});
