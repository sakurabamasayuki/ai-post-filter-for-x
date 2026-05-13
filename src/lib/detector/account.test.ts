import { describe, expect, it } from 'vitest';
import { analyzeAccountSignals, type AccountSignalInput } from './account';

const REFERENCE_DATE = new Date('2026-05-09T00:00:00.000Z');

function analyze(input: AccountSignalInput) {
  return analyzeAccountSignals(input, { referenceDate: REFERENCE_DATE });
}

describe('analyzeAccountSignals', () => {
  it('情報がほぼ無い場合は中立スコアで low confidence', () => {
    const result = analyze({
      handle: 'sakura_dev',
      displayName: 'さくら',
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.confidence).toBe('medium');
    expect(result.reasons).toHaveLength(0);
  });

  it('利用可能なシグナルがゼロなら中立スコア 0.5', () => {
    const result = analyzeAccountSignals(
      {
        handle: '',
        displayName: '',
      },
      { referenceDate: REFERENCE_DATE }
    );

    expect(result.score).toBe(0.5);
    expect(result.confidence).toBe('low');
    expect(result.reasons).toEqual([]);
  });

  it('末尾に長い数字が付くハンドルを検出する', () => {
    const result = analyze({
      handle: 'Name1234567',
      displayName: '名前',
    });

    expect(result.score).toBeGreaterThan(0.5);
    expect(result.reasons.some((r) => r.signal === 'handle-sequential-digits')).toBe(true);
  });

  it('generic + random 風ハンドルを検出する', () => {
    const result = analyze({
      handle: 'user_x8a92k',
      displayName: '田中',
    });

    expect(result.score).toBeGreaterThan(0.45);
    expect(result.reasons.some((r) => r.signal === 'handle-generic-random-format')).toBe(true);
  });

  it('新規アカウントかつ高頻度投稿を high 寄りに判定する', () => {
    const result = analyze({
      handle: 'fresh_account',
      displayName: '速報くん',
      accountCreatedAt: new Date('2026-04-25T00:00:00.000Z'),
      postsPerDay: 80,
    });

    expect(result.reasons.some((r) => r.signal === 'young-account-high-post-frequency')).toBe(true);
    expect(result.score).toBeGreaterThan(0.55);
  });

  it('フォロー/フォロワー比が極端なら検出する', () => {
    const result = analyze({
      handle: 'normal_handle',
      displayName: '普通の名前',
      followerCount: 20,
      followingCount: 500,
    });

    expect(result.reasons.some((r) => r.signal === 'follow-ratio-imbalanced')).toBe(true);
    expect(result.score).toBeGreaterThan(0.45);
  });

  it('フォロワー0で大量フォローは強く検出する', () => {
    const result = analyze({
      handle: 'newbie',
      displayName: '新人',
      followerCount: 0,
      followingCount: 180,
    });

    expect(result.reasons.some((r) => r.signal === 'follow-ratio-extreme-zero-followers')).toBe(true);
    expect(result.score).toBeGreaterThan(0.7);
  });

  it('bio が空なら高めに検出する', () => {
    const result = analyze({
      handle: 'someone',
      displayName: '誰か',
      bio: '',
    });

    expect(result.reasons.some((r) => r.signal === 'bio-empty')).toBe(true);
    expect(result.score).toBeGreaterThan(0.6);
  });

  it('bio が定型句のみなら検出する', () => {
    const result = analyze({
      handle: 'trader01',
      displayName: 'Trader',
      bio: 'Crypto trader',
    });

    expect(result.reasons.some((r) => r.signal === 'bio-template-only')).toBe(true);
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('表示名が絵文字のみなら強く検出する', () => {
    const result = analyze({
      handle: 'emoji_handle',
      displayName: '🔥✨🚀',
    });

    expect(result.reasons.some((r) => r.signal === 'display-name-emoji-only')).toBe(true);
    expect(result.score).toBeGreaterThan(0.7);
  });

  it('表示名が記号過多なら検出する', () => {
    const result = analyze({
      handle: 'symbolic',
      displayName: '!!!___###',
    });

    expect(
      result.reasons.some(
        (r) =>
          r.signal === 'display-name-symbol-only' ||
          r.signal === 'display-name-symbol-heavy'
      )
    ).toBe(true);
  });

  it('投稿頻度 100/日 超なら異常投稿として検出する', () => {
    const result = analyze({
      handle: 'post_machine',
      displayName: '投稿機',
      postsPerDay: 140,
    });

    expect(result.reasons.some((r) => r.signal === 'extreme-post-frequency')).toBe(true);
    expect(result.score).toBeGreaterThan(0.55);
  });

  it('複数の強いシグナルが重なると high confidence になる', () => {
    const result = analyze({
      handle: 'user_9832451',
      displayName: '🔥✨🚀',
      bio: 'AI enthusiast',
      accountCreatedAt: new Date('2026-04-20T00:00:00.000Z'),
      followerCount: 8,
      followingCount: 220,
      postsPerDay: 130,
    });

    expect(result.score).toBeGreaterThan(0.75);
    expect(result.confidence).toBe('high');
    expect(result.reasons.length).toBeGreaterThanOrEqual(4);
  });

  it('健全そうな古いアカウントは低スコアになりやすい', () => {
    const result = analyze({
      handle: 'sakura_engineer',
      displayName: 'さくら',
      bio: 'フロントエンドエンジニア。猫とコーヒーが好きです。',
      accountCreatedAt: new Date('2020-01-10T00:00:00.000Z'),
      followerCount: 1200,
      followingCount: 180,
      postsPerDay: 3,
      hasVerifiedBadge: false,
    });

    expect(result.score).toBeLessThan(0.2);
    expect(result.reasons).toHaveLength(0);
  });

  it('undefined フィールドは無視され、クラッシュしない', () => {
    const result = analyze({
      handle: 'plain_handle',
      displayName: 'プレーン',
      bio: undefined,
      profileImageUrl: undefined,
      accountCreatedAt: undefined,
      followerCount: undefined,
      followingCount: undefined,
      postsPerDay: undefined,
      hasVerifiedBadge: undefined,
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('verified badge は現状スコアを直接下げない', () => {
    const base = analyze({
      handle: 'user_000001',
      displayName: '!!__!!',
      bio: 'AI enthusiast',
    });

    const verified = analyze({
      handle: 'user_000001',
      displayName: '!!__!!',
      bio: 'AI enthusiast',
      hasVerifiedBadge: true,
    });

    expect(verified.score).toBe(base.score);
  });
});
