import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";

const SIZES = { sm: 30, md: 32, lg: 34, xl: 48 } as const;

export function Avatar({
  name,
  size = "sm",
  tinted = false,
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  tinted?: boolean;
  className?: string;
}) {
  const px = SIZES[size];
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center justify-center rounded-full font-bold",
        tinted ? "bg-accent-100 text-accent-800" : "bg-divider text-ink-secondary",
        className
      )}
      style={{ width: px, height: px, fontSize: px / 2.6 }}
    >
      {initials(name)}
    </span>
  );
}
