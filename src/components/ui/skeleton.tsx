import { cn } from "@/lib/utils";

/** A pulsing placeholder block — sized via className (e.g. `h-4 w-24`) to
 * stand in for text, a chart, a card, or a table row while its real
 * content is still loading. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-[6px] bg-divider", className)} {...props} />;
}
