# Configure Supabase for Next.js

Use the variable names from the [official Supabase Next.js SSR guide](https://supabase.com/docs/guides/auth/server-side/nextjs) in the ignored `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-public-key
```

Use the existing MVP project, not a new database. The two SDK packages, `@supabase/supabase-js` and `@supabase/ssr`, are already installed; no dependency installation is needed for this configuration change.

## Selection and compatibility

`getSupabaseConfig()` reads the official pair first, using statically named `process.env` properties. For compatibility, it accepts `SUPABASE_URL` plus `SUPABASE_ANON_KEY` only when **neither** official variable is defined.

If either official variable is defined, both must be nonempty and valid. An incomplete or invalid official pair fails closed; it never borrows a legacy URL or key or silently falls back to another project. Whitespace is trimmed, and the URL is returned as an origin. Existing callers retain the internal `{ url, anonKey }` result shape, where `anonKey` can hold the publishable key.

Existing URL and key guards remain: HTTPS is required except for loopback HTTP, URL credentials are rejected, and only publishable or legacy anon keys are accepted. Secret and service-role keys must never go in either public variable. Configuration validation does not verify a user's identity or prove network connectivity.

## Public connection versus privileged photo writes

Normal browser and SSR clients use the public key with the user's verified session and database authorization. A secret key is **not** a general SSR requirement. The existing trusted-photo design separately requires a server-only privileged client because its write RPCs are restricted to `service_role` and Storage has no direct client-upload policy. This change neither supplies that credential nor changes those permissions.

Do not paste keys into chat or commit `.env.local`. This change does not edit credential values, restart the application, start local Supabase, or write database fixtures.

## Focused check

From the repository root:

```sh
node --test apps/web/tests/supabase-config.test.ts
```
