import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";

const SIZES = { sm: 30, md: 32, lg: 34, xl: 48 } as const;

// A small rotation of hues distinct from the app's semantic status colors
// (accent/accent-2/yellow) — purely so a roster full of initials isn't a
// wall of identical grey circles, the same way each person gets their own
// consistent color in a chat or activity feed.
const NAME_PALETTE = [
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
] as const;

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function Avatar({
  name,
  size = "sm",
  tinted = false,
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  /** Force the brand-blue tint instead of the per-name color — for the
   * signed-in user's own avatar and other single, always-blue contexts. */
  tinted?: boolean;
  className?: string;
}) {
  const px = SIZES[size];
  const nameClasses = NAME_PALETTE[hashName(name) % NAME_PALETTE.length];
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center justify-center rounded-full font-bold",
        tinted ? "bg-accent-100 text-accent-800" : nameClasses,
        className
      )}
      style={{ width: px, height: px, fontSize: px / 2.6 }}
    >
      {initials(name)}
    </span>
  );
}
