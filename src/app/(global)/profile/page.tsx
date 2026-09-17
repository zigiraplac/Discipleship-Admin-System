import { requireUser, roleLabel } from "@/lib/auth";
import { PageHead } from "@/components/shell/page-head";
import { NameForm, PasswordForm } from "@/components/settings/profile-form";

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Profile" subtitle="Your own account settings" />
      <div className="flex max-w-[420px] flex-col gap-4">
        <NameForm name={user.name} email={user.email} roleLabel={roleLabel(user.role)} />
        <PasswordForm />
      </div>
    </div>
  );
}
