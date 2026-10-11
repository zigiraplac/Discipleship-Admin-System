import { Suspense } from "react";
import { PageHead } from "@/components/shell/page-head";
import { TableSkeleton } from "@/components/ui/loading-blocks";
import { StudentsList } from "@/components/students/students-list";
import { StudentsSplit } from "@/components/students/students-split";

/** The list lives in the layout, so opening a student (/students/<id>)
 * only loads the panel — the table keeps its filter, search and page. */
export default async function StudentsLayout({
  params,
  children,
}: {
  params: Promise<{ cohortId: string }>;
  children: React.ReactNode;
}) {
  const { cohortId } = await params;
  return (
    <div className="flex flex-col gap-[18px]">
      <StudentsSplit
        list={
          <Suspense
            fallback={
              <>
                <PageHead title="Students" />
                <TableSkeleton rows={10} cols={5} />
              </>
            }
          >
            <StudentsList routeParam={cohortId} />
          </Suspense>
        }
      >
        {children}
      </StudentsSplit>
    </div>
  );
}
