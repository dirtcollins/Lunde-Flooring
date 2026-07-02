# Lunde Flooring

Lunde Flooring site — Node.js app with Supabase as the persistent data store.

Repository: https://github.com/dirtcollins/Lunde-Flooring

Uses Supabase project `celysrqrylcobfhiualu`.

## What is included

- Node app server: `server.js`
- Public site pages and scripts: `*.html`, `*.js`, `*.css`
- Product/site data: `data.js` (local fallback store: `api/data/`, not committed)
- Site media: `media/`
- Dependency manifest and lockfile: `package.json`, `pnpm-lock.yaml` (run `pnpm install` after cloning)
- Supabase database migration: `supabase/migrations/202607010001_create_app_stores.sql`
- Environment template: `.env.example` (copy to `.env`; never commit `.env`)

## Supabase Setup

Run the SQL in `supabase/migrations/202607010001_create_app_stores.sql` against the Supabase project.

Then create a local `.env` from `.env.example` and set:

```sh
SUPABASE_URL=https://celysrqrylcobfhiualu.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable key from Supabase>
SUPABASE_SERVICE_ROLE_KEY=<service role key from Supabase>
AUTH_SECRET=<strong random secret>
```

When both Supabase variables are present, the app reads and writes its JSON-backed stores through Supabase table `public.app_stores`. Without those variables, it falls back to local `api/data/*.json` files.

## Run Locally

From this folder:

```sh
AUTH_SECRET=local-dev-preview-secret PORT=3003 node server.js
```

Then open:

```text
http://localhost:3003/
```

## Verify

With the local server running:

```sh
npm run check
```

To verify a deployed site:

```sh
BASE_URL=https://lundeflooring.com npm run check
```

For production, replace `AUTH_SECRET` with a strong unique value and set any payment, email, admin, or site URL environment variables needed by the deployment host.

See `GO_LIVE.md` for the production environment, Stripe webhook, and hosting checklist.
