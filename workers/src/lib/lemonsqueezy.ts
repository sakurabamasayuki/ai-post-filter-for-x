import type { LicenseInfo } from "../types";

type ValidateResponse = {
  valid?: boolean;
  license_key?: {
    status?: string;
    expires_at?: string | null;
  };
  meta?: {
    store_id?: number | string;
    variant_name?: string;
  };
};

/**
 * LemonSqueezy のライセンスキー検証 API を呼ぶ。
 */
export async function validateLicense(
  apiKey: string,
  licenseKey: string,
  storeId: string
): Promise<LicenseInfo> {
  const resp = await fetch(
    "https://api.lemonsqueezy.com/v1/licenses/validate",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        license_key: licenseKey,
      }),
    }
  );

  if (!resp.ok) {
    return { valid: false, plan: "free" };
  }

  const data = (await resp.json()) as ValidateResponse;

  if (!data.valid || !data.license_key) {
    return { valid: false, plan: "free" };
  }

  const storeMatches =
    !data.meta?.store_id ||
    String(data.meta.store_id) === String(storeId);

  const active =
    data.license_key.status === "active" ||
    data.license_key.status === "inactive";

  if (!active || !storeMatches) {
    return { valid: false, plan: "free" };
  }

  return {
    valid: true,
    plan: "pro",
    expiresAt: data.license_key.expires_at ?? undefined,
  };
}

/**
 * LemonSqueezy Webhook の HMAC-SHA256 署名検証。
 */
export async function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signatureHex: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawBody)
  );

  const computedHex = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (computedHex.length !== signatureHex.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHex.length; i++) {
    diff |= computedHex.charCodeAt(i) ^ signatureHex.charCodeAt(i);
  }
  return diff === 0;
}
