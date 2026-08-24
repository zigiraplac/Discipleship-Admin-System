# BCC Console

A role-based discipleship operations platform for running Bible-study cohorts — attendance,
a follow-up loop for students who fall behind, and the calendar/reports that come from it.
Built with Next.js 16, React 19, TypeScript, Tailwind CSS v4, Base UI, and Supabase
Postgres, from the design spec bundle in this repo's history (product brief, domain model,
screen-by-screen spec, design tokens, RBAC rules).

## Setup

1. **Create a Supabase project** (or use an existing one) at [supabase.com](https://supabase.com).
2. **Copy env vars**: `cp .env.local.example .env.local` and fill in, from your project's
   Settings → API page:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` — needed by the bootstrap script and the cohort-creation and
     invite-person server actions.
   - `SEED_ADMIN_NAME` / `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — your one super-admin
     account, created in step 5.
   - `NEXT_PUBLIC_SITE_URL` — where the app runs (`http://localhost:3000` for local dev).
     Used to build the link in a person's invite email.
3. **Run the migrations, in order** — paste each of `supabase/migrations/0001_init.sql` and
   `supabase/migrations/0002_self_activate.sql` into the SQL editor in the Supabase dashboard
   and run it (or, with the Supabase CLI linked to your project: `supabase db push`). These
   create every table, RLS policy, and the SECURITY DEFINER functions the app depends on.
4. **Add the redirect URL** — in the Supabase dashboard, Auth → URL Configuration → Redirect
   URLs, add `{NEXT_PUBLIC_SITE_URL}/auth/set-password` (e.g.
   `http://localhost:3000/auth/set-password`). Without this, invite emails will fail to sign
   people in.
5. **Install dependencies**: `npm install`.
6. **Create your admin account**: `npm run bootstrap-admin`. This is the *only* seeding this
   project does — no demo data, no demo cohorts. Everything else happens from inside the app:
   sign in as that admin, use Settings → People → **Add person** to invite facilitators,
   teachers, and leadership (they get a real Supabase Auth email invite that lands on
   `/auth/set-password` for them to choose a password), and use **New cohort** to create a
   cohort from your own registration CSV, uploaded through the wizard. The curriculum
   reference data (7 classes / 80 lessons) provisions itself automatically the first time you
   create a cohort — there's no separate step for it.
7. **Run it**: `npm run dev`, then sign in at `/login` with the admin account from step 6.

> Person invites use `supabase.auth.admin.inviteUserByEmail`, which requires an email
> provider configured in your Supabase project (Auth → Providers → Email is on by default on
> new projects, but check Auth → Emails if invites aren't arriving).

## Project shape

- `src/lib/domain/` — pure, framework-free domain logic: the 80-lesson curriculum
  (`curriculum.ts`), the event generator (`generator.ts`), derived-metric formulas
  (`metrics.ts`, `bands.ts`), and the CSV import/dedupe rules (`registrations.ts`). No
  Supabase imports here — this is the one place both a server action and (if ever needed) a
  client preview can share the exact same logic.
- `src/lib/data/` — typed read queries against Supabase, one file per entity. Two lesson-data
  paths exist on purpose: `getLessonEvents` (full register content, for
  facilitator/admin/leadership) and `getLessonEventsPublic` (aggregate-only, for teacher, who
  is excluded from per-student attendance by RLS — see the note atop the migration).
  `curriculum-admin.ts` idempotently provisions the fixed curriculum the first time it's
  needed.
- `src/lib/actions/` — server actions (mutations): `saveRegister`, `recordOutcome`,
  `createCohort` (+ the wizard's `getRegistrationPreview`, both driven by an admin-uploaded
  CSV, nothing on disk), `updateBands`, `invitePerson`.
- `src/lib/supabase/` — the three client flavours (`browser.ts`, `server.ts` for RSC/actions,
  `admin.ts` service-role for the bootstrap script, cohort creation, and person invites) plus
  the hand-maintained `database.types.ts`. Regenerate that file for real once the project is
  live: `npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts`.
- `src/components/ui/` — the design-token-driven primitives (Card, Button, Pill, ProgressBar,
  Table, Dialog, Popover, Toast, ...). Everything else is built from these.
- `src/components/shell/` — the sidebar/top-bar/search-palette chrome, assembled once in
  `shell.tsx` and reused by both the cohort-scoped layout (`src/app/c/[cohortId]/layout.tsx`)
  and the global layout (`src/app/(global)/layout.tsx`, for `/cohorts` and `/settings`).
- `src/proxy.ts` — session-refresh + auth-gate proxy (Next.js 16's renamed `middleware`
  convention).

## What's deliberately simplified

- **RBAC is enforced at the database (RLS + two SECURITY DEFINER functions), not just in the
  UI.** A teacher's client genuinely cannot fetch another student's attendance row; the app
  never relies on hiding a button. See the comment atop `supabase/migrations/0001_init.sql`.
- **Cohort creation isn't wrapped in a single Postgres transaction yet.** It's a sequence of
  service-role inserts from a server action; a failure partway through can leave a cohort
  with students but no schedule. Flagged in `src/lib/actions/cohorts.ts` — harden with a
  single `plpgsql` function if this becomes a real risk.
- **Crusade outcomes (souls reached / conversions / follow-ups) have no real data model.**
  The Reports screen shows `—` for these rather than inventing plausible numbers — there's a
  real open product question about whether these are tracked per day, per team, or once per
  weekend.
- **DOB parsing is genuinely ambiguous** for two-number values with no format hint (`05-07`
  could be day-first or month-first) — resolved consistently as day-first, documented in
  `src/lib/domain/registrations.ts`. It only ever affects a birthday reminder, never
  attendance or standing.
- **Settings' status-band panel is editable**, improving on the original design reference
  (which left it read-only) — the schema was always designed for it
  (`updateBands` + `org_setting`).
- **A person's account state flips "Invited" → "Active" the moment they finish setting a
  password** on `/auth/set-password` (`activate_self()` in
  `supabase/migrations/0002_self_activate.sql`) — not on next sign-in, and there's no
  password-reset flow yet (only the initial invite).
