import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Switch } from "../ui/switch";
import { Slider } from "../ui/slider";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import { Badge } from "../ui/badge";
import type {
  AppSettings,
  EngineSettings,
} from "../../lib/storage";

interface Props {
  settings: AppSettings;
  onChange: (
    updater:
      | Partial<AppSettings>
      | ((prev: AppSettings) => Partial<AppSettings>)
  ) => Promise<void> | void;
}

type EngineKey = "heuristic" | "account" | "ml" | "remote";

// ★ 修正: エンジン名をUIに統一 & 順番も合わせた
const ENGINES: Array<{
  key: EngineKey;
  label: string;
  description: string;
  enabledField: keyof EngineSettings;
}> = [
  {
    key: "heuristic",
    label: "ヒューリスティック",
    description: "テキストパターンや特徴語に基づくルールベース判定",
    enabledField: "heuristicEnabled",
  },
  {
    key: "account",
    label: "アカウント評価",
    description: "アカウント単位の過去判定履歴を活用",
    enabledField: "accountEnabled",
  },
  {
    key: "ml",
    label: "機械学習",
    description: "ONNX/Transformers モデルによる本文ベースのスコアリング(推奨)",
    enabledField: "mlEnabled",
  },
  {
    key: "remote",
    label: "リモート(クラウド)",
    description: "サーバー側 LLM 連携(有料プラン)",
    enabledField: "remoteEnabled",
  },
];

export function DetectionEngineTab({
  settings,
  onChange,
}: Props): JSX.Element {
  const totalWeight =
    settings.engine.weights.heuristic +
    settings.engine.weights.account +
    settings.engine.weights.ml +
    settings.engine.weights.remote;

  const updateEnabled = (field: keyof EngineSettings, value: boolean) => {
    void onChange({
      engine: {
        ...settings.engine,
        [field]: value,
      } as EngineSettings,
    });
  };

  const updateWeight = (key: EngineKey, percent: number) => {
    void onChange({
      engine: {
        ...settings.engine,
        weights: {
          ...settings.engine.weights,
          [key]: Math.max(0, Math.min(1, percent / 100)),
        },
      },
    });
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>検出エンジン</CardTitle>
          <CardDescription>
            各エンジンの有効化と重みを調整します。重みの合計は最終スコア算出時に正規化されます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {ENGINES.map((engine, idx) => {
            const enabled = settings.engine[engine.enabledField] as boolean;
            const weight = settings.engine.weights[engine.key];
            const weightPercent = Math.round(weight * 100);

            return (
              <React.Fragment key={engine.key}>
                {idx > 0 && <Separator />}
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Label className="text-base font-semibold">
                          {engine.label}
                        </Label>
                        <Badge variant={enabled ? "default" : "secondary"}>
                          {enabled ? "ON" : "OFF"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {engine.description}
                      </p>
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={(value) =>
                        updateEnabled(engine.enabledField, value)
                      }
                      aria-label={`${engine.label}の有効化`}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <Label>重み</Label>
                      <span className="font-mono tabular-nums">
                        {weightPercent}%
                      </span>
                    </div>
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={[weightPercent]}
                      onValueChange={(values) => {
                        const v = values[0] ?? weightPercent;
                        updateWeight(engine.key, v);
                      }}
                      disabled={!enabled}
                      aria-label={`${engine.label}の重み`}
                    />
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>重みの合計</CardTitle>
          <CardDescription>
            推奨は約 1.00。離れていても動作しますが、スコアが偏りやすくなります。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm">合計</span>
            <span className="font-mono text-lg tabular-nums">
              {totalWeight.toFixed(2)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
