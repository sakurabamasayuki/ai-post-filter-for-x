import * as React from "react";

export interface SeparatorProps
  extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}

export function Separator({
  className = "",
  orientation = "horizontal",
  decorative = true,
  ...props
}: SeparatorProps) {
  const classes = [
    "shrink-0 bg-border",
    orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      role={decorative ? undefined : "separator"}
      aria-orientation={orientation}
      className={classes}
      {...props}
    />
  );
}
