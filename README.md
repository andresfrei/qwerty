# Qwerty MVP web

Run the MVP at **https://qwerty.localhost** through the existing trusted local Portless HTTPS proxy.

## Quick start

Prerequisites: Node.js 26.5.1, pnpm 11.20.0, Docker running, and global Portless 0.15.5 with its trusted local HTTPS proxy already configured.

From the repository root, start local Supabase and the web app:

```sh
pnpm exec supabase start
pnpm dev
```

Open [https://qwerty.localhost](https://qwerty.localhost). Supabase Studio is at [http://127.0.0.1:54323](http://127.0.0.1:54323), and Mailpit captures local email at [http://127.0.0.1:54324](http://127.0.0.1:54324). The Supabase API is available at `http://127.0.0.1:54321`.

The root `dev` script sets `QWERTY_SITE_URL` and uses Portless's positional `qwerty` name to retain the exact HTTPS hostname. Portless is an existing global prerequisite; this setup adds no project dependency for it.
