// ============================================================
// account.ts - アカウント情報からのスコア算出
// 配置先: src/lib/detector/account.ts
//
// 対応シグナル:
//  1. フォロー中アカウント → HUMAN加点
//  2. フォロー >> フォロワー → IMP加点
//  3. 引用→リプライ変換多用 → IMP大幅加点
//  4. 直近リプライ数異常 → IMP大幅加点
//  5. プロフィール言語 ≠ 投稿言語(日本語) → AI大幅加点
// ============================================================

export type AccountSignalCategory = 'ai' | 'impression' | 'human';

export interface AccountSignal {
  rule: string;
  category: AccountSignalCategory;
  weight: number; // この信号がカテゴリスコアに加える重み
  detail?: string; // 人間向け説明文
}

export interface AccountAnalysisInput {
  handle?: string;
  displayName?: string;
  recentPostTextSample: string;
  isReply: boolean;
  isRepost: boolean;

  // ===== 拡張プロフィール情報(オプショナル) =====
  profile?: {
    bioText?: string;             // プロフィール文
    bioDetectedLang?: LangCode;   // プロフィール文の言語(検出済み)
    followingCount?: number;      // フォロー数(本人がフォローしている数)
    followersCount?: number;      // フォロワー数
    isFollowingByMe?: boolean;    // 「自分(ユーザー)」がフォロー中
    profileFetchedAt?: number;    // プロフィール取得時刻(unix ms)
  };
  recentActivity?: {
    replyCountLast1h?: number;    // 直近1時間のリプライ数
    replyCountLast24h?: number;   // 直近24時間のリプライ数
    quotedThenReplyCount?: number; // 「引用ポストをリプライ化」の検出回数
    totalRecentPosts?: number;     // 直近観察した投稿総数
  };
}

export interface AccountAnalysisResult {
  score: number;        // 0.0 ~ 1.0 (高いほどAI/IMPらしい)
  category: AccountSignalCategory;
  signals: AccountSignal[];
  reasons: string[];    // 後方互換: 文字列での理由列挙
  confidence: number;   // 0.0 ~ 1.0 (シグナル数や情報量から)
  categoryScores: {
    ai: number;
    impression: number;
    human: number;
  };
}

// ============================================================
// 言語コード
// ============================================================
export type LangCode = 'ja' | 'en' | 'zh' | 'ko' | 'other' | 'unknown';

/**
 * 軽量言語検出
 * - 日本語(ひらがな/カタカナ): ja
 * - 中国語(漢字のみ・かな無し): zh
 * - 韓国語(ハングル): ko
 * - ASCII主体: en
 * - その他: other
 */
export function detectLang(text: string): LangCode {
  if (!text || text.trim().length < 2) return 'unknown';

  const len = text.length;
  let kana = 0;       // ひらがな・カタカナ
  let cjkHan = 0;     // 漢字(CJK統合漢字)
  let hangul = 0;     // ハングル
  let ascii = 0;      // ASCII文字

  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;

    // ひらがな U+3040-U+309F、カタカナ U+30A0-U+30FF
    if ((code >= 0x3040 && code <= 0x309f) || (code >= 0x30a0 && code <= 0x30ff)) {
      kana++;
    }
    // CJK統合漢字 U+4E00-U+9FFF
    else if (code >= 0x4e00 && code <= 0x9fff) {
      cjkHan++;
    }
    // ハングル U+AC00-U+D7AF (音節), U+1100-U+11FF (字母)
    else if (
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0x1100 && code <= 0x11ff)
    ) {
      hangul++;
    }
    // ASCII
    else if (code >= 0x20 && code <= 0x7e) {
      ascii++;
    }
  }

  // ひらがな/カタカナがあれば日本語
  if (kana >= 1) return 'ja';
  // ハングルがあれば韓国語
  if (hangul / len > 0.2) return 'ko';
  // 漢字のみ多数(かな無し) → 中国語
  if (cjkHan / len > 0.3) return 'zh';
  // ASCII主体
  if (ascii / len > 0.7) return 'en';

  return 'other';
}

// ============================================================
// ヘルパー: 既存ロジック(handle/displayName ベース)
// ============================================================
const SUSPICIOUS_HANDLE_PATTERNS = [
  /^[a-z]+\d{6,}$/i,         // word1234567 のような数字大量
  /^[a-z0-9]{1,3}\d{6,}$/i,  // a1234567 のような短英字+数字
  /^user\d+$/i,              // user123
  /\d{8,}/,                   // 8桁以上の数字を含む
];

const SUSPICIOUS_NAME_PATTERNS = [
  /副業|月収|稼[げぐ]|FX|仮想通貨|億り人|不労所得/,
  /[\u{1F4B0}-\u{1F4B5}]/u,  // 💰💱💲💳💴💵💶💷
  /^\s*\d+万円/,
];

function analyzeHandlePatterns(handle: string | undefined): AccountSignal[] {
  if (!handle) return [];
  const cleaned = handle.replace(/^@/, '');
  const signals: AccountSignal[] = [];

  for (const pattern of SUSPICIOUS_HANDLE_PATTERNS) {
    if (pattern.test(cleaned)) {
      signals.push({
        rule: 'account/handle-pattern',
        category: 'impression',
        weight: 0.25,
        detail: `ハンドル名がbot/量産アカウント風: @${cleaned}`,
      });
      break;
    }
  }
  return signals;
}

function analyzeDisplayName(name: string | undefined): AccountSignal[] {
  if (!name) return [];
  const signals: AccountSignal[] = [];

  for (const pattern of SUSPICIOUS_NAME_PATTERNS) {
    if (pattern.test(name)) {
      signals.push({
        rule: 'account/name-money',
        category: 'impression',
        weight: 0.35,
        detail: `表示名に金銭訴求ワードあり: "${name.slice(0, 30)}"`,
      });
      break;
    }
  }
  return signals;
}

// ============================================================
// 新シグナル 1: フォロー中 → HUMAN加点
// ============================================================
function analyzeFollowing(input: AccountAnalysisInput): AccountSignal[] {
  if (!input.profile?.isFollowingByMe) return [];
  return [
    {
      rule: 'account/following-by-me',
      category: 'human',
      weight: 0.6, // 強めの加点(自分がフォローしている人は信頼)
      detail: 'あなたがフォロー中のアカウント',
    },
  ];
}

// ============================================================
// 新シグナル 2: フォロー >> フォロワー → IMP加点
// ============================================================
function analyzeFollowRatio(input: AccountAnalysisInput): AccountSignal[] {
  const p = input.profile;
  if (!p || typeof p.followingCount !== 'number' || typeof p.followersCount !== 'number') {
    return [];
  }

  const following = p.followingCount;
  const followers = p.followersCount;

  // フォロワー0除算ガード
  if (followers <= 0 && following > 100) {
    return [{
      rule: 'account/follow-ratio-extreme',
      category: 'impression',
      weight: 0.5,
      detail: `フォロー${following}人/フォロワー0人(典型的なスパムbot)`,
    }];
  }

  if (followers <= 0) return [];

  const ratio = following / followers;

  // フォロワー数が少なくてもフォロー数が異常に多い場合
  if (ratio > 20 && following > 200) {
    return [{
      rule: 'account/follow-ratio-extreme',
      category: 'impression',
      weight: 0.6,
      detail: `フォロー${following} >> フォロワー${followers}(比率${ratio.toFixed(0)}倍)`,
    }];
  }
  if (ratio > 10 && following > 100) {
    return [{
      rule: 'account/follow-ratio-high',
      category: 'impression',
      weight: 0.45,
      detail: `フォロー${following} >> フォロワー${followers}(比率${ratio.toFixed(0)}倍)`,
    }];
  }
  if (ratio > 5 && following > 500) {
    return [{
      rule: 'account/follow-ratio-medium',
      category: 'impression',
      weight: 0.25,
      detail: `フォロー${following} > フォロワー${followers}(比率${ratio.toFixed(0)}倍)`,
    }];
  }

  return [];
}

// ============================================================
// 新シグナル 3: 引用→リプライ変換多用 → IMP大幅加点
// ============================================================
function analyzeQuotedReplyPattern(input: AccountAnalysisInput): AccountSignal[] {
  const a = input.recentActivity;
  if (!a || typeof a.quotedThenReplyCount !== 'number' || typeof a.totalRecentPosts !== 'number') {
    return [];
  }

  if (a.totalRecentPosts < 5) return []; // サンプル少なすぎ
  const ratio = a.quotedThenReplyCount / a.totalRecentPosts;

  if (ratio > 0.5 && a.quotedThenReplyCount >= 5) {
    return [{
      rule: 'account/quoted-reply-pattern',
      category: 'impression',
      weight: 0.7, // 大幅加点
      detail: `直近${a.totalRecentPosts}投稿中${a.quotedThenReplyCount}件が引用→リプライ変換(${(ratio * 100).toFixed(0)}%)`,
    }];
  }
  if (ratio > 0.3 && a.quotedThenReplyCount >= 3) {
    return [{
      rule: 'account/quoted-reply-pattern',
      category: 'impression',
      weight: 0.5,
      detail: `引用→リプライ変換比率高い: ${(ratio * 100).toFixed(0)}%`,
    }];
  }

  return [];
}

// ============================================================
// 新シグナル 4: 直近リプライ数異常 → IMP大幅加点
// ============================================================
function analyzeReplyVolume(input: AccountAnalysisInput): AccountSignal[] {
  const a = input.recentActivity;
  if (!a) return [];

  const signals: AccountSignal[] = [];

  // 1時間あたり50件以上は確実にスパム
  if (typeof a.replyCountLast1h === 'number' && a.replyCountLast1h >= 50) {
    signals.push({
      rule: 'account/reply-burst-1h',
      category: 'impression',
      weight: 0.75, // 大幅加点
      detail: `直近1時間で${a.replyCountLast1h}件のリプライ(異常頻度)`,
    });
    return signals; // この信号があれば他は不要
  }

  // 1時間あたり20件以上も怪しい
  if (typeof a.replyCountLast1h === 'number' && a.replyCountLast1h >= 20) {
    signals.push({
      rule: 'account/reply-burst-1h',
      category: 'impression',
      weight: 0.5,
      detail: `直近1時間で${a.replyCountLast1h}件のリプライ(高頻度)`,
    });
  }

  // 24時間で200件以上
  if (typeof a.replyCountLast24h === 'number' && a.replyCountLast24h >= 200) {
    signals.push({
      rule: 'account/reply-burst-24h',
      category: 'impression',
      weight: 0.6,
      detail: `直近24時間で${a.replyCountLast24h}件のリプライ(異常頻度)`,
    });
  } else if (typeof a.replyCountLast24h === 'number' && a.replyCountLast24h >= 100) {
    signals.push({
      rule: 'account/reply-burst-24h',
      category: 'impression',
      weight: 0.4,
      detail: `直近24時間で${a.replyCountLast24h}件のリプライ(高頻度)`,
    });
  }

  return signals;
}

// ============================================================
// 新シグナル 5: プロフィール言語 ≠ 投稿言語 → AI大幅加点
// ============================================================
function analyzeLangMismatch(input: AccountAnalysisInput): AccountSignal[] {
  const p = input.profile;
  if (!p?.bioText || p.bioText.trim().length < 10) return [];

  const bioLang = p.bioDetectedLang ?? detectLang(p.bioText);
  const postLang = detectLang(input.recentPostTextSample);

  // 投稿が日本語で、プロフィールが日本語以外(en/zh/ko)→ 多言語AIスパム
  if (postLang === 'ja' && bioLang !== 'ja' && bioLang !== 'unknown') {
    // 英語プロフィール + 日本語投稿 = AI翻訳スパムの典型
    if (bioLang === 'en') {
      return [{
        rule: 'account/lang-mismatch-en-ja',
        category: 'ai',
        weight: 0.75, // 大幅加点
        detail: `プロフィール英語のみ・投稿日本語(AI翻訳スパム濃厚)`,
      }];
    }
    // 中国語/韓国語/その他のプロフィール + 日本語投稿
    return [{
      rule: 'account/lang-mismatch-other-ja',
      category: 'ai',
      weight: 0.65,
      detail: `プロフィール${bioLang.toUpperCase()}・投稿日本語(AI翻訳の可能性)`,
    }];
  }

  return [];
}

// ============================================================
// メインエクスポート
// ============================================================
export default function analyzeAccountSignals(
  input: AccountAnalysisInput,
): AccountAnalysisResult {
  const allSignals: AccountSignal[] = [
    ...analyzeHandlePatterns(input.handle),
    ...analyzeDisplayName(input.displayName),
    ...analyzeFollowing(input),
    ...analyzeFollowRatio(input),
    ...analyzeQuotedReplyPattern(input),
    ...analyzeReplyVolume(input),
    ...analyzeLangMismatch(input),
  ];

  // カテゴリ別スコア集計
  let aiSum = 0, impSum = 0, humanSum = 0;
  for (const s of allSignals) {
    if (s.category === 'ai') aiSum += s.weight;
    else if (s.category === 'impression') impSum += s.weight;
    else if (s.category === 'human') humanSum += s.weight;
  }

  // 0~1 にクランプ
  const aiScore = Math.min(1, aiSum);
  const impScore = Math.min(1, impSum);
  const humanScore = Math.min(1, humanSum);

  // 最終スコア: AI/IMPは加算的、HUMANは減算的
  // baseScore: 0.5 (中立)
  // - AI/IMPシグナル → スコアを上げる
  // - HUMANシグナル → スコアを下げる
  let finalScore = 0.5 + (aiScore + impScore) * 0.5 - humanScore * 0.5;
  finalScore = Math.max(0, Math.min(1, finalScore));

  // 最終カテゴリ判定
  let category: AccountSignalCategory = 'human';
  if (aiScore >= impScore && aiScore >= humanScore && aiScore > 0.2) {
    category = 'ai';
  } else if (impScore >= aiScore && impScore >= humanScore && impScore > 0.2) {
    category = 'impression';
  } else if (humanScore > Math.max(aiScore, impScore)) {
    category = 'human';
  } else {
    // どれも弱い→中立 → impressionをデフォルト扱い
    category = impScore > 0 ? 'impression' : 'human';
  }

  // 信頼度: シグナル数 + プロフィール情報の充実度
  let confidenceBoost = 0;
  if (input.profile) confidenceBoost += 0.2;
  if (input.recentActivity) confidenceBoost += 0.2;
  const confidence = Math.min(1, allSignals.length * 0.15 + confidenceBoost);

  return {
    score: finalScore,
    category,
    signals: allSignals,
    reasons: allSignals.map((s) => s.detail ?? s.rule),
    confidence,
    categoryScores: {
      ai: aiScore,
      impression: impScore,
      human: humanScore,
    },
  };
}
