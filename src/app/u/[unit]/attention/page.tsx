import { PageHead } from "@/components/shell/page-head";
import { LevelHeader } from "@/components/network/level-header";
import { AttentionTable } from "@/components/network/level-tables";
import { issueRows, loadLevelPage } from "@/lib/data/org-view";
import { LEVELS } from "@/lib/domain/levels";
import { ISSUE_LABELS, ISSUE_ORDER, type IssueKind } from "@/lib/domain/rollup";
import type { IssueRow } from "@/lib/data/org-view";

export default async function LevelAttentionPage({
  params,
  searchParams,
}: {
  params: Promise<{ unit: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { unit: slug } = await params;
  const { unit, report, searchParams: sp } = await loadLevelPage(slug, searchParams);
  // Responsibility-bounded: a church or promotion sees its cohorts' issues;
  // higher levels see each direct child's issues added up — counts only, no
  // names below the child (its leader has the detail).
  const rows = unit.type === "site" || unit.type === "promotion" ? issueRows(report) : perChild(issueRows(report));
  const kindParam = Array.isArray(sp.kind) ? sp.kind[0] : sp.kind;
  const initialKind = ISSUE_ORDER.includes(kindParam as IssueKind) ? (kindParam as IssueKind) : "all";

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Needs attention" subtitle={unit.name} />
      <LevelHeader levelLabel={LEVELS[unit.type].label} partOf={report.ancestors.map((a) => a.name).join(" › ")} />
      <AttentionTable rows={rows} initialKind={initialKind} childLabel={rows[0]?.childLevel ?? "Place"} />
    </div>
  );
}

function perChild(rows: IssueRow[]): IssueRow[] {
  const by = new Map<string, IssueRow>();
  for (const r of rows) {
    const key = `${r.childId}:${r.kind}`;
    const prev = by.get(key);
    const count = (prev?.count ?? 0) + r.count;
    by.set(key, {
      ...r,
      count,
      severity: prev?.severity === "urgent" || r.severity === "urgent" ? "urgent" : "watch",
      text: `${count} ${ISSUE_LABELS[r.kind].summary}`,
      cohortId: r.childId,
      path: [],
    });
  }
  return [...by.values()];
}
