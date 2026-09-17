import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PillTone } from "@/components/ui/pill";

export interface QuickAction {
  label: string;
  href: string;
  icon: Icon;
  tone: PillTone;
}

// Solid, saturated backgrounds rather than the app's usual pastel pill
// tones — these are the buttons meant to catch the eye first on the page,
// not a status label that needs to stay quiet.
const VIVID_CLASSES: Record<PillTone, string> = {
  cyan: "bg-accent text-white",
  // `--color-yellow` is deliberately identical in both themes (see
  // globals.css), but `text-yellow-ink` is NOT — it's meant for the pale
  // yellow-100 pill pairing and flips to a light gold in dark mode, which
  // would put light text on this same bright yellow background. Hardcoded
  // to match `--color-yellow-ink`'s light-mode value on purpose, so this
  // solid yellow button reads the same (dark text) in both themes.
  yellow: "bg-yellow text-[#7a5c00]",
  magenta: "bg-accent-2-500 text-white",
  grey: "bg-neutral-border text-ink",
  green: "bg-emerald-500 text-white",
  violet: "bg-violet-500 text-white",
  teal: "bg-teal-500 text-white",
  sky: "bg-sky-500 text-white",
  amber: "bg-amber-500 text-white",
};

/** Shortcuts to the handful of things a facilitator actually comes to the
 * Dashboard to go do next — not a chart, just faster navigation than the
 * sidebar for the most common next steps. Each caller passes only the
 * actions its role can actually perform (not just view — see page.tsx's
 * per-action gating), and "Add student"/"Record lesson" deep-link straight
 * to the actual form/register instead of just the list page, so the
 * button does what it says without the user having to go find it. */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null;
  return (
    <Card className="p-4">
      <div className="text-[15px] font-bold text-ink">Quick actions</div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.label}
              href={a.href}
              className={cn(
                "flex flex-col items-start gap-2 rounded-control p-3 text-[13px] font-bold shadow-sm transition hover:brightness-110 active:brightness-95",
                VIVID_CLASSES[a.tone]
              )}
            >
              <Icon size={20} weight="bold" />
              {a.label}
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
