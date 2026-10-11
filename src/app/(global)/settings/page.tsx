import { redirect } from "next/navigation";

/** Accounts moved to the Super admin console. */
export default function SettingsPage() {
  redirect("/admin/accounts");
}
