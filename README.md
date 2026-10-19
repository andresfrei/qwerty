# Qwerty MVP web

Run the MVP at **https://qwerty.localhost** through the existing trusted local Portless HTTPS proxy.

## Quick start

Prerequisites: Node 24.21.0, pnpm 11.20.0, global Portless 0.15.5 and its existing trusted HTTPS proxy, and protected configuration for the remote Supabase backend. Supabase is remote-only; do not start Docker/local Supabase for this workflow.

From the MVP worktree (`/home/andresfrei/dev/qwerty-mvp`):

```sh
pnpm dev --hostname 127.0.0.1
```

The script already invokes Portless; do not wrap it in another `portless` command. For a start that does not synchronize `/etc/hosts`, use `PORTLESS_SYNC_HOSTS=0 pnpm dev --hostname 127.0.0.1`.

Open [https://qwerty.localhost](https://qwerty.localhost). The application may run locally; its Supabase backend must be remote. A successful app start does not establish hosted Auth or receipt integration readiness.

The root `dev` script assigns `QWERTY_SITE_URL=https://qwerty.localhost` and uses Portless's positional `qwerty` name. No project dependency is added. The shared dev/build launcher loads the optional workspace environment in JavaScript before a fresh Next process, avoiding unsupported dotenv flags in Next worker `NODE_OPTIONS`; see [startup precedence](docs/supabase-nextjs-configuration.md#startup-and-precedence).
