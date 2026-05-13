type AnthropicResponse = {
  content: Array<{ type: string; text?: string }>;
};

const SYSTEM_PROMPT = `あなたは日本語SNS投稿の判定アシスタントです。
入力された投稿が「AI生成」か「人間執筆」かを判定し、必ず以下のJSON形式のみで応答してください。
他のテキストや前置きは一切含めないでください。

{
  "score": 0.0〜1.0の数値(1に近いほどAI生成の可能性が高い),
  "reasoning": "判定理由を80文字以内の日本語で簡潔に"
}

判定基準:
- 過度に丁寧で機械的な言い回し → AI寄り
- 不自然な改行や箇条書きパターン → AI寄り
- 個人的な感情・口語・誤字 → 人間寄り
- 具体的な日時・固有名詞・体験談 → 人間寄り`;

export type ClaudeJudgement = {
  score: number;
  reasoning: string;
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
      max_tokens: 256,
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

  const obj = parsed as { score?: unknown; reasoning?: unknown };
  const score = clamp01(Number(obj.score));
  const reasoning =
    typeof obj.reasoning === "string"
      ? obj.reasoning.slice(0, 200)
      : "理由情報がありません";

  return { score, reasoning };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

