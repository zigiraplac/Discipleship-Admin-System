import Link from "next/link";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

/** Last tile in the Cohorts grid — admin only (the only role that can
 * create a cohort). Dashed placeholder, links straight to the wizard. */
export function NewCohortTile() {
  return (
    <Link
      href="/cohorts/new"
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed p-6 text-center transition-colors hover:bg-hover"
      )}
      style={{ minHeight: 190, borderColor: "var(--color-dashed)" }}
    >
      <Plus size={28} className="text-ink-faint" />
      <div className="text-[13px] font-semibold text-ink">New cohort</div>
      <div className="text-xs text-ink-muted">Import students, set the days, generate</div>
    </Link>
  );
}
