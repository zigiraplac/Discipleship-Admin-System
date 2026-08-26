/**
 * Creates exactly one super-admin account. That's the whole job — the
 * curriculum reference data provisions itself the first time a cohort is
 * created (see `src/lib/data/curriculum-admin.ts`), and every other
 * person (facilitator/teacher/leadership) is created by that admin from
 * inside the app (Settings → People → Add person), not by a script.
 *
 * Reads SEED_ADMIN_NAME / SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD from
 * .env.local. Safe to re-run against a *new* account. Also doubles as a
 * recovery tool for an existing one — if the email already has an auth
 * account, this can reset its password to whatever is currently in
 * SEED_ADMIN_PASSWORD (and makes sure its `app_user` row exists with role
 * "admin") — but only when SEED_ADMIN_ALLOW_RESET=true is also set, so a
 * stale .env.local can't silently clobber a live admin's password just by
 * someone re-running this script.
 *
 * Run with: npm run bootstrap-admin
 */
import { createAdminClient } from "@/lib/supabase/admin";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing ${name}. Set it in .env.local before running this script.`);
  }
  return v;
}

async function main() {
  const name = requiredEnv("SEED_ADMIN_NAME");
  const email = requiredEnv("SEED_ADMIN_EMAIL");
  const password = requiredEnv("SEED_ADMIN_PASSWORD");

  const admin = createAdminClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  let userId: string;
  if (created?.user) {
    userId = created.user.id;
    console.log(`Created auth account for ${email}.`);
  } else {
    let existing: { id: string } | null = null;
    for (let page = 1; page <= 50 && !existing; page++) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (listErr) throw listErr;
      existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
      if (list.users.length < 200) break;
    }
    if (!existing) throw createErr ?? new Error(`Could not create or find an auth account for ${email}.`);
    userId = existing.id;

    // A live admin's password resets to whatever's currently in
    // .env.local every time this script runs — deliberate as a recovery
    // path, but silently doing that on every re-run is exactly how a
    // stale local file quietly clobbers a real production password.
    // Require explicit intent to actually go through with it.
    if (process.env.SEED_ADMIN_ALLOW_RESET !== "true") {
      throw new Error(
        `${email} already has an account. Refusing to reset its password without SEED_ADMIN_ALLOW_RESET=true ` +
          `in .env.local — set that only when you actually intend to reset it.`
      );
    }

    const { error: pwErr } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (pwErr) throw pwErr;
    console.log(`${email} already has an auth account — reset its password to match .env.local.`);
  }

  const { error: upsertErr } = await admin.from("app_user").upsert({
    id: userId,
    name,
    email,
    role: "admin",
    state: "active",
  });
  if (upsertErr) throw upsertErr;

  console.log(`\nDone. Sign in at /login with:\n  ${email}\n  (the password in SEED_ADMIN_PASSWORD)`);
}

main().catch((err) => {
  console.error("\nBootstrap failed:", err instanceof Error ? err.message : err);
  // Not process.exit(1) — forcing exit while undici/Supabase keep-alive
  // sockets are mid-teardown can hit a libuv assertion on some platforms
  // (harmless, just noisy). Setting exitCode lets the loop drain naturally.
  process.exitCode = 1;
});
