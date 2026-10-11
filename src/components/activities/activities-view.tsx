"use client";

import { useMemo, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { cn, formatShortDate } from "@/lib/utils";
import { ACTIVITIES_MIGRATION_APPLIED, ACTIVITY_STATUS_LABELS, activityKinds, type ActivityStatus } from "@/lib/domain/activities";
import type { Activity } from "@/lib/data/activities";
import { ActivityDrawer } from "./activity-drawer";

const CRUSADES = "crusades";

const STATUS_TONE: Record<ActivityStatus, PillTone> = { planned: "grey", done: "green", not_done: "magenta" };

/** Tabs: Crusades (generated from the schedule) first, then one table per
 * kind of occasional activity. Adding or editing opens a right drawer. */
export function ActivitiesView({
  cohortId,
  crusades,
  activities,
  canEdit,
  today,
}: {
  cohortId: string;
  /** The Crusades tab's content, rendered by the page. */
  crusades: React.ReactNode;
  activities: Activity[];
  canEdit: boolean;
  today: string;
}) {
  const kinds = useMemo(() => activityKinds(activities.map((a) => a.kind)), [activities]);
  const [tab, setTab] = useState<string>(CRUSADES);
  const [open, setOpen] = useState(false);
  // Kept after closing so the drawer's content stays put while it slides out.
  const [editing, setEditing] = useState<{ activity: Activity | null; key: number } | null>(null);

  const currentKind = tab === CRUSADES ? kinds[0] : tab;

  // Until migration 0045 is applied, the page is just the Crusades table.
  if (!ACTIVITIES_MIGRATION_APPLIED) return <div className="flex flex-col gap-4">{crusades}</div>;

  function openDrawer(activity: Activity | null) {
    setEditing({ activity, key: Date.now() });
    setOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[{ value: CRUSADES, label: "Crusades" }, ...kinds.map((k) => ({ value: k, label: k }))]}
          value={tab}
          onChange={setTab}
          className="w-fit max-w-full flex-wrap"
        />
        {canEdit && (
          <Button type="button" size="sm" onClick={() => openDrawer(null)}>
            <Plus size={13} weight="bold" />
            Add activity
          </Button>
        )}
      </div>

      <div className={tab === CRUSADES ? "flex flex-col gap-4" : "hidden"}>{crusades}</div>

      {tab !== CRUSADES && (
        <ActivityTable
          kind={tab}
          rows={activities.filter((a) => a.kind === tab)}
          canEdit={canEdit}
          onOpen={openDrawer}
        />
      )}

      {canEdit && (
        <Dialog open={open} onOpenChange={setOpen}>
          {editing && (
            <ActivityDrawer
              key={editing.key}
              cohortId={cohortId}
              activity={editing.activity}
              kinds={kinds}
              defaultKind={currentKind}
              today={today}
              onSaved={(kind) => {
                setOpen(false);
                if (kind) setTab(kind);
              }}
            />
          )}
        </Dialog>
      )}
    </div>
  );
}

function ActivityTable({
  kind,
  rows,
  canEdit,
  onOpen,
}: {
  kind: string;
  rows: Activity[];
  canEdit: boolean;
  onOpen: (activity: Activity) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <Table>
        <THead>
          <TH>Date</TH>
          <TH>Theme</TH>
          <TH>Preacher</TH>
          <TH>Comment</TH>
          <TH align="right">Status</TH>
        </THead>
        <tbody>
          {rows.map((a) => (
            <TR
              key={a.id}
              className={cn(canEdit && "cursor-pointer hover:bg-hover focus-visible:bg-hover focus-visible:outline-none")}
              tabIndex={canEdit ? 0 : undefined}
              onClick={canEdit ? () => onOpen(a) : undefined}
              onKeyDown={
                canEdit
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpen(a);
                      }
                    }
                  : undefined
              }
            >
              <TD className="whitespace-nowrap font-semibold text-ink">{formatShortDate(a.date)}</TD>
              <TD className="text-ink-secondary">{a.theme ?? "—"}</TD>
              <TD className="text-ink-secondary">{a.preacher ?? "—"}</TD>
              <TD className="max-w-[260px] truncate text-ink-muted">{a.notes ?? "—"}</TD>
              <TD align="right">
                <Pill tone={STATUS_TONE[a.status]}>{ACTIVITY_STATUS_LABELS[a.status]}</Pill>
              </TD>
            </TR>
          ))}
          {rows.length === 0 && (
            <TR>
              <TD colSpan={5} className="py-6 text-center text-ink-faint">
                No {kind.toLowerCase()} recorded yet.{canEdit && " Use Add activity to plan one."}
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </Card>
  );
}
