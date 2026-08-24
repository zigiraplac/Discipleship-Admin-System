"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/browser";
import { activateAccount } from "@/lib/actions/account";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type Status = "checking" | "ready" | "invalid" | "saving" | "done";

/**
 * Where an invite (or, later, a password-reset) email link lands.
 *
 * This has to be deterministic about *whose* session it's establishing.
 * The browser Supabase client has `detectSessionInUrl: false`
 * (browser.ts) specifically so nothing auto-processes the link — instead
 * this page:
 *   1. Signs out of whatever session already exists in this browser,
 *      unconditionally. (Real bug this fixes: if the person opening the
 *      link is signed in as someone else in the same browser — e.g. an
 *      admin testing their own invite — trusting an ambient `getSession()`
 *      could return *that* session before the link's own tokens were
 *      processed, and the password form would then silently overwrite
 *      the wrong account's password.)
 *   2. Manually reads the link's own tokens from the URL and exchanges
 *      them for a session itself, so there's no "whatever happens to be
 *      current" ambiguity — the session is always the one this specific
 *      link grants, never a leftover.
 *   3. Only then shows the password form, using the user info that
 *      exchange call returned directly.
 *
 * The token this reads is one-time-use: reading it, wiping it from the
 * URL, and exchanging it for a session is *not* safe to run twice. React
 * runs every effect twice on mount in development specifically to catch
 * that kind of thing — without the `ranRef` guard below, the second run
 * would find the URL already wiped by the first and report the link
 * "expired" even though it was valid and had just been used correctly.
 * `ranRef` persists across that double-invocation (same component
 * instance, not a remount), so the exchange only ever actually runs once.
 *
 * This route is in `PUBLIC_PATHS` in `src/lib/supabase/middleware.ts` —
 * the proxy would otherwise redirect here to /login before any of this
 * client-side code runs.
 */
export default function SetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const ranRef = useRef(false);

  const [status, setStatus] = useState<Status>("checking");
  const [name, setName] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    async function establishSession() {
      // Never let a pre-existing session in this browser leak into what
      // must be a fresh claim on the link's own account.
      await supabase.auth.signOut();

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const search = new URLSearchParams(window.location.search);

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const tokenHash = search.get("token_hash");
      const otpType = search.get("type");
      const code = search.get("code");

      // Clear the URL immediately — tokens shouldn't linger in the
      // address bar or browser history, and this also stops a page
      // refresh from trying to re-process an already-used link.
      window.history.replaceState(null, "", window.location.pathname);

      let sessionUser: { user_metadata?: Record<string, unknown> } | null = null;

      if (accessToken && refreshToken) {
        const { data, error: sessErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!sessErr && data.session) sessionUser = data.session.user;
      } else if (tokenHash && otpType) {
        const { data, error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType as "invite" | "recovery" | "email",
        });
        if (!otpErr && data.session) sessionUser = data.session.user;
      } else if (code) {
        const { data, error: codeErr } = await supabase.auth.exchangeCodeForSession(code);
        if (!codeErr && data.session) sessionUser = data.session.user;
      }

      if (sessionUser) {
        setName((sessionUser.user_metadata?.name as string | undefined) ?? null);
        setStatus("ready");
      } else {
        setStatus("invalid");
      }
    }

    void establishSession();
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setStatus("saving");
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setError(updateErr.message);
      setStatus("ready");
      return;
    }
    try {
      await activateAccount();
    } catch (activateErr) {
      // Not fatal to the person signing in — but don't hide it, or a
      // real problem (e.g. a missing migration) looks identical to "it
      // just hasn't happened yet" in the People table.
      console.error("Failed to mark account active:", activateErr);
    }
    setStatus("done");
    router.push("/");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-page p-6">
      <div className="w-full max-w-[420px] rounded-login border border-border bg-card p-8 shadow-login">
        <div className="flex items-center gap-2.5">
          <div className="grid size-[34px] flex-none place-items-center rounded-[10px] bg-accent text-base font-bold text-white">
            B
          </div>
          <div className="text-[16px] font-bold text-ink">BCC Discipleship</div>
        </div>

        {status === "checking" && (
          <div className="mt-6 text-[13px] text-ink-muted">Checking your invite link…</div>
        )}

        {status === "invalid" && (
          <>
            <div className="mt-6 text-2xl font-bold text-ink">Link already used</div>
            <p className="mt-2 text-[13px] text-ink-muted">
              This link only works once, and it&rsquo;s already been opened — possibly by this
              same browser or device before now. Ask whoever invited you to send a fresh one;
              until then there&rsquo;s no password to sign in with yet.
            </p>
          </>
        )}

        {(status === "ready" || status === "saving" || status === "done") && (
          <>
            <div className="mt-6 text-2xl font-bold text-ink">
              {name ? `Welcome, ${name.split(" ")[0]}` : "Set your password"}
            </div>
            <div className="mt-1 text-[13px] text-ink-muted">Choose a password to finish setting up your account.</div>

            <form onSubmit={handleSubmit} className="mt-[22px] flex flex-col gap-[13px]">
              <div>
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-subtle"
                />
              </div>
              <div>
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="bg-subtle"
                />
              </div>
              {error && (
                <div className="rounded-[9px] border border-accent-2-200 bg-accent-2-100 px-3 py-2.5 text-[13px] text-accent-2-700">
                  {error}
                </div>
              )}
              <Button type="submit" disabled={status === "saving" || status === "done"} className="mt-1.5 w-full">
                {status === "saving" ? (
                  <>
                    <Spinner /> Saving…
                  </>
                ) : (
                  <>
                    Set password and continue
                    <ArrowRight size={15} />
                  </>
                )}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
