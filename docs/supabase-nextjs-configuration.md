# Configure Supabase for Next.js

Use the variable names from the [official Supabase Next.js SSR guide](https://supabase.com/docs/guides/auth/server-side/nextjs) in the ignored workspace-root `.env.local` (`qwerty-mvp/.env.local` in the MVP worktree):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-public-key
```

Use the existing MVP project, not a new database. The two SDK packages, `@supabase/supabase-js` and `@supabase/ssr`, are already installed; no dependency installation is needed for this configuration change.

## Startup and precedence

The web `dev` and `build` scripts invoke the installed Next CLI through Node with `--env-file-if-exists=../../.env.local`. Workspace scripts run from `apps/web`, so this loads the workspace-root file before Next reads its normal app-local environment files. Root `pnpm dev` still uses Portless and its explicit `https://qwerty.localhost` site origin; no routing or proxy configuration changes.

For each variable, precedence is:

1. An explicitly inherited process value.
2. The workspace-root `.env.local` value loaded by Node.
3. Next's normal app-local defaults for values not already present.

A missing root file does not abort startup: Node reports that it is missing, then normal injected/app-local configuration continues. This is compatibility behavior, not proof that Supabase configuration is valid. Provide a matching public pair from the intended project. Node parses the root file natively; use literal values rather than relying on shell evaluation or variable expansion.

The commands require Node support for `--env-file-if-exists`; the tested runtime is Node 24.21.0. These guarantees apply to the workspace `dev` and `build` scripts, not arbitrary direct `next` invocations. Do not copy credential files between worktrees or assume their contents are interchangeable.

## Selection and compatibility

`getSupabaseConfig()` reads the official pair first, using statically named `process.env` properties. For compatibility, it accepts `SUPABASE_URL` plus `SUPABASE_ANON_KEY` only when **neither** official variable is defined.

If either official variable is defined, both must be nonempty and valid. An incomplete or invalid official pair fails closed; it never borrows a legacy URL or key or silently falls back to another project. Whitespace is trimmed, and the URL is returned as an origin. Existing callers retain the internal `{ url, anonKey }` result shape, where `anonKey` can hold the publishable key.

Existing URL and key guards remain: HTTPS is required except for loopback HTTP, URL credentials are rejected, and only publishable or legacy anon keys are accepted. Secret and service-role keys must never go in either public variable. Configuration validation does not verify a user's identity or prove network connectivity.

## Public connection versus privileged photo writes

Normal browser and SSR clients use the public key with the user's verified session and database authorization. A secret key is **not** a general SSR requirement. The existing trusted-photo design separately requires a server-only privileged client because its write RPCs are restricted to `service_role` and Storage has no direct client-upload policy. This change neither supplies that credential nor changes those permissions.

The trusted-photo runtime reads `SUPABASE_SECRET_KEY` separately from its server environment. Keep it server-only, never under a `NEXT_PUBLIC_` name. Startup loading does not rename private variables into public ones or verify the key's project/permissions.

Do not paste keys into chat or commit `.env.local`. Startup wiring changes neither credential values nor the sensitive-file access policy. Its tests use newly created synthetic files and a Next stub: they do not read actual credential files, start/restart the application, perform a real Next build, start local Supabase, or write database fixtures. Real preflight and live photo proof remain separate gated steps.

## Focused check

From the repository root:

```sh
node --test apps/web/tests/workspace-env-startup.test.mjs apps/web/tests/supabase-config.test.ts
```
