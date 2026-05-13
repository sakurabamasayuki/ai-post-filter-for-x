import * as React from "react";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

const variantClassMap: Record<BadgeVariant, string> = {
  default:
    "border-transparent bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20",
  secondary:
    "border-transparent bg-slate-500/15 text-slate-300 hover:bg-slate-500/20",
  outline:
    "border-border text-foreground bg-transparent hover:bg-accent hover:text-accent-foreground",
  destructive:
    "border-transparent bg-red-500/15 text-red-300 hover:bg-red-500/20",
};

export function Badge({
  className = "",
  variant = "default",
  ...props
}: BadgeProps) {
  const classes = [
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
    variantClassMap[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes} {...props} />;
}
