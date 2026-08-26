import Image from "next/image";
import { Lock, Quotes, Sparkle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { signInAction } from "@/lib/actions/auth";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { PasswordField } from "./password-field";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string; next?: string }>;
}) {
  const params = await searchParams;
  const year = new Date().getFullYear();

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      <div className="relative hidden min-h-screen flex-col items-center justify-between overflow-hidden bg-[#0a0a0c] p-16 text-white lg:flex lg:w-1/2">
        <div className="absolute -left-24 -top-24 size-96 rounded-full bg-accent/30 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 size-96 rounded-full bg-accent/20 blur-3xl" />

        <div className="relative flex max-w-md flex-col items-center pt-4 text-center">
          <Image
            src="/logo.jpg"
            alt="Bible Communication Center"
            width={128}
            height={128}
            className="size-32 rounded-full border-2 border-white/20 bg-white p-1.5 ring-4 ring-accent/25 object-cover"
          />
          <div className="mt-5">
            <div className="font-serif text-4xl font-extrabold tracking-tight [text-shadow:0_0_24px_rgba(143,180,240,0.45)]">
              BCC Discipleship
            </div>
            <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-white/65">
              Equipping and tracking disciples through intentional, structured formation.
            </p>
          </div>
        </div>

        <div className="relative z-10 my-auto w-full max-w-lg py-6">
          <div className="relative space-y-4 rounded-3xl bg-slate-900/60 p-8 shadow-2xl backdrop-blur-md">
            <Quotes size={32} weight="fill" className="text-accent-300 opacity-80" />
            <p className="font-serif text-sm italic leading-relaxed tracking-wide text-slate-200 lg:text-base">
              &ldquo;To prepare/raise an army (a race) of life givers disciples, totally consecrated to
              the Lord Jesus Christ, restored and from different backgrounds but interconnected in a
              family spirit, restored, trained and sent determined to proclaim Jesus Christ the Lord of
              this generation.&rdquo;
            </p>
            <div className="flex items-center gap-1.5 border-t border-white/15 pt-3 font-sans text-[11px] font-extrabold uppercase tracking-widest text-accent-300">
             
              Vision Statement · BCC
            </div>
          </div>
        </div>

        <p className="relative text-center text-xs text-slate-400">
          © {year} BCC Discipleship · All rights reserved
        </p>
      </div>

      {/* Pinned to its light values regardless of the visitor's theme —
          same idea as the panel opposite always being dark. Without this,
          a dark-OS visitor gets these token classes flipped to dark-mode
          values while sitting on the hardcoded white background above,
          which reads as near-invisible text on a white panel. */}
      <div
        className="flex min-h-screen w-full items-center justify-center bg-white p-8 sm:p-12 lg:w-1/2 lg:p-16"
        style={
          {
            "--color-card": "#ffffff",
            "--color-subtle": "#f8f9fa",
            "--color-border": "#e4e7eb",
            "--color-ink": "#1b1f24",
            "--color-ink-secondary": "#4b5563",
            "--color-ink-muted": "#7c848e",
            "--color-ink-faint": "#9aa1a9",
            "--color-accent-2-100": "#fdecec",
            "--color-accent-2-200": "#fbd3d3",
            "--color-accent-2-700": "#8f1d1d",
          } as React.CSSProperties
        }
      >
        <div className="w-full max-w-md space-y-8">
          <div>
            <div className="font-serif text-3xl font-extrabold tracking-tight text-ink">Welcome back</div>
            <div className="mt-2 text-[13px] text-ink-muted">Sign in to your account to continue.</div>
          </div>

          <form action={signInAction} className="flex flex-col gap-6">
            <input type="hidden" name="next" value={params.next ?? "/"} />
            <div>
              <Label htmlFor="email" className="text-[11px] uppercase tracking-wide">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                defaultValue={params.email}
                className="h-12 rounded-xl bg-subtle px-4"
              />
            </div>

            <PasswordField />

            {params.error && (
              <div className="flex items-center gap-2 rounded-xl border border-accent-2-200 bg-accent-2-100 p-3.5 text-[13px] text-accent-2-700">
                <WarningCircle size={16} className="flex-none" />
                {params.error}
              </div>
            )}

            <SubmitButton className="h-12 w-full rounded-xl" pendingLabel="Signing in…">
              <Lock size={16} />
              Sign in
            </SubmitButton>
          </form>
        </div>
      </div>
    </main>
  );
}
