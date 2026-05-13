// ============================================================
// userProfileCache.ts - ユーザープロフィール情報のキャッシュ管理
// 配置先: src/lib/userProfileCache.ts
// ============================================================

export interface CachedUserProfile {
  handle: string;              // 正規化済み(@小文字)
  bioText?: string;
  bioDetectedLang?: 'ja' | 'en' | 'zh' | 'ko' | 'other' | 'unknown';
  followingCount?: number;
  followersCount?: number;
  isFollowingByMe?: boolean;
  // リプライ活動データ(タイムライン観察から集計)
  replyTimestamps?: number[];   // リプライ投稿のunix ms列(直近のみ保持)
  recentPostTypes?: Array<'reply' | 'quoted-reply' | 'original' | 'repost'>;
  fetchedAt?: number;          // プロフィールfetch時刻
  observedAt?: number;         // 観察データ更新時刻
}

const STORAGE_KEY_PREFIX = 'aipf/userProfile/';
const FOLLOWING_SET_KEY = 'aipf/followingSet';
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24時間
const MAX_REPLY_TIMESTAMPS = 300; // 多すぎても困るので上限
const MAX_RECENT_POSTS = 50;

// ============================================================
// ハンドル正規化
// ============================================================
function normalizeHandle(h: string): string {
  const lower = h.trim().toLowerCase();
  return lower.startsWith('@') ? lower : '@' + lower;
}

// ============================================================
// 取得・保存
// ============================================================
export async function getUserProfile(
  handle: string,
): Promise<CachedUserProfile | null> {
  const key = STORAGE_KEY_PREFIX + normalizeHandle(handle);
  try {
    const stored = await chrome.storage.local.get([key]);
    const cached = stored[key] as CachedUserProfile | undefined;
    if (!cached) return null;

    // 古すぎたら無効
    const age = cached.fetchedAt ? Date.now() - cached.fetchedAt : Infinity;
    if (age > MAX_CACHE_AGE_MS) {
      // 古くなったプロフィール本体は無効化しつつ、観察データは残す
      return {
        ...cached,
        followingCount: undefined,
        followersCount: undefined,
        bioText: undefined,
        bioDetectedLang: undefined,
        fetchedAt: undefined,
      };
    }
    return cached;
  } catch (e) {
    console.warn('[AIPF/userProfileCache] get failed', e);
    return null;
  }
}

export async function setUserProfile(
  handle: string,
  patch: Partial<CachedUserProfile>,
): Promise<void> {
  const normalized = normalizeHandle(handle);
  const key = STORAGE_KEY_PREFIX + normalized;
  try {
    const existing = (await getUserProfile(normalized)) ?? {
      handle: normalized,
    };
    const merged: CachedUserProfile = {
      ...existing,
      ...patch,
      handle: normalized,
    };
    await chrome.storage.local.set({ [key]: merged });
  } catch (e) {
    console.warn('[AIPF/userProfileCache] set failed', e);
  }
}

// ============================================================
// フォロー中アカウント集合(Set的管理)
// "Following" タブで観察したアカウントをここに登録
// ============================================================
export async function addToFollowingSet(handle: string): Promise<void> {
  const normalized = normalizeHandle(handle);
  try {
    const stored = await chrome.storage.local.get([FOLLOWING_SET_KEY]);
    const list = (stored[FOLLOWING_SET_KEY] as string[]) ?? [];
    if (!list.includes(normalized)) {
      const updated = [...list, normalized].slice(-5000); // 上限5000
      await chrome.storage.local.set({ [FOLLOWING_SET_KEY]: updated });
    }
    // userProfileの方にもフラグ立てる
    await setUserProfile(normalized, { isFollowingByMe: true });
  } catch (e) {
    console.warn('[AIPF/userProfileCache] addToFollowingSet failed', e);
  }
}

export async function isFollowingByMe(handle: string): Promise<boolean> {
  const normalized = normalizeHandle(handle);
  try {
    const stored = await chrome.storage.local.get([FOLLOWING_SET_KEY]);
    const list = (stored[FOLLOWING_SET_KEY] as string[]) ?? [];
    return list.includes(normalized);
  } catch {
    return false;
  }
}

// ============================================================
// リプライ活動の記録(タイムラインで投稿を観察した時点で呼ぶ)
// ============================================================
export async function recordPostObservation(
  handle: string,
  postType: 'reply' | 'quoted-reply' | 'original' | 'repost',
  timestamp: number = Date.now(),
): Promise<void> {
  const normalized = normalizeHandle(handle);
  const profile = (await getUserProfile(normalized)) ?? { handle: normalized };

  // リプライタイムスタンプ追加
  const ts = profile.replyTimestamps ?? [];
  if (postType === 'reply' || postType === 'quoted-reply') {
    ts.push(timestamp);
    if (ts.length > MAX_REPLY_TIMESTAMPS) {
      ts.splice(0, ts.length - MAX_REPLY_TIMESTAMPS);
    }
  }

  // 直近投稿タイプ列(古いものを捨てる)
  const types = profile.recentPostTypes ?? [];
  types.push(postType);
  if (types.length > MAX_RECENT_POSTS) {
    types.splice(0, types.length - MAX_RECENT_POSTS);
  }

  await setUserProfile(normalized, {
    replyTimestamps: ts,
    recentPostTypes: types,
    observedAt: Date.now(),
  });
}

// ============================================================
// 活動データの集計
// ============================================================
export function calcReplyCountWithinHours(
  profile: CachedUserProfile,
  hours: number,
): number {
  const ts = profile.replyTimestamps ?? [];
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return ts.filter((t) => t >= cutoff).length;
}

export function calcQuotedReplyRatio(profile: CachedUserProfile): {
  quotedThenReplyCount: number;
  totalRecentPosts: number;
} {
  const types = profile.recentPostTypes ?? [];
  return {
    quotedThenReplyCount: types.filter((t) => t === 'quoted-reply').length,
    totalRecentPosts: types.length,
  };
}

// ============================================================
// クリーンアップ(全データ削除)
// ============================================================
export async function clearAllUserProfiles(): Promise<void> {
  try {
    const all = await chrome.storage.local.get(null);
    const keysToRemove = Object.keys(all).filter((k) =>
      k.startsWith(STORAGE_KEY_PREFIX),
    );
    keysToRemove.push(FOLLOWING_SET_KEY);
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
  } catch (e) {
    console.warn('[AIPF/userProfileCache] clearAll failed', e);
  }
}
