import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { signInAction } from "@/lib/actions/auth";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="grid min-h-screen place-items-center bg-page p-6">
      <div className="w-full max-w-[420px] rounded-login border border-border bg-card p-8 shadow-login">
        <div className="flex items-center gap-2.5">
          <div className="grid size-[34px] flex-none place-items-center rounded-[10px] bg-accent text-base font-bold text-white">
            B
          </div>
          <div className="text-[16px] font-bold text-ink">BCC Family</div>
        </div>

        <div className="mt-6 text-2xl font-bold text-ink">Sign in</div>
        <div className="mt-1 text-[13px] text-ink-muted">Use your registered email.</div>

        {params.error && (
          <div className="mt-4 rounded-[9px] border border-accent-2-200 bg-accent-2-100 px-3 py-2.5 text-[13px] text-accent-2-700">
            {params.error}
          </div>
        )}

        <form action={signInAction} className="mt-[22px] flex flex-col gap-[13px]">
          <input type="hidden" name="next" value={params.next ?? "/"} />
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required defaultValue={params.email} className="bg-subtle" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required className="bg-subtle" />
          </div>
          <Button type="submit" className="mt-1.5 w-full">
            Sign in
            <ArrowRight size={15} />
          </Button>
        </form>
      </div>
    </div>
  );
}
