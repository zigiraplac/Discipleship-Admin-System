import { redirect } from "next/navigation";

/** Crusades now live on the Activities page; old links (notifications,
 * bookmarks) land there. */
export default async function CrusadesPage({ params }: { params: Promise<{ cohortId: string }> }) {
  const { cohortId } = await params;
  redirect(`/c/${cohortId}/activities`);
}
