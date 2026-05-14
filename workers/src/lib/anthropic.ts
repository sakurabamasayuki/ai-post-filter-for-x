type AnthropicResponse = {
  content: Array<{ type: string; text?: string }>;
};

const SYSTEM_PROMPT = `あなたは日本語SNS投稿の判定アシスタントです。
入力された投稿を3つのカテゴリで評価し、必ず以下のJSON形式のみで応答してください。
他のテキストや前置きは一切含めないでください。
{
  "score": 0.0〜1.0の数値(1に近いほどAI生成/インプレ稼ぎの可能性が高い),
  "categoryScores": {
    "ai": 0.0〜1.0の数値(AI生成らしさ),
    "impression": 0.0〜1.0の数値(インプレ稼ぎ・釣り投稿らしさ),
    "human": 0.0〜1.0の数値(人間が書いた自然な投稿らしさ)
  },
  "reasoning": "判定理由を80文字以内の日本語で簡潔に"
}

各カテゴリの判定基準:
■ AI生成 (ai):
- 過度に丁寧で機械的な言い回し
- 不自然な改行や構造化された箇条書き
- 「第一に」「参考になれば幸いです」など典型的なAI表現
- 全角絵文字や記号(✅、—)の過剰使用

■ インプレ稼ぎ (impression):
- 「今すぐ」「99%が知らない」など煽り表現
- 「保存推奨」「フォロー必須」など行動誘導
- 過剰なハッシュタグや🔥絵文字
- 副業・金銭訴求

■ 人間 (human):
- 「w」「草」など口語的表現
- 具体的な日時・固有名詞・体験談
- 個人的な感情・誤字脱字
- 短い独り言や雑談

注意: categoryScoresの3つの合計が1.0になるよう正規化してください。
score は max(ai, impression) と整合性を取ってください(人間寄りなら低く、AI/インプレ寄りなら高く)。`;

export type CategoryScores = {
  ai: number;
  impression: number;
  human: number;
};

export type ClaudeJudgement = {
  score: number;
  reasoning: string;
  categoryScores: CategoryScores;
};

/**
 * Claude Haiku を呼び出して判定結果を返す。
 */
export async function judgeWithClaude(
  apiKey: string,
  text: string
): Promise<ClaudeJudgement> {
  const truncated = text.slice(0, 2000);
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `次の投稿を判定してください:\n\n${truncated}`,
        },
      ],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Anthropic API error: ${resp.status} ${body.slice(0, 200)}`);
  }
  const data = (await resp.json()) as AnthropicResponse;
  const raw = data.content
    ?.map((c) => (c.type === "text" ? c.text ?? "" : ""))
    .join("")
    .trim();
  if (!raw) {
    throw new Error("Anthropic returned empty content");
  }
  return parseJudgement(raw);
}

function parseJudgement(raw: string): ClaudeJudgement {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Failed to extract JSON from Claude response");
    }
    parsed = JSON.parse(match[0]);
  }
  const obj = parsed as {
    score?: unknown;
    reasoning?: unknown;
    categoryScores?: unknown;
  };

  const score = clamp01(Number(obj.score));
  const reasoning =
    typeof obj.reasoning === "string"
      ? obj.reasoning.slice(0, 200)
      : "理由情報がありません";

  // categoryScores のパース(失敗時はフォールバック)
  const categoryScores = parseCategoryScores(obj.categoryScores, score);

  return { score, reasoning, categoryScores };
}

/**
 * categoryScores を安全にパース。失敗時は score から推測したフォールバック値を返す。
 */
function parseCategoryScores(
  raw: unknown,
  fallbackScore: number
): CategoryScores {
  if (
    raw &&
    typeof raw === "object" &&
    "ai" in raw &&
    "impression" in raw &&
    "human" in raw
  ) {
    const cs = raw as { ai: unknown; impression: unknown; human: unknown };
    const ai = clamp01(Number(cs.ai));
    const impression = clamp01(Number(cs.impression));
    const human = clamp01(Number(cs.human));

    // 正規化(合計を1.0にする)
    const total = ai + impression + human;
    if (total > 0) {
      return {
        ai: ai / total,
        impression: impression / total,
        human: human / total,
      };
    }
  }

  // フォールバック: score から推測
  if (fallbackScore >= 0.7) {
    return { ai: 0.7, impression: 0.2, human: 0.1 };
  } else if (fallbackScore >= 0.5) {
    return { ai: 0.4, impression: 0.3, human: 0.3 };
  } else {
    return { ai: 0.15, impression: 0.15, human: 0.7 };
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}