// ============================================================
// profileFetcher.ts - X(Twitter)プロフィールページの取得と解析
// 配置先: src/lib/profileFetcher.ts
// 注意: background.ts または content.ts で呼び出すこと(CORS回避)
// ============================================================

import { detectLang, type LangCode } from './detector/account';
import { setUserProfile, getUserProfile } from './userProfileCache';

export interface FetchedProfileData {
  handle: string;
  bioText?: string;
  bioDetectedLang?: LangCode;
  followingCount?: number;
  followersCount?: number;
}

const FETCH_COOLDOWN_MS = 60 * 60 * 1000; // 同じユーザー1時間に1回まで
const PROFILE_URL_BASE = 'https://x.com/';

// ============================================================
// 重複fetch防止
// ============================================================
const inFlight = new Map<string, Promise<FetchedProfileData | null>>();

function normalizeHandle(h: string): string {
  const lower = h.trim().toLowerCase();
  return lower.startsWith('@') ? lower.slice(1) : lower;
}

// ============================================================
// メイン関数: fetchAndCacheProfile
// content.ts から呼ぶ(プロフィールページの fetch は content scope では同一オリジンで動く)
// ============================================================
export async function fetchAndCacheProfile(
  handle: string,
): Promise<FetchedProfileData | null> {
  const clean = normalizeHandle(handle);
  if (!clean) return null;

  // クールダウンチェック
  const cached = await getUserProfile('@' + clean);
  if (cached?.fetchedAt) {
    const age = Date.now() - cached.fetchedAt;
    if (age < FETCH_COOLDOWN_MS) {
      // 直近で取得済み → キャッシュ返却
      return {
        handle: '@' + clean,
        bioText: cached.bioText,
        bioDetectedLang: cached.bioDetectedLang,
        followingCount: cached.followingCount,
        followersCount: cached.followersCount,
      };
    }
  }

  // 同時fetchを防ぐ
  if (inFlight.has(clean)) {
    return inFlight.get(clean)!;
  }

  const promise = doFetchProfile(clean).finally(() => {
    inFlight.delete(clean);
  });
  inFlight.set(clean, promise);
  return promise;
}

// ============================================================
// 実際のfetch処理
// ============================================================
async function doFetchProfile(
  cleanHandle: string,
): Promise<FetchedProfileData | null> {
  const url = `${PROFILE_URL_BASE}${cleanHandle}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) {
      console.warn('[AIPF/profileFetcher] HTTP error', { handle: cleanHandle, status: res.status });
      return null;
    }
    const html = await res.text();
    const data = parseProfileHtml(html, cleanHandle);

    // キャッシュに保存
    if (data) {
      await setUserProfile('@' + cleanHandle, {
        bioText: data.bioText,
        bioDetectedLang: data.bioDetectedLang,
        followingCount: data.followingCount,
        followersCount: data.followersCount,
        fetchedAt: Date.now(),
      });
    }
    return data;
  } catch (e) {
    console.warn('[AIPF/profileFetcher] fetch failed', { handle: cleanHandle, error: e });
    return null;
  }
}

// ============================================================
// HTMLパース
// 注意: X(Twitter)は SPA で初期HTMLには大した情報が入っていない事が多い
// → og:descriptionなどメタタグから抜き出す
// ============================================================
function parseProfileHtml(html: string, cleanHandle: string): FetchedProfileData | null {
  const data: FetchedProfileData = { handle: '@' + cleanHandle };

  // og:description にプロフィール文が入っていることが多い
  const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  if (ogDescMatch) {
    const bio = decodeHtmlEntities(ogDescMatch[1]);
    if (bio && bio.length > 0) {
      data.bioText = bio;
      data.bioDetectedLang = detectLang(bio);
    }
  }

  // フォロー数/フォロワー数は通常SPAで動的ロードなので、初期HTMLには無いことが多い
  // 念のため正規表現で試みる
  const followingMatch = html.match(/["']?(\d+)["']?\s*Following/i);
  if (followingMatch) {
    data.followingCount = parseInt(followingMatch[1], 10);
  }
  const followersMatch = html.match(/["']?(\d+)["']?\s*Followers/i);
  if (followersMatch) {
    data.followersCount = parseInt(followersMatch[1], 10);
  }

  return data;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

// ============================================================
// DOMからの直接抽出(タイムライン上のプロフィールホバー等から)
// content.ts でDOM要素を渡してフォロー数等を抜き出す
// ============================================================
export function extractProfileFromDOM(
  hostElement: HTMLElement,
): Partial<FetchedProfileData> {
  const data: Partial<FetchedProfileData> = {};

  // bio (UserDescription)
  const bioNode = hostElement.querySelector('[data-testid="UserDescription"]');
  const bioText = bioNode?.textContent?.trim();
  if (bioText) {
    data.bioText = bioText;
    data.bioDetectedLang = detectLang(bioText);
  }

  // フォロー数/フォロワー数(プロフィールページのリンク)
  // href="/<handle>/following" → 隣にフォロー数
  // href="/<handle>/verified_followers" or "/followers" → 隣にフォロワー数
  const followingLink = hostElement.querySelector<HTMLAnchorElement>(
    'a[href$="/following"]',
  );
  if (followingLink) {
    const numText = followingLink.querySelector('span')?.textContent?.trim();
    const n = parseCompactNumber(numText);
    if (n !== null) data.followingCount = n;
  }

  const followersLink = hostElement.querySelector<HTMLAnchorElement>(
    'a[href$="/verified_followers"], a[href$="/followers"]',
  );
  if (followersLink) {
    const numText = followersLink.querySelector('span')?.textContent?.trim();
    const n = parseCompactNumber(numText);
    if (n !== null) data.followersCount = n;
  }

  return data;
}

// "1.2K" → 1200, "5.3M" → 5300000, "892" → 892
function parseCompactNumber(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/,/g, '').trim();
  const m = cleaned.match(/^(\d+(?:\.\d+)?)\s*([KMB万千億])?$/i);
  if (!m) {
    const n = parseInt(cleaned, 10);
    return Number.isFinite(n) ? n : null;
  }
  const base = parseFloat(m[1]);
  const unit = m[2]?.toUpperCase();
  let mul = 1;
  if (unit === 'K' || unit === '千') mul = 1000;
  else if (unit === 'M' || unit === '万') mul = unit === '万' ? 10000 : 1000000;
  else if (unit === 'B' || unit === '億') mul = unit === '億' ? 100000000 : 1000000000;
  return Math.round(base * mul);
}
