import type { Account, ExtractorOptions, Post } from './types';

const STATUS_URL_RE = /\/status(?:es)?\/(\d+)/i;
const STATUS_HANDLE_RE = /^\/([^/]+)\/status(?:es)?\/\d+/i;

const USER_NAME_SELECTOR = '[data-testid="User-Name"]';
const SOCIAL_CONTEXT_SELECTOR = '[data-testid="socialContext"]';
const AVATAR_SELECTOR = [
  '[data-testid="Tweet-User-Avatar"] img',
  'a[href$="/photo"] img',
  'img[alt*="profile"]',
  'img[alt*="プロフィール"]',
].join(', ');

const MEDIA_SELECTOR = [
  '[data-testid="tweetPhoto"]',
  '[data-testid="videoPlayer"]',
  '[data-testid="card.wrapper"]',
  '[data-testid="previewInterstitial"]',
  'video',
].join(', ');

const RETWEET_KEYWORDS = [
  'reposted',
  'retweeted',
  'retweet',
  'repost',
  'リポストしました',
  'リポスト',
  'リツイートしました',
  'リツイート',
];

const REPLY_KEYWORDS = [
  'replying to',
  'replying',
  '返信先:',
  '返信先',
];

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function textOf(element: Element | null): string | null {
  if (!element) {
    return null;
  }

  const text = 'innerText' in element ? element.innerText : element.textContent;
  const normalized = normalizeText(text);

  return normalized || null;
}

function toAbsoluteUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url, location.origin).toString();
  } catch {
    return null;
  }
}

export function extractPostIdFromUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    const pathname = new URL(url, location.origin).pathname;
    return pathname.match(STATUS_URL_RE)?.[1] ?? null;
  } catch {
    return url.match(STATUS_URL_RE)?.[1] ?? null;
  }
}

function extractStatusUrl(article: ParentNode): string | null {
  const anchors = article.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/status/"], a[href*="/statuses/"]'
  );

  for (const anchor of anchors) {
    const absoluteUrl = toAbsoluteUrl(anchor.getAttribute('href') ?? anchor.href);
    const postId = extractPostIdFromUrl(absoluteUrl);

    if (absoluteUrl && postId) {
      return absoluteUrl;
    }
  }

  return null;
}

function extractPostedAt(article: ParentNode): string | null {
  const time = article.querySelector<HTMLTimeElement>('time[datetime]');
  const datetime = time?.getAttribute('datetime');

  if (!datetime) {
    return null;
  }

  const parsed = new Date(datetime);
  return Number.isNaN(parsed.getTime()) ? datetime : parsed.toISOString();
}

function extractText(article: ParentNode): string {
  const primaryNodes = Array.from(article.querySelectorAll<HTMLElement>('[data-testid="tweetText"]'));
  if (primaryNodes.length > 0) {
    return uniqueNonEmpty(primaryNodes.map((node) => node.innerText)).join('\n');
  }

  const fallbackNodes = Array.from(article.querySelectorAll<HTMLElement>('div[lang]')).filter(
    (node) => !node.closest(USER_NAME_SELECTOR)
  );

  return uniqueNonEmpty(fallbackNodes.map((node) => node.innerText)).join('\n');
}

function extractHandleFromStatusUrl(statusUrl: string | null): string | null {
  if (!statusUrl) {
    return null;
  }

  try {
    const pathname = new URL(statusUrl).pathname;
    const handle = pathname.match(STATUS_HANDLE_RE)?.[1] ?? null;
    return handle ? `@${handle}` : null;
  } catch {
    return null;
  }
}

function extractDisplayAndHandle(article: ParentNode, statusUrl: string | null): Pick<Account, 'handle' | 'displayName'> {
  const userNameBlock = article.querySelector<HTMLElement>(USER_NAME_SELECTOR);

  if (!userNameBlock) {
    return {
      handle: extractHandleFromStatusUrl(statusUrl),
      displayName: null,
    };
  }

  const spans = uniqueNonEmpty(
    Array.from(userNameBlock.querySelectorAll('span')).map((span) => span.textContent ?? '')
  );

  const handle =
    spans.find((value) => value.startsWith('@')) ??
    extractHandleFromStatusUrl(statusUrl);

  const displayName =
    spans.find(
      (value) =>
        !value.startsWith('@') &&
        value !== '·' &&
        value !== '・' &&
        !/^https?:\/\//i.test(value)
    ) ?? null;

  return {
    handle: handle ?? null,
    displayName,
  };
}

function extractProfileImageUrl(article: ParentNode): string | null {
  const image = article.querySelector<HTMLImageElement>(AVATAR_SELECTOR);
  return image?.src ?? null;
}

function containsAnyKeyword(haystack: string, keywords: string[]): boolean {
  const lower = haystack.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function extractFlags(article: ParentNode): Pick<Post, 'isReply' | 'isRetweet' | 'hasMedia'> {
  const socialContextText = normalizeText(
    article.querySelector<HTMLElement>(SOCIAL_CONTEXT_SELECTOR)?.innerText ??
      article.querySelector<HTMLElement>(SOCIAL_CONTEXT_SELECTOR)?.textContent
  );

  const articleTextPreview = normalizeText(
    (article instanceof HTMLElement ? article.innerText : article.textContent) ?? ''
  ).slice(0, 500);

  const combined = `${socialContextText} ${articleTextPreview}`.trim();

  return {
    isReply: containsAnyKeyword(combined, REPLY_KEYWORDS),
    isRetweet: containsAnyKeyword(combined, RETWEET_KEYWORDS),
    hasMedia: Boolean(article.querySelector(MEDIA_SELECTOR)),
  };
}
// src/lib/extractor.ts
function getStatusAnchor(article: HTMLElement): HTMLAnchorElement | null {
  // aタグの中に "/status/" を含むものをより広く探す
  return article.querySelector('a[href*="/status/"]') as HTMLAnchorElement;
}

export function extractPostFromArticle(
  article: HTMLElement,
  _options: ExtractorOptions = {}
): Post | null {
  const statusUrl = extractStatusUrl(article);
  const postId = extractPostIdFromUrl(statusUrl);

  if (!statusUrl || !postId) {
    return null;
  }

  const text = extractText(article);
  const { handle, displayName } = extractDisplayAndHandle(article, statusUrl);
  const profileImageUrl = extractProfileImageUrl(article);
  const postedAt = extractPostedAt(article);
  const flags = extractFlags(article);

  return {
    postId,
    url: statusUrl,
    text,
    handle,
    displayName,
    profileImageUrl,
    postedAt,
    isReply: flags.isReply,
    isRetweet: flags.isRetweet,
    hasMedia: flags.hasMedia,
    account: {
      handle,
      displayName,
      profileImageUrl,
    },
    extractedAt: new Date().toISOString(),
    source: 'x-timeline',
  };
}
