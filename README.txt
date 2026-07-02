Lunde Flooring — Node.js Hostinger deploy
=========================================

WHAT THIS IS
  The full Lunde storefront, customer account area, and staff console as a
  single Node.js app. No build step and no dependencies — it runs on Node's
  built-in modules only (Node 18+). Customer accounts and Stripe payments are
  server-backed; orders, accounts, inventory, and notes persist as JSON files
  under api/data/ at runtime.

HOSTINGER NODE SETTINGS
  Application root:
    the folder that contains this README, package.json, server.js, index.html
  Startup file:
    server.js
  Start command:
    npm start
  Node version:
    18 or newer

ENVIRONMENT VARIABLES (set in the Hostinger Node app panel)
  Required before launch:
    NODE_ENV=production
    SITE_BASE_URL=https://your-domain.com
    ADMIN_BASE_URL=https://your-domain.com
    AUTH_SECRET=<long random string>
        generate with:
        node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
    STAFF_EMAIL=staff@your-domain.com
    STAFF_PASSWORD=<strong password>
    ADMIN_EMAIL=admin@your-domain.com
    ADMIN_PASSWORD=<strong password>
    ADMIN_RECOVERY=        (leave blank except for emergency owner recovery)

  Required for live payments:
    STRIPE_SECRET_KEY=sk_live_...
    STRIPE_PUBLISHABLE_KEY=pk_live_...
    STRIPE_WEBHOOK_SECRET=whsec_...   (from the Stripe webhook you create at deploy)

  Transactional email via Resend:
    Required for customer verification, customer password reset, staff/admin
    password reset, order emails, and fulfillment/admin notifications.
    RESEND_API_KEY=re_...
    FULFILLMENT_NAME=David Bomb
    FULFILLMENT_EMAIL=dgdenison@gmail.com
    FROM_EMAIL=Lunde Flooring <orders@your-domain.com>

  Values set in the Hostinger panel override anything in a local .env file.

SECURITY MODEL
  - Staff console pages (dashboard, orders, inventory, products, customers,
    quotes, reports, messages, settings, order, customer-profile, product-edit)
    are served ONLY to a valid staff session — the server 302-redirects everyone
    else to /login.html. There are no links to the console from the storefront.
  - Staff sign-in is verified entirely on the server (HttpOnly cookie). There is
    no client-side credential fallback.
  - Emergency admin recovery is available only through Hostinger env vars:
    set ADMIN_EMAIL, ADMIN_PASSWORD, and one-time ADMIN_RECOVERY, restart, sign
    in, then remove ADMIN_RECOVERY and restart again.
  - Customer accounts are server-backed: passwords are hashed (scrypt) and
    verified on the server, so a customer can sign in from any device. The
    browser stores only a session cookie plus non-sensitive display info.
  - Staff/customer password reset pages use generic success text so attackers
    cannot probe which emails exist. Check api/data/app_events.json or Hostinger
    logs for email delivery status if a reset email does not arrive.

FILES / FOLDERS TO DEPLOY
  Upload the whole folder, including:
    *.html, *.js, *.css, package.json, server.js, favicon.ico, media/
  Do NOT upload:
    .env, api/data/, node_modules/, .DS_Store
  For zip creation, follow:
    MD/HOSTINGER-ZIP.md
  Critical:
    Never include api/data/*.json in the zip. Those files are live customer,
    order, staff, inventory, session, and Stripe-event data. Overwriting them
    can make existing customer accounts stop working after a redeploy.

PRE-LAUNCH CHECKLIST
  [ ] Set all required env vars above in Hostinger (real domain, AUTH_SECRET,
      staff/admin passwords).
  [ ] Swap Stripe TEST keys for LIVE keys (sk_live / pk_live).
  [ ] In Stripe, add a webhook endpoint:
        https://your-domain.com/api/stripe/webhook
      subscribe to checkout.session.completed, then paste its signing secret
      into STRIPE_WEBHOOK_SECRET.
  [ ] Confirm Hostinger allows the app to write to api/data/.
  [ ] Before every redeploy, back up live api/data/ and verify the new zip does
      not contain api/data/*.json.
  [ ] Confirm RESEND_API_KEY is set and FROM_EMAIL uses a verified Resend
      sending domain, then test /admin/reset and /account/reset email delivery.

LIVE CHECKS AFTER DEPLOY
  1. Visit /  and /catalog.html (product images load).
  2. Visit /health -> {"status":"healthy",...}.
  3. Visit /dashboard.html while signed out -> redirected to /login.html.
  4. Sign in at /login.html with the staff credentials -> console loads.
  5. Create a customer account at /account.html, sign out, sign back in.
  6. Place a test order -> Stripe checkout opens -> completes -> order shows paid
     in the staff console (confirms the webhook secret is correct).
