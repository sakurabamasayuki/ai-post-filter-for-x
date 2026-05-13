export interface HeuristicRuleDefinition {
  id: string;
  weight: number;
}

export const MIN_TEXT_LENGTH = 50;

export const RULES = {
  templatePhrases: {
    id: 'template-phrases',
    weight: 0.18,
  },
  overPolite: {
    id: 'over-polite',
    weight: 0.14,
  },
  structuralList: {
    id: 'structural-list',
    weight: 0.12,
  },
  aiEmojiCombo: {
    id: 'ai-emoji-combo',
    weight: 0.08,
  },
  evenPunctuation: {
    id: 'even-punctuation',
    weight: 0.1,
  },
  monotoneEnding: {
    id: 'monotone-ending',
    weight: 0.16,
  },
  headingMarkerOveruse: {
    id: 'heading-marker-overuse',
    weight: 0.08,
  },
  sectionKeywordFrequent: {
    id: 'section-keyword-frequent',
    weight: 0.14,
  },
} as const satisfies Record<string, HeuristicRuleDefinition>;

export const TOTAL_RULE_WEIGHT = Object.values(RULES).reduce(
  (sum, rule) => sum + rule.weight,
  0
);

export const TEMPLATE_PHRASE_PATTERNS: readonly RegExp[] = [
  /重要なのは/g,
  /結論(?:として)?/g,
  /という観点で/g,
  /ご参考までに/g,
  /最後に/g,
  /以下の通りです/g,
  /整理すると/g,
  /端的に言うと/g,
  /要するに/g,
  /一方で/g,
  /まずは/g,
  /ポイントとしては/g,
];

export const OVER_POLITE_PATTERNS = {
  desuNe: /ですね[。！？!?]*/g,
  ieruDeshou: /と言えるでしょう/g,
  kangaeraremasu: /と考えられます/g,
  juyouDesu: /重要です/g,
} as const;

export const LIST_LINE_RE =
  /^\s*(?:[-*•・●◦▪▫▶▷►▸▹▼▽◆◇■□]|(?:\d{1,2}|[①-⑳]|[一二三四五六七八九十]+)[.)）:：．、])\s+/;

export const AI_EMOJIS = ['✨', '🚀', '💡', '🎯', '🔥', '💪'] as const;

export const PUNCTUATION_RE = /[、。，．,.！？!?：:；;]/g;

export const SENTENCE_SPLIT_RE = /[。！？!?]\s*/g;

export const FORMAL_SENTENCE_END_RE =
  /(です|ます|でした|ました|でしょう|ません|でしょうか|でしたね|ますね)\s*$/;

export const HEADING_MARKER_RE = /[【】■▼]/g;

export const SECTION_KEYWORD_PATTERNS: readonly RegExp[] = [
  /結論/g,
  /ポイント/g,
  /まとめ/g,
  /要点/g,
  /補足/g,
  /理由/g,
  /背景/g,
];

export const JAPANESE_CHAR_RE = /[\u3040-\u30ff\u3400-\u9fff]/g;
export const LATIN_ALPHA_RE = /[A-Za-z]/g;
