# Lunde Flooring Launch Checklist

This is the remaining work to get the current GitHub-backed site production-ready.

Canonical working folder:

```text
/Users/brendan-macpro/Documents/Codex/Flooring Shopping - Lunde/Lunde Flooring Superbase/Lunde Flooring
```

GitHub repo:

```text
https://github.com/dirtcollins/Lunde-Flooring
```

## Already Done

- Site copied into the canonical `Lunde Flooring Superbase/Lunde Flooring` folder.
- Folder is a Git repo connected to `dirtcollins/Lunde-Flooring`.
- Supabase migration exists at `supabase/migrations/202607010001_create_app_stores.sql`.
- Supabase local environment is configured.
- Resend local environment is configured.
- `FROM_EMAIL` is set to `Lunde Flooring <orders@lundeflooring.com>`.
- Local site runs on `http://localhost:3003`.
- Local page smoke check passed for the public pages.
- JavaScript syntax check passed.
- Product image references checked successfully.
- Repeatable verification script added: `npm run check`.
- `GO_LIVE.md` added with production environment, Stripe webhook, and Hostinger notes.

## Still Left

### 1. Connect Hostinger to GitHub

Current Hostinger finding: `lundeflooring.com` is still a manually uploaded ZIP deployment, `http://lundeflooring.com` returns a Hostinger parked-domain page, and HTTPS fails before serving a certificate. Hostinger also shows all `5 / 5` Node.js app slots in use.

When Hostinger is working again, either free one Node.js app slot or replace the current ZIP-backed app, then create/connect the Node.js app from GitHub.

Open:

```text
https://hpanel.hostinger.com/websites/lundeflooring.com/deployments/settings
```

- Connect the deployment source to GitHub if Hostinger exposes that option. If it does not, create a new Node.js app from GitHub and move `lundeflooring.com` to that app.
- Select repository:

```text
dirtcollins/Lunde-Flooring
```

- Select branch:

```text
main
```

- Confirm the build/start settings for this Node app:

```text
Install command: npm install
Start command: npm start
Node version: 18 or newer
```

### 2. Add Production Environment Variables In Hostinger

Add these to Hostinger's production environment settings. Do not commit real secret values to GitHub.

```sh
NODE_ENV=production
AUTH_SECRET=<strong random secret>
SITE_BASE_URL=https://lundeflooring.com
ADMIN_BASE_URL=https://lundeflooring.com

SUPABASE_URL=https://celysrqrylcobfhiualu.supabase.co
SUPABASE_PUBLISHABLE_KEY=<supabase publishable key>
SUPABASE_SERVICE_ROLE_KEY=<supabase service role / secret key>

RESEND_API_KEY=<resend api key>
FROM_EMAIL=Lunde Flooring <orders@lundeflooring.com>
FULFILLMENT_NAME=David Bomb
FULFILLMENT_EMAIL=dgdenison@gmail.com
```

### 3. Rotate Secrets Before Final Launch

Some keys were pasted during setup. Before the final public launch:

- Rotate the Supabase secret/service role key.
- Rotate the Resend API key.
- Update local `.env` if needed.
- Update Hostinger environment variables.
- Do not commit `.env`.

### 4. Configure Stripe For Real Checkout

The checkout flow is built for Stripe, but Stripe production keys are not configured locally yet.

Add these in Hostinger after Stripe is ready:

```sh
STRIPE_SECRET_KEY=<stripe live secret key>
STRIPE_PUBLISHABLE_KEY=<stripe live publishable key>
STRIPE_WEBHOOK_SECRET=<stripe webhook signing secret>
```

Create a Stripe webhook endpoint:

```text
https://lundeflooring.com/api/stripe/webhook
```

Webhook events needed:

```text
checkout.session.completed
checkout.session.async_payment_failed
checkout.session.expired
payment_intent.payment_failed
charge.refunded
refund.created
refund.updated
```

### 5. Confirm Admin Access

Make sure there is at least one Owner account in the production store.

If production has no staff account yet, set temporary seed credentials in Hostinger before the first production run:

```sh
ADMIN_NAME=<owner name>
ADMIN_EMAIL=<owner email>
ADMIN_PASSWORD=<strong temporary password>
```

After the Owner account exists, remove the temporary password environment variable and manage staff users from the admin console.

Admin URL:

```text
https://lundeflooring.com/admin
```

### 6. Deploy And Verify

After Hostinger is connected and environment variables are set:

- Trigger a deployment from Hostinger.
- Open `https://lundeflooring.com`.
- Confirm catalog loads.
- Confirm a product page loads.
- Confirm contact/feedback form saves.
- Confirm `/health` returns healthy.
- Confirm admin login works.
- Confirm checkout opens Stripe Checkout.
- Confirm Stripe webhook marks a test order paid.
- Confirm customer confirmation email sends.
- Confirm fulfillment email sends to `dgdenison@gmail.com`.

### 7. Final GitHub Push

Before asking another coding agent to continue:

```sh
git status
git add LAUNCH_CHECKLIST.md
git commit -m "Add launch checklist"
git push origin main
```

## Current Local Status

Configured locally:

- `AUTH_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `FROM_EMAIL`

Missing locally:

- `SITE_BASE_URL`
- `ADMIN_BASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
