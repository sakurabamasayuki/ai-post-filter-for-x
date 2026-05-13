import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, DetectionResult, LicenseInfo } from "../types";
import { sha256Hex } from "../lib/hash";
import { kvGetJson, kvPutJson } from "../lib/cache";
import {
  checkIpDailyLimit,
  checkLicenseMinuteLimit,
} from "../lib/rate-limit";
import { judgeWithClaude } from "../lib/anthropic";
import { validateLicense } from "../lib/lemonsqueezy";

const DetectSchema = z.object({
  text: z.string().min(1).max(5000),
  licenseKey: z.string().trim().optional(),
});

export const detectRoute = new Hono<{ Bindings: Bindings }>();

detectRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = DetectSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      400
    );
  }

  const { text, licenseKey } = parsed.data;
  const ip =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("x-forwarded-for") ??
    "unknown";
    console.log("detect_request_ip", { 
      cfConnectingIp: c.req.header("CF-Connecting-IP"),
      xForwardedFor: c.req.header("x-forwarded-for"),
      finalIp: ip,
      hasLicenseKey: !!licenseKey,
    });

  if (licenseKey) {
    const licenseInfo = await resolveLicense(c.env, licenseKey);
    if (!licenseInfo.valid) {
      return c.json({ error: "invalid_license" }, 401);
    }
    const limit = parseInt(c.env.PRO_MINUTE_LIMIT, 10) || 10;
    const rl = await checkLicenseMinuteLimit(
      c.env.LICENSE_CACHE,
      licenseKey,
      limit
    );
    console.log("rate_limit_check", { ip, limit, allowed: rl.allowed, remaining: rl.remaining, resetAt: rl.resetAt });
    if (!rl.allowed) {
      c.header("X-RateLimit-Reset", String(rl.resetAt));
      return c.json({ error: "rate_limited", scope: "license" }, 429);
    }
    c.header("X-RateLimit-Remaining", String(rl.remaining));
  } else {
    const limit = parseInt(c.env.FREE_DAILY_LIMIT, 10) || 10;
    const rl = await checkIpDailyLimit(c.env.LICENSE_CACHE, ip, limit);
    if (!rl.allowed) {
      c.header("X-RateLimit-Reset", String(rl.resetAt));
      return c.json({ error: "rate_limited", scope: "ip" }, 429);
    }
    c.header("X-RateLimit-Remaining", String(rl.remaining));
  }

  const cacheKey = `detect:${await sha256Hex(text)}`;
  const cached = await kvGetJson<DetectionResult>(
    c.env.DETECTION_CACHE,
    cacheKey
  );
  if (cached) {
    return c.json({ ...cached, cached: true } satisfies DetectionResult);
  }

  let judgement;
  try {
    judgement = await judgeWithClaude(c.env.ANTHROPIC_API_KEY, text);
  } catch (e) {
    console.error("claude_failure", { message: (e as Error).message });
    return c.json({ error: "upstream_failure" }, 502);
  }

  const result: DetectionResult = {
    score: judgement.score,
    reasoning: judgement.reasoning,
    cached: false,
  };

  const ttl =
    parseInt(c.env.DETECTION_CACHE_TTL_SECONDS, 10) || 60 * 60 * 24 * 7;
  await kvPutJson(c.env.DETECTION_CACHE, cacheKey, result, ttl);

  return c.json(result);
});

async function resolveLicense(
  env: Bindings,
  licenseKey: string
): Promise<LicenseInfo> {
  const cacheKey = `license:${licenseKey}`;
  const cached = await kvGetJson<LicenseInfo>(env.LICENSE_CACHE, cacheKey);
  if (cached) return cached;

  const result = await validateLicense(
    env.LEMONSQUEEZY_API_KEY,
    licenseKey,
    env.LEMONSQUEEZY_STORE_ID
  );

  const ttl = parseInt(env.LICENSE_CACHE_TTL_SECONDS, 10) || 3600;
  await kvPutJson(env.LICENSE_CACHE, cacheKey, result, ttl);
  return result;
}
