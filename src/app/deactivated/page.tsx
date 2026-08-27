import { LockKey } from "@phosphor-icons/react/dist/ssr";
import { requireDeactivated } from "@/lib/auth";
import { signOutAction } from "@/lib/actions/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function DeactivatedPage() {
  const { name } = await requireDeactivated();

  return (
    <main className="flex min-h-screen items-center justify-center bg-page p-6">
      <Card className="w-full max-w-sm p-6 text-center">
        <div className="mx-auto grid size-11 place-items-center rounded-full bg-accent-2-100 text-accent-2-700">
          <LockKey size={20} weight="bold" />
        </div>
        <div className="mt-3.5 text-[15px] font-bold text-ink">Account deactivated</div>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          {name}, your access to BCC Discipleship has been turned off by an admin. If this
          wasn&rsquo;t expected, reach out to your admin to have it restored.
        </p>
        <form action={signOutAction} className="mt-5">
          <Button type="submit" variant="secondary" className="w-full">
            Sign out
          </Button>
        </form>
      </Card>
    </main>
  );
}
