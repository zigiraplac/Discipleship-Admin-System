import { Shell } from "@/components/shell/shell";

/** The Super admin console: accounts, countries, promotions and cohorts
 * worldwide — its own workspace, apart from Global HQ.
 * TODO(permissions): open to every signed-in user for now, on purpose. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell cohortParam={null} adminConsole>
      {children}
    </Shell>
  );
}
