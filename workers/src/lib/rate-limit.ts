import { kvGetJson, kvPutJson } from "./cache";

type Bucket = {
  count: number;
  resetAt: number;
};

type CheckResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * IPベース日次レートリミット (無料枠用)。
 */
export async function checkIpDailyLimit(
  kv: KVNamespace,
  ip: string,
  dailyLimit: number
): Promise<CheckResult> {
  const today = new Date().toISOString().slice(0, 10);
  const key = `rate:ip:${ip}:${today}`;

  const bucket = (await kvGetJson<Bucket>(kv, key)) ?? {
    count: 0,
    resetAt: nextMidnightUtc(),
  };

  if (bucket.count >= dailyLimit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: bucket.resetAt,
    };
  }

  bucket.count += 1;
  await kvPutJson(kv, key, bucket, 60 * 60 * 25);

  return {
    allowed: true,
    remaining: Math.max(0, dailyLimit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

/**
 * ライセンスキーベース分次レートリミット (Pro枠用)。
 */
export async function checkLicenseMinuteLimit(
  kv: KVNamespace,
  licenseKey: string,
  minuteLimit: number
): Promise<CheckResult> {
  const now = new Date();
  const slot = now.toISOString().slice(0, 16);
  const key = `rate:license:${licenseKey}:${slot}`;

  const bucket = (await kvGetJson<Bucket>(kv, key)) ?? {
    count: 0,
    resetAt: nextMinute(now),
  };

  if (bucket.count >= minuteLimit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: bucket.resetAt,
    };
  }

  bucket.count += 1;
  await kvPutJson(kv, key, bucket, 120);

  return {
    allowed: true,
    remaining: Math.max(0, minuteLimit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

function nextMidnightUtc(): number {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

function nextMinute(from: Date): number {
  const d = new Date(from);
  d.setSeconds(60, 0);
  return d.getTime();
}
