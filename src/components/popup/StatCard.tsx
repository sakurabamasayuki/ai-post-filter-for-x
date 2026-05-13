import { Card, CardContent } from "../ui/card";

type StatCardProps = {
  title: string;
  value: string | number;
  helper?: string;
};

export function StatCard({ title, value, helper }: StatCardProps) {
  return (
    <Card className="border-border/70 bg-background/40">
      <CardContent className="p-3">
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">
            {title}
          </p>
          <p className="text-lg font-bold leading-none tracking-tight">
            {value}
          </p>
          {helper ? (
            <p className="text-[10px] leading-snug text-muted-foreground">
              {helper}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
