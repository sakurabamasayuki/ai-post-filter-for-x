import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Slider } from "../ui/slider";
import { Switch } from "../ui/switch";
import type { AppSettings, ThemeMode, ViewMode } from "../../lib/storage";

type SettingsSectionProps = {
  settings: AppSettings;
  thresholdPercent: number;
  onEnabledChange: (enabled: boolean) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onThresholdPreview: (value: number) => void;
  onThresholdCommit: (value: number) => void;
  onThemeChange: (theme: ThemeMode) => void;
};

const viewModes: Array<{ value: ViewMode; label: string }> = [
  { value: "blur", label: "ぼかし" },
  { value: "hide", label: "完全非表示" },
  { value: "label", label: "ラベルのみ" },
];

const themes: Array<{ value: ThemeMode; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function SettingsSection({
  settings,
  thresholdPercent,
  onEnabledChange,
  onViewModeChange,
  onThresholdPreview,
  onThresholdCommit,
  onThemeChange,
}: SettingsSectionProps) {
  return (
    <Card className="border-border/70 bg-background/40">
      <CardContent className="space-y-5 p-4">
        <section
          aria-labelledby="popup-enabled-heading"
          className="space-y-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2
                id="popup-enabled-heading"
                className="text-sm font-semibold leading-none"
              >
                拡張機能
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {settings.enabled
                  ? "投稿フィルタは有効です"
                  : "投稿フィルタは無効です"}
              </p>
            </div>

            <Switch
              checked={settings.enabled}
              onCheckedChange={onEnabledChange}
              aria-label="拡張機能の有効化"
            />
          </div>
        </section>

        <section
          aria-labelledby="popup-viewmode-heading"
          className="space-y-3"
        >
          <div>
            <h2
              id="popup-viewmode-heading"
              className="text-sm font-semibold leading-none"
            >
              表示モード
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              AIっぽい投稿の見せ方を選択します
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {viewModes.map((mode) => {
              const active = settings.viewMode === mode.value;

              return (
                <Button
                  key={mode.value}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className="h-9 text-xs"
                  aria-pressed={active}
                  onClick={() => onViewModeChange(mode.value)}
                >
                  {mode.label}
                </Button>
              );
            })}
          </div>
        </section>

        <section
          aria-labelledby="popup-threshold-heading"
          className="space-y-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2
                id="popup-threshold-heading"
                className="text-sm font-semibold leading-none"
              >
                しきい値
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                50%〜100% で調整します
              </p>
            </div>

            <div className="text-sm font-semibold tabular-nums">
              {thresholdPercent}%
            </div>
          </div>

          <Slider
            min={50}
            max={100}
            step={1}
            value={[thresholdPercent]}
            aria-label="AI判定しきい値"
            onValueChange={(values) => {
              const next = values[0] ?? thresholdPercent;
              onThresholdPreview(next);
            }}
            onValueCommit={(values) => {
              const next = values[0] ?? thresholdPercent;
              onThresholdCommit(next);
            }}
          />
        </section>

        <section aria-labelledby="popup-theme-heading" className="space-y-3">
          <div>
            <h2
              id="popup-theme-heading"
              className="text-sm font-semibold leading-none"
            >
              テーマ
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              システム追従と手動切替に対応
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {themes.map((theme) => {
              const active = settings.theme === theme.value;

              return (
                <Button
                  key={theme.value}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className="h-9 text-xs"
                  aria-pressed={active}
                  onClick={() => onThemeChange(theme.value)}
                >
                  {theme.label}
                </Button>
              );
            })}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
