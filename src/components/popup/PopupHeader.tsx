import { Badge } from "../ui/badge";

type PopupHeaderProps = {
  enabled: boolean;
};

export function PopupHeader({ enabled }: PopupHeaderProps) {
  return (
    <div className="flex w-full items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-base font-bold leading-tight">
          AI Post Filter for X
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Popup control panel
        </div>
      </div>

      <Badge variant={enabled ? "default" : "secondary"}>
        {enabled ? "Enabled" : "Disabled"}
      </Badge>
    </div>
  );
}
