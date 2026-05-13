import { describe, expect, it } from 'vitest';
import { detectJapaneseAiHeuristic } from './heuristic';

const aiExamples = [
  `重要なのは、最初に全体像を整理することです。結論として、以下の通りです。
1. 目的を明確にします。
2. 優先順位を設定します。
3. 実行計画を作成します。
最後に、継続的に改善すると良いでしょう。ご参考までに。`,

  `【結論】このテーマは中長期で重要です。ポイントは3つあります。まずは前提を確認します。次に実行可能性を見ます。最後にリスクを整理します。まとめとして、段階的な実装が妥当と言えるでしょう。`,

  `重要なのは、感覚ではなく構造で考えることですね。まずは現状を分解することですね。次に制約を確認することですね。総合すると、段階的に進めるのが妥当だと言えるでしょう。`,

  `▼結論
■ポイント
・再現性が高い
・拡張しやすい
・運用しやすい
【まとめ】この方向性は有効です。ご参考までに、スモールスタートが重要です。`,

  `という観点で整理すると、この施策は十分に検討価値があります。結論として、短期・中期・長期で分けて考えるべきです。要点は、優先順位を明確にすることだと言えるでしょう。`,

  `この件は非常に重要です。背景、理由、結論を順に整理します。まずは目的を確認します。次に必要条件を整理します。最後にまとめます。全体として合理的だと言えるでしょう。`,

  `✨重要なのは、最初の一歩を小さくすることです。🚀結論として、まずは検証から始めるのが良いでしょう。💡ポイントを整理しつつ、🎯無理のない運用設計を行うことが重要です。`,

  `以下の通りです。
1. 結論を先に示します。
2. 理由を補足します。
3. まとめを提示します。
最後に、継続改善の視点を持つことが重要です。`,

  `まずは市場環境を確認します。次に競争優位を見ます。最後に実行可能性を評価します。結論として、この戦略は有効です。要するに、順序立てて進めることが重要なのです。`,

  `【ポイント】このアプローチは再現性があります。【理由】構造化されているからです。【結論】小さく始めて改善を重ねるのが最適です。ご参考までに、定期的な見直しを推奨します。`,
];

const humanExamples = [
  `さっき駅前のパン屋で買った塩パンが思ったよりうまくて、帰り道でもう一個買えばよかったなってずっと考えてる。`,

  `今日の会議、最初は重かったのに最後は雑談で終わってしまって、なんかあの空気だけ妙に人間っぽくて笑った。`,

  `この前ゲーム配信で変なミスして、コメント欄に総ツッコミされてたけど、あれはあれで助かった。自分じゃ気づけん。`,

  `雨の日のコンビニってなんであんなに唐揚げ買いたくなるんだろ。傘たたむの面倒すぎて毎回ちょっと後悔する。`,

  `資料はまだ粗いけど、今の段階ではこれで十分かなと思ってる。詰めるところは多いけど、先に動いたほうが早そう。`,

  `新しい椅子、座り心地はいいのに脚が微妙に長くて机と合ってない。こういう惜しさ、地味に効くんだよな。`,

  `昨日のX見てたら昔の知り合いが急に流れてきてびっくりした。元気そうでよかったけど、世界せまいな。`,

  `お昼に食べたカレー、最初は甘いのに後からちゃんと辛くてよかった。店のBGMが妙に大きかったのだけ気になった。`,

  `なんとなく始めた作業が意外と進んで、逆に本命のほうが止まってる。こういう日あるよねって感じ。`,

  `今日は早く寝るつもりだったのに、動画一本だけのつもりが三本見てしまった。毎回これで失敗してる。`,
];

describe('detectJapaneseAiHeuristic', () => {
  it('AI例10個の大半を高めに判定する', () => {
    const results = aiExamples.map((text) => detectJapaneseAiHeuristic(text));
    const highScored = results.filter((result) => result.score >= 0.58);

    expect(highScored.length).toBeGreaterThanOrEqual(8);
  });

  it('人間例10個の大半を低めに判定する', () => {
    const results = humanExamples.map((text) => detectJapaneseAiHeuristic(text));
    const lowScored = results.filter((result) => result.score <= 0.4);

    expect(lowScored.length).toBeGreaterThanOrEqual(8);
  });

  it('AI例の平均スコアが人間例より十分高い', () => {
    const aiAverage =
      aiExamples
        .map((text) => detectJapaneseAiHeuristic(text).score)
        .reduce((sum, value) => sum + value, 0) / aiExamples.length;

    const humanAverage =
      humanExamples
        .map((text) => detectJapaneseAiHeuristic(text).score)
        .reduce((sum, value) => sum + value, 0) / humanExamples.length;

    expect(aiAverage).toBeGreaterThan(humanAverage + 0.22);
  });

  it('短文は判定保留として返す', () => {
    const result = detectJapaneseAiHeuristic('了解です。あとで見ます。');

    expect(result.score).toBe(0.5);
    expect(result.confidence).toBe('low');
    expect(result.reasons[0]?.rule).toBe('short-text-hold');
  });

  it('英語投稿は中立スコアを返す', () => {
    const result = detectJapaneseAiHeuristic(
      'This is a structured overview of the topic. First, clarify the goal. Next, align the stakeholders. Finally, summarize the action items.'
    );

    expect(result.score).toBe(0.5);
    expect(result.confidence).toBe('low');
    expect(result.reasons[0]?.rule).toBe('english-neutral');
  });

  it('強いAIパターンが重なると high confidence になりやすい', () => {
    const result = detectJapaneseAiHeuristic(
      `【結論】重要なのは順番です。以下の通りです。
1. 目的を整理します。
2. 前提を確認します。
3. 実行します。
最後に、まとめとして継続改善が重要だと言えるでしょう。✨🚀💡`
    );

    expect(result.score).toBeGreaterThanOrEqual(0.72);
    expect(result.confidence).toBe('high');
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});
