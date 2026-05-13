/**
 * KV を JSON ラッパーとして扱うユーティリティ。
 */
export async function kvGetJson<T>(
  kv: KVNamespace,
  key: string
): Promise<T | null> {
  const raw = await kv.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function kvPutJson<T>(
  kv: KVNamespace,
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  await kv.put(key, JSON.stringify(value), {
    expirationTtl: Math.max(60, ttlSeconds),
  });
}

export async function kvDelete(
  kv: KVNamespace,
  key: string
): Promise<void> {
  await kv.delete(key);
}
