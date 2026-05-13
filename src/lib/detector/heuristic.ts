/**
 * ヒューリスティック層: 正規表現と特徴量による高速判定
 *
 * ML を補完する役割。明らかな AI 定型句やインプレッション稼ぎパターンを
 * 確実に検出する。短文でも判定可能。
 */

export interface HeuristicSignal {
  rule: string;
  category: 'ai' | 'impression' | 'human';
  weight: number;
  matched: string;
}

export interface HeuristicResult {
  aiScore: number;
  impressionScore: number;
  humanScore: number;
  category: 'ai' | 'impression' | 'human' | 'mixed';
  finalScore: number;
  signals: HeuristicSignal[];
  confidence: number;
}

// ============================================================
// AI 定型句パターン
// ============================================================
const AI_PATTERNS: Array<{ rule: string; regex: RegExp; weight: number }> = [
  // 結論強調の定型
  { rule: 'ai/opening-conclusion', regex: /結論から(申し上げ|言|述べ)/, weight: 0.85 },
  { rule: 'ai/conclusion-tail', regex: /(以上が|まとめると|総じて|総合的に)[、,]/, weight: 0.6 },

  // 構造化された箇条書き(3つのポイント系)
  { rule: 'ai/three-points', regex: /(3つの|三つの|3点の|三点の)(ポイント|理由|要因|要素|特徴|秘訣|コツ)/, weight: 0.7 },
  { rule: 'ai/first-second-third', regex: /第[一二三]に[、,].*第[二三][、,]/s, weight: 0.85 },
  { rule: 'ai/numbered-list', regex: /1[\.．、]\s*\S+[\s\S]*?2[\.．、]\s*\S+[\s\S]*?3[\.．、]/, weight: 0.55 },

  // 過剰丁寧
  { rule: 'ai/super-polite', regex: /(ご指摘の通り|お疲れ様です|皆様|誠に|心より)/, weight: 0.45 },
  { rule: 'ai/explanation-tail', regex: /(について(詳しく|わかりやすく)?(解説|説明)します|参考になれば幸いです|お役に立てれば)/, weight: 0.7 },

  // ChatGPT 定番フレーズ
  { rule: 'ai/important-point', regex: /(重要(なポイント|な点)|押さえておきたい|意識しましょう|心がけ(まし|ま)?ょう)/, weight: 0.5 },
  { rule: 'ai/various-angles', regex: /(様々な(観点|角度|視点)|多角的|多面的)/, weight: 0.45 },
  { rule: 'ai/effective-result', regex: /(効果的(な|に)|より良い結果|期待できる)/, weight: 0.4 },

  // チェック絵文字の連続
  { rule: 'ai/checkmark-list', regex: /(✅|✔️|🔑|📌|📝|💡).*\n.*(✅|✔️|🔑|📌|📝|💡)/s, weight: 0.7 },

  // 【】を使った構造化
  { rule: 'ai/bracketed-headers', regex: /【[^】]+】[\s\S]{1,30}【[^】]+】/, weight: 0.55 },

  // 矢印で結論誘導
  { rule: 'ai/arrow-conclusion', regex: /(→|⇒).*(つまり|結論|要するに)/s, weight: 0.5 },

  // 英語AI定型
  { rule: 'ai/en-here-is-what', regex: /\b(Here's what|Let me break|Let me walk you through)\b/i, weight: 0.85 },
  { rule: 'ai/en-important-note', regex: /\b(It's important to note|It's worth noting)\b/i, weight: 0.7 },
  { rule: 'ai/en-great-question', regex: /\b(Great question|Excellent question)\b/i, weight: 0.8 },
];

// ============================================================
// インプレッション稼ぎパターン
// ============================================================
const IMPRESSION_PATTERNS: Array<{ rule: string; regex: RegExp; weight: number }> = [
  // 保存系の煽り
  { rule: 'imp/save-recommend', regex: /(保存(推奨|必須|しないと損|して(後で|何度も)?(見|読))|ブックマーク(推奨|必須))/, weight: 0.9 },
  { rule: 'imp/save-emoji', regex: /保存.{0,5}🔥/, weight: 0.85 },

  // 知らないと損系
  { rule: 'imp/dont-know-loss', regex: /(知らないと(損|やばい|一生損)|知らない(人|人間)(多すぎ|やばい))/, weight: 0.9 },
  { rule: 'imp/percent-knowledge', regex: /(99|95|90)\s*[%％]の人が知らない/, weight: 0.95 },
  { rule: 'imp/secret-tech', regex: /(裏ワザ|裏技|裏側|誰も(知らな|教えな)い)/, weight: 0.65 },

  // 拡散・RT 誘導
  { rule: 'imp/spread-please', regex: /(拡散(希望|お願い|希望🙏)|RT(希望|お願い)|いいね(希望|お願い))/, weight: 0.85 },
  { rule: 'imp/think-rt', regex: /(思った人(RT|リツイート|いいね)|わかる人(RT|いいね))/, weight: 0.8 },

  // フォロー誘導
  { rule: 'imp/follow-please', regex: /(フォロー(してね|必須|してください|お願い)|フォローしないと損)/, weight: 0.8 },
  { rule: 'imp/follow-link', regex: /(プロフ(ィール)?(から|の)(LINE|リンク|登録)|DM(で|から|まで)(詳細|送り|連絡))/, weight: 0.85 },

  // 副業・お金系
  { rule: 'imp/side-income', regex: /(副業で?(月収|月\s*\d+万|稼ぐ|稼げる))/, weight: 0.8 },
  { rule: 'imp/easy-money', regex: /(誰でも|簡単に).*(\d+万|稼げ|月収)/, weight: 0.75 },
  { rule: 'imp/seven-figure', regex: /月収\s*[7７]\s*桁/, weight: 0.85 },

  // 数字バズ自慢
  { rule: 'imp/buzz-number', regex: /(\d+\s*万|\d+,?\d{3,})\s*(バズ|RT|いいね|フォロワー)/, weight: 0.55 },
  { rule: 'imp/follower-celebration', regex: /フォロワー\s*\d+\s*(万|千)\s*人?(突破|達成|ありがとう)/, weight: 0.7 },

  // 限定・緊急系
  { rule: 'imp/limited-now', regex: /(本日限定|今だけ|先着\d+名|限定公開|今すぐ)/, weight: 0.7 },
  { rule: 'imp/free-now', regex: /(無料(配布|プレゼント|公開|コンサル|相談)|今だけ無料)/, weight: 0.7 },

  // 極端な形容詞濫用
  { rule: 'imp/exaggeration', regex: /(神|最強|ヤバい|やばい|衝撃|絶対|100[%％]|間違いなく).*(これ|この|やつ|方法)/, weight: 0.45 },

  // 選 系のリスト
  { rule: 'imp/list-selection', regex: /(おすすめ|便利|神|最強|厳選).*?(\d+選|\d+つ)/, weight: 0.55 },

  // 連続絵文字
  { rule: 'imp/repeated-emoji', regex: /(🔥{2,}|⚠️{2,}|💯{2,}|❗{2,}|‼️{2,})/u, weight: 0.65 },

  // ぶら下げ
  { rule: 'imp/thread-bait', regex: /(↓|⬇).{0,10}(続き|詳細|まとめ).{0,10}(リプ|スレ|画像|プロフ)/, weight: 0.8 },
  { rule: 'imp/reply-bait', regex: /(リプ欄|コメント欄)に\S{0,15}(続き|詳細|画像|まとめ)/, weight: 0.85 },

  // 注意喚起風自己宣伝
  { rule: 'imp/attention-spam', regex: /(※注意※|⚠注意⚠|【注意】|【拡散希望】)/, weight: 0.55 },

  // 過剰な「これ」「やつ」
  { rule: 'imp/this-thing', regex: /(これマジで|これ知っ(てる|とく)|これ(やってない|やらないと))/, weight: 0.4 },
];

// ============================================================
// 人間っぽさのシグナル(AI/IMP スコアを下げる)
// ============================================================
const HUMAN_PATTERNS: Array<{ rule: string; regex: RegExp; weight: number }> = [
  // 砕けた口語
  { rule: 'hum/casual-w', regex: /(w{2,}$|ｗ{2,}|草$|草www|ワロタ|なんｗ)/m, weight: 0.7 },
  { rule: 'hum/honne', regex: /(マジで|めっちゃ|ガチで|ヤバ|まじ|ガチ)\S/, weight: 0.35 },
  { rule: 'hum/casual-end', regex: /(やん$|ねん$|わ$|っす$|だわ$|やで$|やった$|だな$|だね$)/m, weight: 0.45 },

  // 個人体験
  { rule: 'hum/today-i', regex: /(今日(の|は|から)|昨日|さっき|今|たった今).*(食べ|行っ|買っ|見た|来た)/, weight: 0.55 },
  { rule: 'hum/i-was', regex: /(俺|私|僕|あたし|うち).*(した|やった|だった|でした)/, weight: 0.3 },

  // 感情の発露
  { rule: 'hum/exclamation', regex: /[！!]{2,}|[？?]{2,}/, weight: 0.35 },
  { rule: 'hum/sad-emoji', regex: /(😭|😢|😂|🥺|😩|😮‍💨|😤)/u, weight: 0.4 },

  // 具体的な固有名詞
  { rule: 'hum/place-specific', regex: /(駅前|近所|うちの|実家|職場|会社の)/, weight: 0.4 },

  // 質問・相談調
  { rule: 'hum/question-real', regex: /(誰か(\S+)知っ(てる|てます|ない)|教えて(ほしい|くださ)|どうしたら|どうすれば)/, weight: 0.5 },

  // 誤字・打ち間違い風(同じ文字3連続)
  { rule: 'hum/typo-mark', regex: /(\S)\1{2,}(?!\d)/, weight: 0.3 },

  // 文末の口語
  { rule: 'hum/sentence-end-casual', regex: /(かな[？\?]?$|だっけ[？\?]?$|よな$|もん$|っぽい$)/m, weight: 0.45 },

  // 推し活・趣味語
  { rule: 'hum/hobby-words', regex: /(推し|オタ活|現場|遠征|配信|生放送|新刊|新譜)/, weight: 0.35 },
];

// ============================================================
// 検出関数
// ============================================================

const countEmDashes = (text: string): number => {
  const matches = text.match(/—/g);
  return matches ? matches.length : 0;
};

const countNumberedItems = (text: string): number => {
  const matches = text.match(/(?:^|\n)\s*[1-9][\.．、]\s/g);
  return matches ? matches.length : 0;
};

const countHashtags = (text: string): number => {
  const matches = text.match(/[#＃][^\s#＃]+/g);
  return matches ? matches.length : 0;
};

/**
 * テキストを解析してヒューリスティック結果を返す
 */
export function analyzeHeuristic(text: string): HeuristicResult {
  const signals: HeuristicSignal[] = [];
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return {
      aiScore: 0,
      impressionScore: 0,
      humanScore: 0.5,
      category: 'mixed',
      finalScore: 0.5,
      signals: [],
      confidence: 0,
    };
  }

  // AI パターンチェック
  for (const p of AI_PATTERNS) {
    const m = trimmed.match(p.regex);
    if (m) {
      signals.push({
        rule: p.rule,
        category: 'ai',
        weight: p.weight,
        matched: m[0].slice(0, 30),
      });
    }
  }

  // em-dash 多用
  const emCount = countEmDashes(trimmed);
  if (emCount >= 2) {
    signals.push({
      rule: 'ai/em-dash-overuse',
      category: 'ai',
      weight: Math.min(0.7, 0.3 * emCount),
      matched: `${emCount}個の—`,
    });
  }

  // 番号付きリスト3つ以上は AI 補強
  const numItems = countNumberedItems(trimmed);
  if (numItems >= 3) {
    signals.push({
      rule: 'ai/many-numbered',
      category: 'ai',
      weight: Math.min(0.85, 0.3 * numItems),
      matched: `${numItems}項目`,
    });
  }

  // インプレッション稼ぎパターンチェック
  for (const p of IMPRESSION_PATTERNS) {
    const m = trimmed.match(p.regex);
    if (m) {
      signals.push({
        rule: p.rule,
        category: 'impression',
        weight: p.weight,
        matched: m[0].slice(0, 30),
      });
    }
  }

  // ハッシュタグ4個以上はインプレ稼ぎ補強
  const hashCount = countHashtags(trimmed);
  if (hashCount >= 4) {
    signals.push({
      rule: 'imp/hashtag-spam',
      category: 'impression',
      weight: Math.min(0.75, 0.15 * hashCount),
      matched: `${hashCount}個のタグ`,
    });
  }

  // 人間パターンチェック
  for (const p of HUMAN_PATTERNS) {
    const m = trimmed.match(p.regex);
    if (m) {
      signals.push({
        rule: p.rule,
        category: 'human',
        weight: p.weight,
        matched: m[0].slice(0, 30),
      });
    }
  }

  // 短文 + シグナルがほぼなければ人間っぽい
  if (trimmed.length <= 30 && signals.filter((s) => s.category !== 'human').length === 0) {
    signals.push({
      rule: 'hum/short-mumble',
      category: 'human',
      weight: 0.4,
      matched: `${trimmed.length}文字の短文`,
    });
  }

  // ============================================================
  // スコア集計
  // ============================================================
  // 確率的 OR: 1 - prod(1 - w_i)
  const sumWeight = (cat: 'ai' | 'impression' | 'human'): number => {
    const ws = signals.filter((s) => s.category === cat).map((s) => s.weight);
    if (ws.length === 0) return 0;
    let r = 1;
    for (const w of ws) {
      r *= 1 - w;
    }
    return 1 - r;
  };

  const aiScore = sumWeight('ai');
  const impressionScore = sumWeight('impression');
  const humanScore = sumWeight('human');

  // フィルタ対象スコア
  const filterTargetRaw = Math.max(aiScore, impressionScore);
  const humanDamp = Math.max(0, 1 - humanScore * 0.7);
  const filterTarget = filterTargetRaw * humanDamp;

  // 中央値 0.5 にシフト
  const finalScore = 0.5 + (filterTarget - humanScore * 0.5) * 0.5;
  const clampedFinal = Math.max(0, Math.min(1, finalScore));

  // カテゴリ判定
  let category: 'ai' | 'impression' | 'human' | 'mixed' = 'mixed';
  const maxScore = Math.max(aiScore, impressionScore, humanScore);
  if (maxScore >= 0.3) {
    if (aiScore === maxScore && aiScore > impressionScore + 0.1 && aiScore > humanScore + 0.1) {
      category = 'ai';
    } else if (
      impressionScore === maxScore &&
      impressionScore > aiScore + 0.1 &&
      impressionScore > humanScore + 0.1
    ) {
      category = 'impression';
    } else if (
      humanScore === maxScore &&
      humanScore > Math.max(aiScore, impressionScore) + 0.1
    ) {
      category = 'human';
    }
  }

  const confidence = Math.min(1, signals.length / 5);

  return {
    aiScore: Number(aiScore.toFixed(4)),
    impressionScore: Number(impressionScore.toFixed(4)),
    humanScore: Number(humanScore.toFixed(4)),
    category,
    finalScore: Number(clampedFinal.toFixed(4)),
    signals,
    confidence: Number(confidence.toFixed(3)),
  };
}

export default analyzeHeuristic;
