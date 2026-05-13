import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";

interface Props {
  version: string;
}

export function AboutTab({ version }: Props): JSX.Element {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <strong>Version:</strong>
            <Badge variant="secondary">{version}</Badge>
          </div>
          <div>
            <strong>License:</strong> Proprietary / Internal evaluation build
          </div>
          <div>
            <strong>Author:</strong> AI Post Filter Team
          </div>
          <Separator className="my-2" />
          <p className="text-muted-foreground">
            このツールは X (旧 Twitter) のタイムライン上の投稿を、
            機械学習モデルとヒューリスティクスで評価し、AI 生成と推定される
            投稿を非表示・ぼかし・ラベル表示する Chrome 拡張機能です。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>利用規約</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            本拡張機能の判定結果は参考情報であり、最終判断はユーザーの責任において行ってください。
          </p>
          <p>
            判定アルゴリズムは継続的に更新されますが、誤判定が発生する可能性があります。
            重要な判断には必ず人間による確認を併用してください。
          </p>
          <p>
            本拡張機能のリバースエンジニアリング、二次配布、商用転売を禁止します。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>プライバシーポリシー</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            投稿テキスト・判定結果・統計データは原則として、ユーザー端末内のローカルストレージにのみ保存されます。
          </p>
          <p>
            ユーザーが「リモート(クラウド)」エンジンを明示的に有効化した場合に限り、
            投稿テキストの一部が判定サーバーへ送信されます。
          </p>
          <p>
            個人を特定できる情報(アカウント名・ID・連絡先など)は収集しません。
          </p>
          <p>
            ライセンスキー認証時のみ、暗号化された認証情報を弊社サーバーと交信します。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
