# Lunde Flooring Go-Live Notes

The application code is ready to deploy as a Node.js app. The remaining launch risk is hosting/account setup, not the local codebase.

## Current Verified App State

- Local app: `http://localhost:3003`
- Health check: `/health`
- Entry file: `server.js`
- Start command: `npm start`
- Required Node version: `18` or newer
- Supabase-backed store: supported through `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Resend email: supported through `RESEND_API_KEY`
- Stripe checkout/webhooks: built in, requires live Stripe keys before real payments

Run the local verification:

```sh
npm run check
```

Or against a deployed host:

```sh
BASE_URL=https://lundeflooring.com npm run check
```

## Required Production Environment

Set these in the hosting provider. Never commit real secrets to GitHub.

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

STRIPE_SECRET_KEY=<stripe live secret key>
STRIPE_PUBLISHABLE_KEY=<stripe live publishable key>
STRIPE_WEBHOOK_SECRET=<stripe webhook signing secret>
```

## Stripe Webhook

Create this webhook endpoint in Stripe:

```text
https://lundeflooring.com/api/stripe/webhook
```

Subscribe to:

```text
checkout.session.completed
checkout.session.async_payment_failed
checkout.session.expired
payment_intent.payment_failed
charge.refunded
refund.created
refund.updated
```

## Hostinger Status

As of the latest check, Hostinger is not serving the app on `lundeflooring.com`.

- `http://lundeflooring.com` returns a Hostinger parked-domain page.
- `https://lundeflooring.com` fails during TLS handshake.
- Hostinger shows the current `lundeflooring.com` Node app as a manually uploaded ZIP deployment.
- The Hostinger account shows all `5 / 5` Node.js app slots used.

To finish hosting:

1. Free one Hostinger Node.js app slot, or replace the current ZIP-backed `lundeflooring.com` app.
2. Create/connect a Node.js app from GitHub repository `dirtcollins/Lunde-Flooring`, branch `main`.
3. Add the production environment variables above.
4. Point `lundeflooring.com` to the GitHub-backed Node.js app.
5. Reissue/fix SSL for `lundeflooring.com`.
6. Run `BASE_URL=https://lundeflooring.com npm run check`.

## Final Launch Verification

- Homepage loads over HTTPS.
- `/health` returns healthy.
- Catalog loads.
- Product pages load.
- Contact/feedback submissions save.
- Admin login works.
- Stripe Checkout opens with live keys.
- Stripe test payment triggers webhook and updates order status.
- Customer confirmation email sends.
- Fulfillment email sends to `dgdenison@gmail.com`.
