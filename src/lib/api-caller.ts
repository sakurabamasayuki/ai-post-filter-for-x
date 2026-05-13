/**
 * Workers API 呼び出しモジュール（background script 経由版）
 * content script の CORS 制限を回避するため、background.ts に fetch を委譲する
 */

interface ApiDetectResponse {
  score: number;
  reasoning: string;
  cached: boolean;
  error?: string;
}

interface RateLimitInfo {
  remaining: number;
  resetAt: number;
  scope: 'ip' | 'license';
}

/**
 * Workers API に検出リクエストを送信（background script 経由）
 */
export async function callDetectApi(
  text: string,
  licenseKey?: string | null,
): Promise<{
  success: boolean;
  data?: ApiDetectResponse;
  rateLimitInfo?: RateLimitInfo;
  error?: string;
}> {
  try {
      const payload: { text: string; licenseKey?: string } = { text };
      if (licenseKey) {
        payload.licenseKey = licenseKey;
      }

      const response = await chrome.runtime.sendMessage({
        type: 'api/detect',
        payload,
      });

    if (!response || !response.ok) {
      // レート制限
      if (response?.status === 429) {
        const scope = (response.data?.scope as string) ?? 'ip';
        return {
          success: false,
          error: 'rate_limited',
          rateLimitInfo: {
            remaining: response.rateLimitInfo?.remaining ?? 0,
            resetAt: response.rateLimitInfo?.resetAt ?? Date.now(),
            scope: scope as 'ip' | 'license',
          },
        };
      }

      // 認可エラー
      if (response?.status === 401) {
        return {
          success: false,
          error: response.data?.error ?? 'invalid_license',
        };
      }

      // ネットワークエラー
      if (response?.error === 'network_error') {
        return {
          success: false,
          error: 'network_error',
        };
      }

      // その他のエラー
      return {
        success: false,
        error: response?.data?.error ?? 'upstream_error',
      };
    }

    // 成功
    return {
      success: true,
      data: response.data as ApiDetectResponse,
      rateLimitInfo: response.rateLimitInfo?.remaining !== null
        ? {
            remaining: response.rateLimitInfo.remaining,
            resetAt: response.rateLimitInfo.resetAt,
            scope: licenseKey ? 'license' : 'ip',
          }
        : undefined,
    };
  } catch (error) {
    console.error('[AIPF/api] sendMessage error', error);
    return {
      success: false,
      error: 'network_error',
    };
  }
}

/**
 * ライセンスキーをローカルストレージから取得
 */
export function getLicenseKeyFromStorage(): string | null {
  try {
    const stored = localStorage.getItem('aipf_license_key');
    return stored ? stored.trim() : null;
  } catch (e) {
    console.warn('[AIPF/storage] getLicenseKey failed', e);
    return null;
  }
}

/**
 * ライセンスキーをローカルストレージに保存
 */
export function saveLicenseKeyToStorage(key: string): void {
  try {
    localStorage.setItem('aipf_license_key', key.trim());
  } catch (e) {
    console.warn('[AIPF/storage] saveLicenseKey failed', e);
  }
}

/**
 * レート制限情報をローカルストレージに保存・取得
 */
export function getRateLimitStatus(): {
  remaining: number;
  resetAt: number;
} | null {
  try {
    const stored = localStorage.getItem('aipf_rate_limit');
    if (!stored) return null;
    return JSON.parse(stored) as { remaining: number; resetAt: number };
  } catch (e) {
    console.warn('[AIPF/storage] getRateLimitStatus failed', e);
    return null;
  }
}

export function setRateLimitStatus(remaining: number, resetAt: number): void {
  try {
    localStorage.setItem(
      'aipf_rate_limit',
      JSON.stringify({ remaining, resetAt }),
    );
  } catch (e) {
    console.warn('[AIPF/storage] setRateLimitStatus failed', e);
  }
}

/**
 * 無料プランが制限に達しているか判定
 */
export function isFreePlanExhausted(): boolean {
  const status = getRateLimitStatus();
  if (!status) return false;
  return status.remaining <= 0 && Date.now() < status.resetAt;
}

/**
 * 次のリセット時刻までの残り時間（秒）
 */
export function secondsUntilReset(): number {
  const status = getRateLimitStatus();
  if (!status) return 0;
  const remaining = Math.ceil((status.resetAt - Date.now()) / 1000);
  return Math.max(0, remaining);
}