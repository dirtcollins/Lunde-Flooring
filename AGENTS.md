# AGENTS.md — Lunde Flooring

Read this first. It exists so an agent can load the right website in under a minute
and not get lost in look-alike copies of this project.

## ⚠️ THIS folder is the real site — beware of look-alikes

- **This folder** (`…/Lunde Flooring Superbase/Lunde Flooring/`) is the GitHub repo
  [dirtcollins/Lunde-Flooring](https://github.com/dirtcollins/Lunde-Flooring) and is what
  deploys to **https://lundeflooring.com** (via Hostinger, from the `main` branch).
- `…/Flooring Shopping - Lunde/New Site/` is an **older, abandoned copy** of the site.
  It is NOT the repo. It has often been found running on **port 3000** with the same
  page titles — do not confuse it with this project, and do not edit it.
- Rule of thumb: verify before assuming. `lsof -p <pid> -a -d cwd` on whatever owns a
  port tells you which folder it serves.

## Run / open the local site

- The dev server for THIS folder runs on **http://localhost:3003** (`PORT=3003` in `.env`).
  It is often already running — check first: `curl -s http://localhost:3003/health`.
- To start it: `npm run dev` (= `node server.js`) from this folder. It refuses to boot
  without `AUTH_SECRET` set; `.env` here already has everything (never commit `.env`).
- Smoke-test: `npm run check` (local), or `BASE_URL=https://lundeflooring.com npm run check` (live).

## What this app is

A single dependency-light Node server (`server.js`, plain `node:http`, no framework) that
serves static HTML/CSS/JS pages and a JSON API under `/api/*`
(products, orders, customers, inventory, reports, settings, admins, customer auth, stripe).

- **Storefront** (public): `index.html`, `catalog.html`, `product.html`, `cart.html`,
  `checkout.html`, `samples.html`, plus content pages. Shared header/footer/mobile chrome
  is injected by `chrome.js`; shared styles in `v6.css`; client data layer in `data.js` + `store.js`.
- **Staff console** (protected): `dashboard.html`, `orders.html`, `inventory.html`,
  `products.html`, `customers.html`, `quotes.html`, `reports.html`, `messages.html`,
  `settings.html`, `staff-users.html`. Shell injected by `app-shell.js`, styles in `console.css`.
  Server-side guard: unauthenticated requests to staff pages redirect to `/admin` (sign-in).
  Staff auth = server cookie + `localStorage` session; you cannot deep-link past login.

## Services (configured in `.env`)

- **Supabase** — persistent data store (project `celysrqrylcobfhiualu`). All JSON-backed
  stores read/write through table `public.app_stores` when `SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` are set; otherwise falls back to local `api/data/*.json`
  (gitignored). Migration: `supabase/migrations/202607010001_create_app_stores.sql`.
- **Resend** — transactional email (order confirmations, fulfillment notices, resets).
- **Stripe** — payments; webhook at `/api/stripe/webhook`.

## UI behaviors worth knowing (frequent confusion sources)

- **Mobile bottom tab bar** (`.v6-tabbar`, built in `chrome.js`): appears only at
  viewport width **≤ 860px**, and intentionally hides when the mobile menu is open or a
  page shows the sticky buy/sample bar (`body.has-buybar` / `body.has-samplebar`).
  If "the bottom controls aren't showing," check viewport width and those body classes —
  then check you're actually on localhost:3003 and not a stale copy/deploy.
- Staff sidebar collapses behind a burger at ≤ 900px (`console.css`).

## Workflow notes

- Local edits here are live immediately (HTML/JS/CSS served with `no-cache`) — just reload.
- The live site only updates after commit + push to `main` (Hostinger deploys from GitHub).
  If localhost and lundeflooring.com disagree, look for uncommitted changes: `git status`.
- `GO_LIVE.md` and `LAUNCH_CHECKLIST.md` track deployment status.
