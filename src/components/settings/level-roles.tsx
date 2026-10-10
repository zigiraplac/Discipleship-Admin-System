import { Pill } from "@/components/ui/pill";
import type { OrgRole } from "@/lib/domain/types";

/** Where a person sits in the organization — read-only here; staff are
 * managed on each level's own Staff page. */
export interface LevelRole {
  unitId: string;
  unitName: string;
  levelLabel: string;
  role: OrgRole;
}

export function LevelRolePills({ roles }: { roles: LevelRole[] }) {
  if (!roles.length) return <span className="text-[13px] text-ink-faint">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <Pill key={r.unitId} tone={r.role === "leader" ? "cyan" : "grey"}>
          {r.unitName} · {r.role === "leader" ? "Leader" : "Viewer"}
        </Pill>
      ))}
    </span>
  );
}
