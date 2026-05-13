import { storage } from "./storage";

const API_BASE =
  (typeof __AIPF_API_BASE__ !== "undefined" && __AIPF_API_BASE__) ||
  "https://ai-post-filter-api-v2.ai-post-filter-dev.workers.dev";

const LOCAL_CACHE_KEY = "aipf:license:cache";
const LOCAL_CACHE_TTL_MS = 60 * 60 * 1000; // 1時間

export type LicenseStatus = {
  valid: boolean;
  plan: "free" | "pro";
  expiresAt?: string;
  checkedAt: number;
};

declare const __AIPF_API_BASE__: string | undefined;

type ValidateResponse = {
  valid: boolean;
  plan: "free" | "pro";
  expiresAt?: string;
  cached?: boolean;
};

async function readLocalCache(): Promise<LicenseStatus | null> {
  try {
    const stored = await chrome.storage.local.get(LOCAL_CACHE_KEY);
    const raw = (stored as Record<string, unknown>)[LOCAL_CACHE_KEY];
    if (!raw || typeof raw !== "object") return null;
    return raw as LicenseStatus;
  } catch {
    return null;
  }
}

async function writeLocalCache(status: LicenseStatus): Promise<void> {
  try {
    await chrome.storage.local.set({ [LOCAL_CACHE_KEY]: status });
  } catch {
    /* noop */
  }
}

export async function clearLocalLicenseCache(): Promise<void> {
  try {
    await chrome.storage.local.remove(LOCAL_CACHE_KEY);
  } catch {
    /* noop */
  }
}

/**
 * ライセンスを検証する。
 *   - force=false: ローカルキャッシュ(1時間)を活用
 *   - force=true:  常にサーバに問い合わせ(「更新」ボタン用)
 */
export async function validateLicense(
  licenseKey: string,
  options?: { force?: boolean }
): Promise<LicenseStatus> {
  const force = options?.force === true;

  if (!licenseKey?.trim()) {
    return {
      valid: false,
      plan: "free",
      checkedAt: Date.now(),
    };
  }

  // ローカルキャッシュ参照(オフライン耐性)
  if (!force) {
    const cached = await readLocalCache();
    if (cached && Date.now() - cached.checkedAt < LOCAL_CACHE_TTL_MS) {
      return cached;
    }
  }

  // サーバ問い合わせ
  try {
    const resp = await fetch(`${API_BASE}/api/license/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseKey, force }),
    });

    if (!resp.ok) {
      // ネットワーク or サーバエラー時はキャッシュにフォールバック
      const fallback = await readLocalCache();
      if (fallback) return fallback;
      return {
        valid: false,
        plan: "free",
        checkedAt: Date.now(),
      };
    }

    const data = (await resp.json()) as ValidateResponse;
    const status: LicenseStatus = {
      valid: Boolean(data.valid),
      plan: data.plan ?? "free",
      expiresAt: data.expiresAt,
      checkedAt: Date.now(),
    };
    await writeLocalCache(status);
    return status;
  } catch {
    // オフライン時はキャッシュにフォールバック
    const fallback = await readLocalCache();
    if (fallback) return fallback;
    return {
      valid: false,
      plan: "free",
      checkedAt: Date.now(),
    };
  }
}

/**
 * 現在の settings.licenseKey に基づいてライセンス状態を取得。
 */
export async function getCurrentLicenseStatus(
  options?: { force?: boolean }
): Promise<LicenseStatus> {
  const settings = await storage.getSettings();
  return validateLicense(settings.licenseKey ?? "", options);
}

/**
 * ライセンスキーを保存して即時検証。
 */
export async function saveAndValidateLicense(
  licenseKey: string
): Promise<LicenseStatus> {
  const trimmed = licenseKey.trim();
  await storage.patchSettings({ licenseKey: trimmed });
  await clearLocalLicenseCache();
  return validateLicense(trimmed, { force: true });
}

/**
 * ライセンスキーをクリア。
 */
export async function clearLicense(): Promise<void> {
  await storage.patchSettings({ licenseKey: "" });
  await clearLocalLicenseCache();
}

/**
 * 期限切れ判定。
 */
export function isExpired(status: LicenseStatus): boolean {
  if (!status.expiresAt) return false;
  const expiresMs = Date.parse(status.expiresAt);
  if (!Number.isFinite(expiresMs)) return false;
  return Date.now() > expiresMs;
}

/**
 * 残り日数(期限切れなら 0、無期限なら null)。
 */
export function daysUntilExpiry(status: LicenseStatus): number | null {
  if (!status.expiresAt) return null;
  const expiresMs = Date.parse(status.expiresAt);
  if (!Number.isFinite(expiresMs)) return null;
  const diff = expiresMs - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}
