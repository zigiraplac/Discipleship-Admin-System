import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Avatar } from "@/components/ui/avatar";
import { Pill, type PillTone } from "@/components/ui/pill";
import { roleLabel } from "@/lib/auth";
import { describeScope } from "@/lib/data/people";
import type { AppUser, Role } from "@/lib/domain/types";

const ROLE_TONE: Record<Role, PillTone> = {
  admin: "magenta",
  facilitator: "cyan",
  teacher: "grey",
  leadership: "yellow",
};

export function PeopleTable({
  people,
  scopesByUser,
  headerAction,
}: {
  people: AppUser[];
  scopesByUser: Map<string, { cohortName: string; capacity: string }[]>;
  headerAction?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex-1">
          <CardTitle>People</CardTitle>
          <CardSubtitle>Role sets what they can do. Cohort sets what they can see.</CardSubtitle>
        </div>
        {headerAction}
      </CardHeader>
      <Table>
        <THead>
          <TH>Person</TH>
          <TH>Role</TH>
          <TH>Cohorts</TH>
          <TH>State</TH>
        </THead>
        <tbody>
          {people.map((person) => (
            <TR key={person.id}>
              <TD>
                <span className="flex items-center gap-2.5">
                  <Avatar name={person.name} />
                  <span>
                    <span className="block text-[13px] font-semibold text-ink">{person.name}</span>
                    <span className="block text-[11px] text-ink-muted">{person.email}</span>
                  </span>
                </span>
              </TD>
              <TD>
                <Pill tone={ROLE_TONE[person.role]}>{roleLabel(person.role)}</Pill>
              </TD>
              <TD className="text-[13px] text-ink-secondary">
                {describeScope(person.role, scopesByUser.get(person.id))}
              </TD>
              <TD className="text-xs text-ink-muted">{person.state === "active" ? "Active" : "Invited"}</TD>
            </TR>
          ))}
          {people.length === 0 && (
            <TR>
              <TD colSpan={4} className="py-6 text-center text-ink-faint">
                No people yet.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </Card>
  );
}
