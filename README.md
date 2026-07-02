# July 1 Superbase

Active working version of the Lunde Flooring site branched from the completed July 1 Node.js build.

This version is prepared to use Supabase project `celysrqrylcobfhiualu` as the persistent data store.

## What is included

- Node app server: `server.js`
- Public site pages and scripts: `*.html`, `*.js`, `*.css`
- Product/site data: `data.js` and `api/data/`
- Site media: `media/`
- Dependency manifest and lockfile: `package.json`, `pnpm-lock.yaml`
- Installed dependency folder: `node_modules/`
- Supabase database migration: `supabase/migrations/202607010001_create_app_stores.sql`
- Environment template: `.env.example`

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

For production, replace `AUTH_SECRET` with a strong unique value and set any payment, email, admin, or site URL environment variables needed by the deployment host.
