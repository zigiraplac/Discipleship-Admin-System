import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-card border border-border bg-card", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-3 border-b border-divider px-[18px] py-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("text-[15px] font-bold text-ink", className)} {...props} />;
}

export function CardSubtitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-0.5 text-xs text-ink-muted", className)} {...props} />;
}
