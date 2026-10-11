import { requireUser } from "@/lib/auth";
import { PageHead } from "@/components/shell/page-head";
import { CountriesConsole } from "@/components/admin/countries-console";
import { consoleCountries } from "@/lib/data/admin-console";

/** Every country in the world, by continent, with what BCC has there.
 * TODO(permissions): open to every signed-in user for now. */
export default async function ConsoleCountriesPage() {
  await requireUser();
  const rows = await consoleCountries();
  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Countries" subtitle="Where BCC is, worldwide" />
      <CountriesConsole rows={rows} />
    </div>
  );
}
