export type Bindings = {
  // KV
  DETECTION_CACHE: KVNamespace;
  LICENSE_CACHE: KVNamespace;

  // Vars
  EXTENSION_ID: string;
  LEMONSQUEEZY_STORE_ID: string;
  FREE_DAILY_LIMIT: string;
  PRO_MINUTE_LIMIT: string;
  DETECTION_CACHE_TTL_SECONDS: string;
  LICENSE_CACHE_TTL_SECONDS: string;

  // Secrets
  ANTHROPIC_API_KEY: string;
  LEMONSQUEEZY_API_KEY: string;
  LEMONSQUEEZY_WEBHOOK_SECRET: string;
};

export type Plan = "free" | "pro";

export type LicenseInfo = {
  valid: boolean;
  plan: Plan;
  expiresAt?: string;
};

export type DetectionResult = {
  score: number;
  reasoning: string;
  cached: boolean;
};
