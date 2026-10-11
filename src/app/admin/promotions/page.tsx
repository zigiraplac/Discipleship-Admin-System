import { requireUser } from "@/lib/auth";
import { PageHead } from "@/components/shell/page-head";
import { PromotionsConsole } from "@/components/admin/promotions-console";
import { consolePromotions } from "@/lib/data/admin-console";

/** Every promotion in the world, by continent and country (?country= opens
 * on one). TODO(permissions): open to every signed-in user for now. */
export default async function ConsolePromotionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const [rows, sp] = await Promise.all([consolePromotions(), searchParams]);
  const country = Array.isArray(sp.country) ? sp.country[0] : sp.country;
  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Promotions" subtitle="Every promotion, worldwide" />
      <PromotionsConsole rows={rows} initialCountry={country} />
    </div>
  );
}
