import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Slider } from "../ui/slider";
import { Separator } from "../ui/separator";
import type { AppSettings, ViewMode } from "../../lib/storage";

type PopupControlsProps = {
  settings: AppSettings;
  onToggleEnabled: (enabled: boolean) => void;
  onChangeViewMode: (mode: ViewMode) => void;
  onPreviewThreshold: (threshold: number) => void;
  onCommitThreshold: (threshold: number) => void;
  onOpenOptions: () => void;
};

export function PopupControls({
  settings,
  onToggleEnabled,
  onChangeViewMode,
  onPreviewThreshold,
  onCommitThreshold,
  onOpenOptions,
}: PopupControlsProps) {
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Filter</div>
          <div className="text-xs text-muted-foreground">
            {settings.enabled
              ? "投稿フィルタは有効です"
              : "投稿フィルタは無効です"}
          </div>
        </div>

        <Switch
          checked={settings.enabled}
          onCheckedChange={(checked) => onToggleEnabled(checked)}
        />
      </div>

      <Separator />

      <div className="grid gap-2">
        <div className="text-sm font-semibold">View mode</div>

        <div className="flex gap-2">
          <Button
            variant={settings.viewMode === "blur" ? "default" : "outline"}
            size="sm"
            onClick={() => onChangeViewMode("blur")}
          >
            Blur
          </Button>

          <Button
            variant={settings.viewMode === "hide" ? "default" : "outline"}
            size="sm"
            onClick={() => onChangeViewMode("hide")}
          >
            Hide
          </Button>

          <Button
            variant={settings.viewMode === "label" ? "default" : "outline"}
            size="sm"
            onClick={() => onChangeViewMode("label")}
          >
            Label
          </Button>
        </div>
      </div>

      <Separator />

      <div className="grid gap-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">Threshold</span>
          <span className="text-muted-foreground">
            {settings.threshold.toFixed(2)}
          </span>
        </div>

        <Slider
          min={0}
          max={1}
          step={0.01}
          value={[settings.threshold]}
          onValueChange={(value) => {
            const next = value[0] ?? settings.threshold;
            onPreviewThreshold(next);
          }}
          onValueCommit={(value) => {
            const next = value[0] ?? settings.threshold;
            onCommitThreshold(next);
          }}
        />
      </div>

      <Separator />

      <Button variant="outline" onClick={onOpenOptions}>
        Open Options
      </Button>
    </div>
  );
}
