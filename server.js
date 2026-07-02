import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "api", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

loadEnv(path.join(__dirname, ".env"));

const isProduction = process.env.NODE_ENV === "production";

const config = {
  authSecret: process.env.AUTH_SECRET || "change-me-before-launch",
  siteBaseUrl: trimSlash(process.env.SITE_BASE_URL || ""),
  adminBaseUrl: trimSlash(process.env.ADMIN_BASE_URL || process.env.SITE_BASE_URL || ""),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  resendApiKey: process.env.RESEND_API_KEY || "",
  fulfillmentName: process.env.FULFILLMENT_NAME || "David Bomb",
  fulfillmentEmail: process.env.FULFILLMENT_EMAIL || "dgdenison@gmail.com",
  fromEmail: process.env.FROM_EMAIL || "Lunde Flooring <orders@lundeflooring.com>",
  supabaseUrl: trimSlash(process.env.SUPABASE_URL || ""),
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || ""
};

if (config.authSecret === "change-me-before-launch") {
  throw new Error("AUTH_SECRET must be configured. Generate a strong random value before starting the app.");
}
if (["ADMIN_PASSWORD", "STAFF_PASSWORD"].some((name) => String(process.env[name] || "") === "lunde123")) {
  throw new Error("Default admin/staff passwords are not allowed. Set a strong unique password in the environment.");
}
if (Boolean(config.supabaseUrl) !== Boolean(config.supabaseServiceRoleKey)) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured together.");
}

const storeCache = new Map();
const SUPABASE_STORE_TABLE = "app_stores";
await hydrateSupabaseStores();

const MAX_API_BODY_BYTES = 1024 * 1024;
const authRateLimits = new Map();
const CUSTOMER_TTL = 2592000; // 30 days
const VERIFY_TTL = 24 * 60 * 60 * 1000;
const RESET_TTL = 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;
const STRIPE_API_VERSION = "2026-02-25.clover";
const STRIPE_WEBHOOK_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "payment_intent.payment_failed",
  "charge.refunded",
  "refund.created",
  "refund.updated"
];

// Staff console accounts ("admin users") live in the `admin_users` JSON store
// with scrypt-hashed passwords (see hashPassword/verifyPassword). The store is
// seeded once from env on first run; thereafter Owners manage accounts through
// the staff console UI. Passwords are never stored or compared in plaintext.
const ADMIN_ROLES = ["Owner", "Manager", "Staff"];

function initialsFrom(name, fallback) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback || "U";
  return parts.map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function seedAdminUsers() {
  const seeds = [];
  const ownerEmail = String(process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const ownerPass = String(process.env.ADMIN_PASSWORD || "");
  if (ownerEmail && ownerPass) {
    seeds.push({ name: process.env.ADMIN_NAME || "Owner", email: ownerEmail, password: ownerPass, role: "Owner" });
  }
  const staffEmail = String(process.env.STAFF_EMAIL || "").toLowerCase().trim();
  const staffPass = String(process.env.STAFF_PASSWORD || "");
  if (staffEmail && staffPass && staffEmail !== ownerEmail) {
    seeds.push({ name: process.env.STAFF_NAME || "Staff", email: staffEmail, password: staffPass, role: "Manager" });
  }
  // Always leave at least one Owner so the console can never lock itself out.
  if (!seeds.some((s) => s.role === "Owner")) {
    return [];
  }
  const now = new Date().toISOString();
  return seeds.map((s) => ({
    id: `U-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    name: s.name,
    initials: initialsFrom(s.name),
    email: s.email,
    password: hashPassword(s.password),
    role: ADMIN_ROLES.includes(s.role) ? s.role : "Staff",
    active: true,
    createdAt: now,
    updatedAt: now
  }));
}

function getAdminUsers() {
  let users = readStore("admin_users", null);
  if (!Array.isArray(users) || users.length === 0) {
    users = seedAdminUsers();
    if (users.length) {
      try { saveAdminUsers(users); } catch { /* fall back to in-memory seed if disk is read-only */ }
    }
  }
  users = recoverOwnerFromEnv(users);
  return users;
}

function saveAdminUsers(users) {
  return writeStore("admin_users", users);
}

function recoverOwnerFromEnv(users) {
  const recoveryKey = clean(process.env.ADMIN_RECOVERY || "", 80);
  if (!recoveryKey) return users;
  const email = clean(process.env.ADMIN_EMAIL || "", 180).toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  if (!validEmail(email) || passwordStrengthError(password)) {
    logOperationalEvent("error", "admin_recovery_failed", {
      reason: !validEmail(email) ? "invalid_admin_email" : "weak_or_missing_admin_password"
    });
    return users;
  }
  const now = new Date().toISOString();
  const list = Array.isArray(users) ? users.slice() : [];
  const index = list.findIndex((row) => String(row.email || "").toLowerCase() === email);
  if (index >= 0 && list[index].adminRecoveryKey === recoveryKey) return users;
  const name = clean(process.env.ADMIN_NAME || (index >= 0 ? list[index].name : "Owner"), 120) || "Owner";
  const recovered = {
    ...(index >= 0 ? list[index] : {}),
    id: index >= 0 ? list[index].id : `U-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    name,
    initials: initialsFrom(name),
    email,
    password: hashPassword(password),
    role: "Owner",
    active: true,
    createdAt: index >= 0 ? (list[index].createdAt || now) : now,
    updatedAt: now,
    adminRecoveryKey: recoveryKey,
    adminRecoveredAt: now
  };
  if (index >= 0) list[index] = recovered;
  else list.unshift(recovered);
  saveAdminUsers(list);
  logOperationalEvent("warn", "admin_recovery_applied", {
    userId: recovered.id,
    emailHash: hashToken(email).slice(0, 16),
    recoveryKey
  });
  return list;
}

function activeOwnerCount(users, excludeId) {
  return users.filter((u) => u.role === "Owner" && u.active !== false && u.id !== excludeId).length;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/health") {
      json(res, { status: "healthy", uptime: process.uptime() });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    if (url.pathname === "/robots.txt") return serveRobots(res);
    if (url.pathname === "/sitemap.xml") return serveSitemap(res);
    await serveStatic(req, res, url);
  } catch (error) {
    if (!error.statusCode || error.statusCode >= 500) {
      logOperationalEvent("error", "server_error", { message: error.message, path: req.url || "" });
    }
    json(res, { ok: false, error: error.publicMessage || "Server error" }, error.statusCode || 500);
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`Lunde Flooring site listening on port ${port}`);
});

async function handleApi(req, res, url) {
  const method = req.method || "GET";
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const raw = await readRaw(req, MAX_API_BODY_BYTES);
  const input = parseJson(raw);

  if (parts[0] === "settings" && method === "GET") {
    const body = { ok: true, settings: getSettings() };
    const staff = currentStaff(req);
    if (staff) {
      body.email = {
        resendApiKeyConfigured: Boolean(config.resendApiKey),
        fulfillmentRecipient: config.fulfillmentEmail,
        fulfillmentRecipientName: config.fulfillmentName,
        fulfillmentRecipientConfigured: Boolean(config.fulfillmentEmail),
        from: config.fromEmail,
        adminBaseUrl: config.adminBaseUrl
      };
      body.integrations = {
        stripe: Boolean(config.stripeSecretKey),
        stripeWebhook: Boolean(config.stripeWebhookSecret),
        resend: Boolean(config.resendApiKey),
        supabase: Boolean(config.supabaseUrl && config.supabaseServiceRoleKey),
        dataBackend: config.supabaseUrl && config.supabaseServiceRoleKey ? "supabase" : "local-files"
      };
    }
    return json(res, body);
  }

  if (parts[0] === "traffic" && method === "GET") {
    const denied = requireStaff(req, res);
    if (denied) return;
    const days = loadTraffic();
    const series = [];
    for (let i = 29; i >= 0; i--) {
      const key = trafficDayKey(Date.now() - i * 86400000);
      const d = days[key] || {};
      series.push({ date: key, views: d.views || 0, uniques: d.uniques || 0 });
    }
    const pageTotals = {};
    for (let i = 6; i >= 0; i--) {
      const d = days[trafficDayKey(Date.now() - i * 86400000)];
      if (d && d.pages) for (const [p, n] of Object.entries(d.pages)) pageTotals[p] = (pageTotals[p] || 0) + n;
    }
    const topPages = Object.entries(pageTotals).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([pagePath, views]) => ({ path: pagePath, views }));
    return json(res, { ok: true, days: series, topPages });
  }

  if (parts[0] === "settings" && method === "PATCH") {
    const denied = requireStaff(req, res);
    if (denied) return;
    const cur = getSettings();
    const patch = input && typeof input === "object" ? input : {};
    const num = (v, min, max, fallback) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };
    if (patch.freightFlat !== undefined) cur.freightFlat = num(patch.freightFlat, 0, 10000, cur.freightFlat);
    if (patch.garagePerCarton !== undefined) cur.garagePerCarton = num(patch.garagePerCarton, 0, 100, cur.garagePerCarton);
    if (patch.taxRate !== undefined) cur.taxRate = num(patch.taxRate, 0, 0.25, cur.taxRate);
    if (patch.freeShipOver !== undefined) cur.freeShipOver = num(patch.freeShipOver, 0, 100000, cur.freeShipOver);
    for (const key of ["businessName", "businessPhone", "businessEmail", "businessAddress", "businessHours", "emailReplyTo"]) {
      if (patch[key] !== undefined) cur[key] = clean(patch[key], 240);
    }
    for (const key of ["emailOrderConfirmation", "emailDeliveryNotice", "emailNewMessageAlert"]) {
      if (patch[key] !== undefined) cur[key] = Boolean(patch[key]);
    }
    if (patch.promoCodes && typeof patch.promoCodes === "object" && !Array.isArray(patch.promoCodes)) {
      const codes = {};
      for (const [rawKey, rawVal] of Object.entries(patch.promoCodes).slice(0, 50)) {
        const key = clean(rawKey, 24).toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (!key || !rawVal || typeof rawVal !== "object") continue;
        const type = rawVal.type === "fixed" ? "fixed" : "percent";
        let value = Number(rawVal.value);
        if (!Number.isFinite(value) || value <= 0) continue;
        if (type === "percent") value = Math.min(value, 1);           // stored as a fraction (0.10 = 10%)
        else value = Math.min(value, 10000);
        codes[key] = { code: key, label: key, type, value };
      }
      cur.promoCodes = codes;
    }
    writeStore("settings", cur);
    return json(res, { ok: true, settings: cur });
  }

  if (parts[0] === "stripe") {
    if (parts[1] === "config" && method === "GET") {
      return json(res, {
        ok: true,
        publishableKeyConfigured: Boolean(config.stripePublishableKey),
        secretKeyConfigured: Boolean(config.stripeSecretKey),
        webhookSecretConfigured: Boolean(config.stripeWebhookSecret)
      });
    }
    if (parts[1] === "checkout-session" && method === "POST") {
      if (rateLimit(res, `stripe-checkout:${clientIp(req)}`, 8, 15 * 60 * 1000)) return;
      const order = normalizeOrder(input.order && typeof input.order === "object" ? input.order : input);
      if (!Object.keys(order.items).length) return json(res, { ok: false, error: "Order has no line items." }, 422);
      const account = currentAccount(req);
      if (account) attachAccountToOrder(order, account);
      order.totals = computeOrderTotals(order.items, order.delivery.method, order.delivery.placement, order.checkout.promoCode || "");
      if (order.totals.total <= 0) return json(res, { ok: false, error: "Order total must be greater than zero." }, 422);
      order.payment = { ...(order.payment || {}), method: "stripe", status: "awaiting_payment", amount: order.totals.total };
      const base = siteBase(req);
      // Both guests and signed-in customers land on the branded confirmation page
      // after successful payment; it links onward to tracking (/account or
      // /my-order.html) and the catalog.
      const successPath = `/order-confirmed.html?id=${encodeURIComponent(order.id)}`;
      const stripe = await stripeRequest("POST", "/v1/checkout/sessions", {
        mode: "payment",
        payment_method_types: ["card"],
        client_reference_id: order.id,
        customer_email: order.customer.email || undefined,
        success_url: `${base}${successPath}&stripe=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/checkout.html?stripe=cancelled`,
        metadata: { order_id: order.id, customer_email: order.customer.email || "" },
        payment_intent_data: { metadata: { order_id: order.id, customer_email: order.customer.email || "" } },
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: stripeAmount(order.totals.total),
            product_data: {
              name: `Lunde Flooring order ${order.id}`,
              description: "Flooring materials, samples, freight, and estimated tax."
            }
          }
        }]
      });
      if (!stripe.ok) {
        logOperationalEvent("error", "stripe_checkout_session_failed", { orderId: order.id, status: stripe.status, error: stripe.error || "Stripe Checkout Session failed." });
        return json(res, { ok: false, error: "Secure checkout is temporarily unavailable. Please try again or contact us if the problem continues." }, stripe.status || 500);
      }
      order.payment.stripeSessionId = clean(stripe.data.id, 180);
      order.payment.checkoutUrl = clean(stripe.data.url, 600);
      savePendingStripeOrder(order, stripe.data);
      upsertOrderWithoutEmail(order);
      return json(res, { ok: true, url: stripe.data.url || "", sessionId: stripe.data.id || "", order });
    }
    if (parts[1] === "webhook" && method === "POST") {
      return handleStripeWebhook(req, res, raw);
    }
  }

  if (parts.join("/") === "auth/login" && method === "POST") {
    const email = clean(input.email, 180).toLowerCase();
    if (rateLimit(res, `staff-login:${clientIp(req)}:${email || "missing"}`, 8, 15 * 60 * 1000)) return;
    const password = String(input.password || "");
    const user = getAdminUsers().find((row) =>
      String(row.email || "").toLowerCase() === email &&
      row.active !== false &&
      verifyPassword(password, String(row.password || "")));
    if (!user) return json(res, { ok: false, error: "Email or password did not match." }, 401);
    setCookie(res, req, "lunde_staff", signPayload({ id: user.id, exp: nowSeconds() + 43200 }), 43200);
    return json(res, { ok: true, user: publicUser(user) });
  }
  if (parts.join("/") === "auth/me" && method === "GET") {
    const user = currentStaff(req);
    return user ? json(res, { ok: true, user }) : json(res, { ok: false, error: "Not signed in." }, 401);
  }
  if (parts.join("/") === "auth/logout" && method === "POST") {
    clearCookie(res, "lunde_staff");
    return json(res, { ok: true });
  }
  if (parts.join("/") === "auth/password-reset/request" && method === "POST") {
    const email = clean(input.email, 180).toLowerCase();
    if (rateLimit(res, `staff-reset:${clientIp(req)}:${email || "missing"}`, 5, 60 * 60 * 1000)) return;
    let devUrl = "";
    let deliveryStatus = "";
    if (validEmail(email)) {
      const users = getAdminUsers();
      const index = users.findIndex((row) => String(row.email || "").toLowerCase() === email && row.active !== false);
      if (index >= 0) {
        const token = secureToken();
        users[index].resetTokenHash = hashToken(token);
        users[index].resetTokenExpiresAt = Date.now() + RESET_TTL;
        users[index].resetRequestedAt = Date.now();
        saveAdminUsers(users);
        const emailResult = await sendStaffPasswordResetEmail(users[index], token, req);
        deliveryStatus = emailResult.status || "unknown";
        logOperationalEvent(emailResult.status === "sent" ? "info" : "warn", "staff_password_reset_email", {
          userId: users[index].id,
          emailHash: hashToken(email).slice(0, 16),
          status: emailResult.status || "unknown",
          error: emailResult.error || "",
          messageId: emailResult.messageId || ""
        });
        devUrl = emailResult.devUrl || "";
      } else {
        deliveryStatus = "no_active_staff_account";
        logOperationalEvent("info", "staff_password_reset_email", {
          emailHash: hashToken(email).slice(0, 16),
          status: "no_active_staff_account"
        });
      }
    } else {
      deliveryStatus = "invalid_email";
    }
    // Generic response either way so the endpoint can't be used to probe which
    // emails are staff accounts.
    return json(res, { ok: true, message: "If a staff account exists and email delivery is configured, reset instructions will be sent.", ...(devUrl ? { devResetUrl: devUrl } : {}), ...(process.env.NODE_ENV !== "production" && deliveryStatus ? { emailStatus: deliveryStatus } : {}) });
  }
  if (parts.join("/") === "auth/password-reset/confirm" && method === "POST") {
    const tokenHash = hashToken(String(input.token || ""));
    const password = String(input.password || "");
    const passwordError = passwordStrengthError(password);
    if (passwordError) return json(res, { ok: false, error: passwordError }, 422);
    const users = getAdminUsers();
    const index = users.findIndex((row) => row?.resetTokenHash && safeEqual(row.resetTokenHash, tokenHash));
    if (index < 0 || Date.now() > Number(users[index].resetTokenExpiresAt || 0)) {
      return json(res, { ok: false, error: "Password reset link is invalid or expired." }, 400);
    }
    users[index].password = hashPassword(password);
    users[index].updatedAt = new Date().toISOString();
    delete users[index].resetTokenHash;
    delete users[index].resetTokenExpiresAt;
    delete users[index].resetRequestedAt;
    saveAdminUsers(users);
    return json(res, { ok: true, message: "Password updated. Please sign in with your new password." });
  }

  if (parts[0] === "admins") return handleAdminUsers(req, res, method, parts, input);
  if (parts[0] === "samples" && method === "POST") return handleSampleRequest(req, res, input);
  if (parts[0] === "orders") return handleOrders(req, res, method, parts, input);
  if (parts[0] === "customers") return handleCustomers(req, res, method, input);
  if (parts[0] === "customer") return handleCustomerAccounts(req, res, method, parts, input);
  if (["quotes", "notes", "feedback"].includes(parts[0])) return handleListStore(req, res, method, parts, input);
  if (parts[0] === "inventory") return handleInventory(req, res, method, input);
  if (parts[0] === "products") return handleProducts(req, res, method, input);
  if (parts[0] === "reports") {
    const denied = requireStaff(req, res);
    if (denied) return;
    return json(res, { ok: true, orders: readStore("orders", []), customers: publicCustomers(), inventory: readStore("inventory", {}) });
  }

  return json(res, { ok: false, error: "Not found", path: parts.join("/") }, 404);
}

// ---- Admin user management (Owner-only) ----
function publicAdminUser(u) {
  return {
    id: u.id, name: u.name, initials: u.initials, email: u.email,
    role: u.role, active: u.active !== false, avatar: u.avatar || "",
    createdAt: u.createdAt, updatedAt: u.updatedAt
  };
}

function handleAdminUsers(req, res, method, parts, input) {
  const self = currentStaff(req);
  const id = clean(parts[1] || "", 100);
  // Any signed-in staff member may update their OWN profile photo; everything
  // else in here stays Owner-only.
  const selfAvatarOnly = self && id === self.id && method === "PATCH" &&
    input && typeof input === "object" && Object.keys(input).every((k) => k === "avatar");
  if (!selfAvatarOnly && requireOwner(req, res)) return;
  const me = self;

  if (method === "GET" && !id) {
    return json(res, { ok: true, users: getAdminUsers().map(publicAdminUser) });
  }

  if (method === "POST" && !id) {
    const users = getAdminUsers();
    const email = clean(input.email, 180).toLowerCase();
    const name = clean(input.name, 120) || email.split("@")[0];
    const password = String(input.password || "");
    const role = ADMIN_ROLES.includes(input.role) ? input.role : "Staff";
    if (!isEmail(email)) return json(res, { ok: false, error: "Enter a valid email address." }, 400);
    if (password.length < 8) return json(res, { ok: false, error: "Password must be at least 8 characters." }, 400);
    if (users.some((u) => String(u.email || "").toLowerCase() === email)) {
      return json(res, { ok: false, error: "An admin with that email already exists." }, 409);
    }
    const now = new Date().toISOString();
    const user = {
      id: `U-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      name, initials: initialsFrom(name), email,
      password: hashPassword(password), role,
      active: input.active !== false, createdAt: now, updatedAt: now
    };
    saveAdminUsers([...users, user]);
    return json(res, { ok: true, user: publicAdminUser(user) });
  }

  if ((method === "PATCH" || method === "PUT" || method === "POST") && id) {
    const users = getAdminUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx < 0) return json(res, { ok: false, error: "Admin not found." }, 404);
    const target = users[idx];
    const next = { ...target };

    if (input.name !== undefined) {
      next.name = clean(input.name, 120) || target.name;
      next.initials = initialsFrom(next.name);
    }
    if (input.email !== undefined) {
      const email = clean(input.email, 180).toLowerCase();
      if (!isEmail(email)) return json(res, { ok: false, error: "Enter a valid email address." }, 400);
      if (users.some((u) => u.id !== id && String(u.email || "").toLowerCase() === email)) {
        return json(res, { ok: false, error: "An admin with that email already exists." }, 409);
      }
      next.email = email;
    }
    if (input.avatar !== undefined) {
      const avatar = String(input.avatar || "");
      // Small client-downscaled data URL only; empty string removes the photo.
      if (avatar === "" || (/^data:image\/(png|jpeg|webp);base64,/.test(avatar) && avatar.length <= 200000)) {
        next.avatar = avatar;
      }
    }
    if (input.role !== undefined && ADMIN_ROLES.includes(input.role)) {
      if (target.id === me.id && input.role !== "Owner") {
        return json(res, { ok: false, error: "You can't change your own role." }, 400);
      }
      if (target.role === "Owner" && input.role !== "Owner" && activeOwnerCount(users, target.id) === 0) {
        return json(res, { ok: false, error: "There must be at least one active Owner." }, 400);
      }
      next.role = input.role;
    }
    if (input.active !== undefined) {
      const active = !!input.active;
      if (!active && target.id === me.id) {
        return json(res, { ok: false, error: "You can't deactivate your own account." }, 400);
      }
      if (!active && target.role === "Owner" && activeOwnerCount(users, target.id) === 0) {
        return json(res, { ok: false, error: "There must be at least one active Owner." }, 400);
      }
      next.active = active;
    }
    if (input.password !== undefined && String(input.password).length > 0) {
      if (String(input.password).length < 8) {
        return json(res, { ok: false, error: "Password must be at least 8 characters." }, 400);
      }
      next.password = hashPassword(String(input.password));
    }
    next.updatedAt = new Date().toISOString();
    users[idx] = next;
    saveAdminUsers(users);
    return json(res, { ok: true, user: publicAdminUser(next) });
  }

  if (method === "DELETE" && id) {
    const users = getAdminUsers();
    const target = users.find((u) => u.id === id);
    if (!target) return json(res, { ok: false, error: "Admin not found." }, 404);
    if (target.id === me.id) return json(res, { ok: false, error: "You can't remove your own account." }, 400);
    if (target.role === "Owner" && activeOwnerCount(users, target.id) === 0) {
      return json(res, { ok: false, error: "There must be at least one active Owner." }, 400);
    }
    saveAdminUsers(users.filter((u) => u.id !== id));
    return json(res, { ok: true, id });
  }

  return json(res, { ok: false, error: "Not found" }, 404);
}

async function handleStripeWebhook(req, res, raw) {
  if (!config.stripeWebhookSecret) {
    logOperationalEvent("error", "stripe_webhook_missing_secret", {});
    return json(res, { ok: false, error: "Stripe webhook secret is not configured." }, 503);
  }
  if (!verifyStripeSignature(raw, req.headers["stripe-signature"] || "")) {
    logOperationalEvent("warn", "stripe_webhook_invalid_signature", { ip: clientIp(req) });
    return json(res, { ok: false, error: "Invalid Stripe webhook signature." }, 400);
  }
  const event = parseJson(raw);
  const eventId = clean(event.id, 180);
  const eventType = clean(event.type, 120);
  if (!eventId || !eventType) return json(res, { ok: false, error: "Invalid Stripe event." }, 400);
  if (stripeEventProcessed(eventId)) return json(res, { ok: true, duplicate: true });

  recordStripeEvent(event, "processing");
  logOperationalEvent("info", "stripe_webhook_received", { eventId, eventType });
  try {
    if (eventType === "checkout.session.completed") {
      await handleStripeCheckoutCompleted(event);
    } else if (eventType === "checkout.session.async_payment_failed" || eventType === "checkout.session.expired") {
      await handleStripeCheckoutFailed(event);
    } else if (eventType === "payment_intent.payment_failed") {
      await handleStripePaymentIntentFailed(event);
    } else if (eventType === "charge.refunded" || eventType === "refund.created" || eventType === "refund.updated") {
      await handleStripeRefund(event);
    } else {
      logOperationalEvent("info", "stripe_webhook_ignored", { eventId, eventType });
    }
    recordStripeEvent(event, "processed");
    return json(res, { ok: true });
  } catch (error) {
    recordStripeEvent(event, "failed", { error: error.message });
    logOperationalEvent("error", "stripe_webhook_failed", { eventId, eventType, error: error.message });
    return json(res, { ok: false, error: "Stripe webhook processing failed." }, 500);
  }
}

async function handleStripeCheckoutCompleted(event) {
  const session = event.data?.object || {};
  const orderId = clean(session.metadata?.order_id || session.client_reference_id || "", 80);
  if (!orderId) throw new Error("Paid Stripe session did not include order_id.");
  const orders = readStore("orders", []);
  let order = orders.find((row) => row?.id === orderId) || pendingStripeOrder(orderId, session.id)?.order || null;
  if (!order) throw new Error(`Paid Stripe session has no matching order: ${orderId}`);

  order = normalizeOrder(order);
  const expectedAmount = stripeAmount(order.totals?.total || 0);
  const paidAmount = Math.max(0, Math.round(Number(session.amount_total || 0)));
  if (paidAmount !== expectedAmount) {
    markPendingStripeOrder(order.id, clean(session.id, 180), "amount_mismatch");
    order.payment = {
      ...(order.payment || {}),
      method: "stripe",
      status: "amount_mismatch",
      stripeSessionId: clean(session.id, 180),
      stripePaymentIntent: clean(session.payment_intent, 180),
      amount: paidAmount / 100,
      expectedAmount: expectedAmount / 100,
      mismatchAt: Date.now()
    };
    upsertOrderWithoutEmail(order);
    logOperationalEvent("error", "stripe_amount_mismatch", { orderId: order.id, eventId: event.id, expectedAmount, paidAmount });
    return;
  }
  const wasPaid = order.payment?.status === "paid";
  order.payment = {
    ...(order.payment || {}),
    method: "stripe",
    status: "paid",
    paidAt: Number(order.payment?.paidAt || Date.now()),
    stripeSessionId: clean(session.id, 180),
    stripePaymentIntent: clean(session.payment_intent, 180),
    amount: Number(session.amount_total || 0) / 100
  };
  applyInventoryDeduction(order, event.id);
  upsertOrderWithoutEmail(order);
  markPendingStripeOrder(order.id, clean(session.id, 180), "paid");

  const latest = readStore("orders", []).find((row) => row?.id === order.id) || order;
  if (!wasPaid && latest.fulfillmentEmail?.status !== "sent") {
    const email = await sendFulfillmentEmail(latest, "stripe-webhook");
    recordEmailStatus(latest.id, { ...email, source: "stripe-webhook" });
    if (email.status === "failed") logOperationalEvent("error", "fulfillment_email_failed", { orderId: latest.id, error: email.error });
  }
  if (!wasPaid && latest.confirmationEmail?.status !== "sent") {
    const confirmation = await sendCustomerConfirmation(latest, "stripe-webhook");
    if (confirmation?.confirmationEmail?.status === "failed") {
      logOperationalEvent("error", "customer_confirmation_failed", { orderId: latest.id, error: confirmation.confirmationEmail.error });
    }
  }
  logOperationalEvent("info", "stripe_order_paid", { orderId: latest.id, eventId: event.id, inventory: latest.inventory?.status || "" });
}

async function handleStripeCheckoutFailed(event) {
  const session = event.data?.object || {};
  const orderId = clean(session.metadata?.order_id || session.client_reference_id || "", 80);
  const order = findStripeOrder({ orderId, sessionId: session.id });
  if (!order) {
    markPendingStripeOrder(orderId, clean(session.id, 180), "failed");
    logOperationalEvent("warn", "stripe_payment_failed_missing_order", { eventId: event.id, orderId, sessionId: session.id });
    return;
  }
  const status = event.type === "checkout.session.expired" ? "expired" : "failed";
  await markStripeOrderPaymentFailed(order, status, {
    eventId: event.id,
    sessionId: session.id,
    paymentIntentId: session.payment_intent,
    message: status === "expired" ? "Stripe Checkout session expired before payment." : "Stripe reported that checkout payment failed."
  });
}

async function handleStripePaymentIntentFailed(event) {
  const intent = event.data?.object || {};
  const orderId = clean(intent.metadata?.order_id || "", 80);
  const order = findStripeOrder({ orderId, paymentIntentId: intent.id });
  if (!order) {
    logOperationalEvent("warn", "stripe_payment_intent_failed_missing_order", { eventId: event.id, orderId, paymentIntentId: intent.id });
    return;
  }
  await markStripeOrderPaymentFailed(order, "failed", {
    eventId: event.id,
    paymentIntentId: intent.id,
    code: intent.last_payment_error?.code || "",
    message: intent.last_payment_error?.message || "Stripe reported that payment failed."
  });
}

async function handleStripeRefund(event) {
  const object = event.data?.object || {};
  const paymentIntentId = clean(object.payment_intent || "", 180);
  const chargeId = clean(object.charge || object.id || "", 180);
  const order = findStripeOrder({ paymentIntentId });
  if (!order) {
    logOperationalEvent("warn", "stripe_refund_missing_order", { eventId: event.id, paymentIntentId, chargeId });
    return;
  }
  const amountRefunded = event.type === "charge.refunded"
    ? Number(object.amount_refunded || 0) / 100
    : Number(object.amount || 0) / 100;
  const amountPaid = event.type === "charge.refunded"
    ? Number(object.amount || 0) / 100
    : Number(order.payment?.amount || 0);
  const fullRefund = amountPaid > 0 && amountRefunded >= amountPaid;
  order.payment = {
    ...(order.payment || {}),
    method: "stripe",
    status: fullRefund ? "refunded" : "partially_refunded",
    refundedAt: Date.now(),
    refundAmount: amountRefunded,
    stripeRefundId: clean(object.id, 180),
    stripeChargeId: chargeId,
    refundStatus: clean(object.status || "", 80)
  };
  order.refunds = [
    ...(Array.isArray(order.refunds) ? order.refunds : []).filter((row) => row?.eventId !== event.id),
    { eventId: clean(event.id, 180), amount: amountRefunded, status: clean(object.status || "", 80), at: Date.now() }
  ].slice(-20);
  if (fullRefund) {
    if (!["shipped", "delivered"].includes(order.status)) order.status = "cancelled";
    restoreInventoryForRefund(order, event.id);
  }
  upsertOrderWithoutEmail(order);
  await sendCustomerPaymentUpdate(order, fullRefund ? "refund" : "partial-refund", {
    subject: `Refund update for Lunde Flooring order ${order.id}`,
    idempotencyKey: `lunde-refund-${event.id}`
  });
  await sendAdminNotification(fullRefund ? "Full refund recorded" : "Partial refund recorded", order, {
    source: "stripe-webhook",
    eventId: event.id,
    detail: `${fullRefund ? "Full" : "Partial"} refund amount: $${amountRefunded.toFixed(2)}`
  });
  logOperationalEvent("info", "stripe_order_refunded", { orderId: order.id, eventId: event.id, fullRefund, amountRefunded });
}

async function markStripeOrderPaymentFailed(order, status, details) {
  order.payment = {
    ...(order.payment || {}),
    method: "stripe",
    status,
    failedAt: Date.now(),
    stripeSessionId: clean(details.sessionId || order.payment?.stripeSessionId || "", 180),
    stripePaymentIntent: clean(details.paymentIntentId || order.payment?.stripePaymentIntent || "", 180),
    failureCode: clean(details.code || "", 80),
    failureMessage: clean(details.message || "", 600)
  };
  if (status === "expired" && order.status === "placed") order.status = "cancelled";
  upsertOrderWithoutEmail(order);
  markPendingStripeOrder(order.id, order.payment.stripeSessionId, status);
  await sendCustomerPaymentUpdate(order, status, {
    subject: `Payment issue for Lunde Flooring order ${order.id}`,
    idempotencyKey: `lunde-payment-${status}-${details.eventId}`
  });
  await sendAdminNotification(status === "expired" ? "Stripe checkout expired" : "Stripe payment failed", order, {
    source: "stripe-webhook",
    eventId: details.eventId,
    detail: details.message || ""
  });
  logOperationalEvent("warn", "stripe_order_payment_failed", { orderId: order.id, eventId: details.eventId, status });
}

// Free sample box (public, no payment). Creates a $0 order so fulfillment,
// account order history, tracking, and the confirmation email all ride the
// existing order pipeline. The site promises "4 free samples, delivered".
async function handleSampleRequest(req, res, input) {
  if (rateLimit(res, `samples:${clientIp(req)}`, 6, 60 * 60 * 1000)) return;
  const MAX_SAMPLES = 4;
  const products = productsById();
  const ids = [...new Set((Array.isArray(input.ids) ? input.ids : []).map((id) => clean(id, 60)))]
    .filter((id) => products[id] && !productIsArchived(products[id]));
  if (!ids.length) return json(res, { ok: false, error: "Pick at least one floor to sample." }, 422);
  if (ids.length > MAX_SAMPLES) return json(res, { ok: false, error: `The sample box holds ${MAX_SAMPLES} swatches max.` }, 422);
  const customer = input.customer && typeof input.customer === "object" ? input.customer : {};
  const address = input.address && typeof input.address === "object" ? input.address : {};
  const name = clean(customer.name, 180);
  const email = clean(customer.email, 180).toLowerCase();
  const line1 = clean(address.line1, 200);
  const city = clean(address.city, 80);
  const state = clean(address.state, 40);
  const zip = clean(address.zip, 20);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, { ok: false, error: "Add your name and a valid email." }, 422);
  if (!line1 || !city || !zip) return json(res, { ok: false, error: "Add a full delivery address." }, 422);
  const items = {};
  for (const id of ids) items[id] = { sqft: 0, samples: 1 };
  const order = normalizeOrder({
    items,
    status: "placed",
    checkout: { mode: "guest", type: "sample-box" },
    delivery: {
      method: "delivery",
      address: [line1, `${city}, ${state} ${zip}`.replace(/\s+/g, " ").trim()].join(", "),
      notes: ""
    },
    customer: { name, email, phone: clean(customer.phone, 80) },
    payment: { method: "none", status: "no_charge", amount: 0, last4: "", name: "" },
    totals: { material: 0, samples: 0, cartons: 0, subtotal: 0, discount: 0, freight: 0, garagePlacement: 0, tax: 0, total: 0 }
  });
  const account = currentAccount(req);
  if (account) attachAccountToOrder(order, account);
  const orders = [order, ...readStore("orders", []).filter((row) => row?.id !== order.id)];
  writeStore("orders", orders);
  const emailStatus = await sendFulfillmentEmail(order, "automatic");
  recordEmailStatus(order.id, { ...emailStatus, source: "automatic" });
  await sendCustomerConfirmation(order, "order-placed");
  const saved = readStore("orders", []).find((row) => row?.id === order.id) || order;
  return json(res, { ok: true, id: order.id, item: saved });
}

async function handleOrders(req, res, method, parts, input) {
  if (parts.length === 1 && method === "GET") {
    const denied = requireStaff(req, res);
    if (denied) return;
    return json(res, { ok: true, items: readStore("orders", []) });
  }
  if (parts.length === 1 && method === "POST") {
    const denied = requireStaff(req, res);
    if (denied) return;
    const order = normalizeOrder(input);
    if (!Object.keys(order.items).length) return json(res, { ok: false, error: "Order has no line items." }, 422);
    const account = currentAccount(req);
    if (account) attachAccountToOrder(order, account);
    const orders = [order, ...readStore("orders", []).filter((row) => row?.id !== order.id)];
    writeStore("orders", orders);
    const email = await sendFulfillmentEmail(order, "automatic");
    recordEmailStatus(order.id, { ...email, source: "automatic" });
    await sendCustomerConfirmation(order, "order-placed");
    const fresh = readStore("orders", []);
    return json(res, { ok: true, item: fresh.find((row) => row.id === order.id) || order, items: fresh });
  }
  if (parts.length >= 2 && method === "PATCH") {
    const staff = currentStaff(req);
    if (!staff) return json(res, { ok: false, error: "Staff sign-in required." }, 401);
    const id = clean(parts[1], 80);
    const orders = readStore("orders", []);
    let found = false;
    let deliveredTransition = false;
    let updatedOrder = null;
    for (let i = 0; i < orders.length; i += 1) {
      if (orders[i]?.id !== id) continue;
      const merged = {
        ...orders[i],
        delivery: orders[i].delivery && typeof orders[i].delivery === "object" ? { ...orders[i].delivery } : {}
      };
      if (input.status && input.status !== orders[i].status) {
        const nextStatus = clean(input.status, 40);
        deliveredTransition = nextStatus === "delivered";
        merged.status = nextStatus;
        merged.history = [...(orders[i].history || []), { status: nextStatus, at: Date.now() }];
      }
      if (input.staffNotes !== undefined) {
        // Internal notes are an append-only running log. Coerce any historical
        // value (bare string, array of strings, array of note objects) to note
        // objects, then append the new note authored server-side.
        const priorRaw = orders[i].staffNotes;
        const prior = Array.isArray(priorRaw)
          ? priorRaw.map((n) => (n && typeof n === "object")
              ? { at: n.at || orders[i].createdAt || Date.now(), author: n.author || "Staff", text: String(n.text == null ? "" : n.text) }
              : { at: orders[i].createdAt || Date.now(), author: "Staff", text: String(n == null ? "" : n) })
              .filter((n) => n.text)
          : (priorRaw ? [{ at: orders[i].createdAt || Date.now(), author: "Staff", text: String(priorRaw) }] : []);
        const note = {
          at: Date.now(),
          author: staff.name || staff.email || "Staff",
          text: clean(input.staffNotes, 2000)
        };
        merged.staffNotes = note.text ? [...prior, note] : prior;
      }
      if (input.delivery && typeof input.delivery === "object") {
        if (input.delivery.window !== undefined) merged.delivery.window = clean(input.delivery.window, 80);
        if (input.delivery.notes !== undefined) merged.delivery.notes = clean(input.delivery.notes, 1200);
        if (input.delivery.date !== undefined) merged.delivery.date = clean(input.delivery.date, 20); // YYYY-MM-DD or ""
        if (input.delivery.address !== undefined) merged.delivery.address = clean(input.delivery.address, 400);
        if (input.delivery.method !== undefined && ["delivery", "pickup"].includes(input.delivery.method)) merged.delivery.method = input.delivery.method;
      }
      orders[i] = normalizeOrder(merged, orders[i]);
      updatedOrder = orders[i];
      found = true;
    }
    if (!found) return json(res, { ok: false, error: "Order not found." }, 404);
    writeStore("orders", orders);
    if (deliveredTransition && updatedOrder?.deliveryEmail?.status !== "sent") {
      await sendCustomerDeliveryEmail(updatedOrder, staff);
    }
    const fresh = readStore("orders", []);
    return json(res, { ok: true, items: fresh, item: fresh.find((row) => row.id === id) });
  }
  if (parts.length === 3 && parts[2] === "fulfillment-email" && method === "POST") {
    const user = currentStaff(req);
    if (!user) return json(res, { ok: false, error: "Staff sign-in required." }, 401);
    const id = clean(parts[1], 80);
    const order = readStore("orders", []).find((row) => row?.id === id);
    if (!order) return json(res, { ok: false, error: "Order not found." }, 404);
    const email = await sendFulfillmentEmail(order, "manual", user);
    const latest = recordEmailStatus(id, { ...email, source: "manual" });
    return json(res, { ok: true, item: latest, items: readStore("orders", []), email: latest?.fulfillmentEmail || {} });
  }
  // Staff re-sends the customer's receipt/confirmation for an order.
  if (parts.length === 3 && parts[2] === "receipt-email" && method === "POST") {
    const denied = requireStaff(req, res);
    if (denied) return;
    const order = readStore("orders", []).find((row) => row?.id === clean(parts[1], 80));
    if (!order) return json(res, { ok: false, error: "Order not found." }, 404);
    const to = clean(order.customer?.email, 180);
    if (!to) return json(res, { ok: false, error: "This order has no customer email." }, 422);
    const base = config.siteBaseUrl || config.adminBaseUrl || "";
    const template = buildCustomerEmail(order, base ? `${base}/account` : "");
    const result = await sendTransactionalEmail({
      to,
      subject: `Your Lunde Flooring receipt — order ${order.id}`,
      idempotencyKey: `lunde-receipt-${order.id}-${Date.now()}`,
      ...template
    });
    if (result.status !== "sent") return json(res, { ok: false, error: result.error || "Could not send the receipt." }, 502);
    return json(res, { ok: true, email: result });
  }
  return json(res, { ok: false, error: "Not found" }, 404);
}

function handleCustomers(req, res, method, input) {
  if (method === "GET") {
    const denied = requireStaff(req, res);
    if (denied) return;
    return json(res, { ok: true, items: publicCustomers() });
  }
  if (method === "POST") {
    const denied = requireStaff(req, res);
    if (denied) return;
    const record = { ...input, id: clean(input.id || `CUST-${crypto.randomBytes(4).toString("hex").toUpperCase()}`, 80), email: clean(input.email, 180).toLowerCase() };
    const items = upsertById("customers", record);
    return json(res, { ok: true, item: publicCustomer(record), items: items.map(publicCustomer) });
  }
  if (method === "PATCH") {
    const denied = requireStaff(req, res);
    if (denied) return;
    const id = clean(input.id, 80);
    const patch = input.patch && typeof input.patch === "object" ? input.patch : {};
    const list = readStore("customers", []);
    let found = false;
    for (let i = 0; i < list.length; i += 1) {
      if (list[i]?.id === id) {
        list[i] = deepMerge(list[i], patch);
        found = true;
        break;
      }
    }
    if (!found && id) list.push({ id, createdAt: Date.now(), ...patch });
    writeStore("customers", list);
    return json(res, { ok: true, items: list.map(publicCustomer) });
  }
  return json(res, { ok: false, error: "Not found" }, 404);
}

async function handleCustomerAccounts(req, res, method, parts, input) {
  if (parts[1] === "signup" && method === "POST") {
    const email = clean(input.email, 180).toLowerCase();
    if (rateLimit(res, `customer-signup:${clientIp(req)}:${email || "missing"}`, 5, 60 * 60 * 1000)) return;
    const password = String(input.password || "");
    if (!validEmail(email)) return json(res, { ok: false, error: "Enter a valid email address." }, 422);
    const passwordError = passwordStrengthError(password);
    if (passwordError) return json(res, { ok: false, error: passwordError }, 422);
    const accounts = readStore("accounts", []);
    if (accounts.some((row) => String(row.email || "").toLowerCase() === email)) return json(res, { ok: false, error: "An account with that email already exists." }, 409);
    const token = secureToken();
    const account = {
      id: clean(input.id || `CUST-${crypto.randomBytes(4).toString("hex").toUpperCase()}`, 80),
      createdAt: Number(input.createdAt || Date.now()),
      name: clean(input.name, 180),
      company: clean(input.company, 180),
      email,
      phone: clean(input.phone, 80),
      addresses: [],
      password: await hashCustomerPassword(password),
      emailVerified: false,
      emailVerifiedAt: 0,
      verificationTokenHash: hashToken(token),
      verificationTokenExpiresAt: Date.now() + VERIFY_TTL,
      verificationSentAt: Date.now()
    };
    writeStore("accounts", [account, ...accounts]);
    upsertById("customers", publicCustomer(account));
    const emailResult = await sendVerificationEmail(account, token, req);
    const body = {
      ok: true,
      pendingVerification: true,
      email,
      emailSent: emailResult.status === "sent",
      emailStatus: emailResult.status,
      message: "Account created. Please verify your email before signing in."
    };
    if (emailResult.devUrl) body.devVerificationUrl = emailResult.devUrl;
    return json(res, body);
  }
  if (parts[1] === "login" && method === "POST") {
    const email = clean(input.email, 180).toLowerCase();
    if (rateLimit(res, `customer-login:${clientIp(req)}:${email || "missing"}`, 10, 15 * 60 * 1000)) return;
    const accounts = readStore("accounts", []);
    const index = accounts.findIndex((row) => String(row.email || "").toLowerCase() === email);
    const account = index >= 0 ? accounts[index] : null;
    if (!account || !(await verifyCustomerPassword(String(input.password || ""), String(account.password || "")))) {
      return json(res, { ok: false, error: "Email or password did not match." }, 401);
    }
    if (!account.emailVerified) {
      return json(res, { ok: false, code: "email_unverified", email, error: "Please verify your email before signing in." }, 403);
    }
    if (!String(account.password || "").startsWith("$2")) {
      account.password = await hashCustomerPassword(String(input.password || ""));
      accounts[index] = account;
      writeStore("accounts", accounts);
    }
    // Catch any guest orders placed with this email since last sign-in.
    linkGuestOrders(account);
    createCustomerSession(req, res, account);
    return json(res, { ok: true, account: publicCustomer(account) });
  }
  if (parts[1] === "me" && method === "GET") {
    const account = currentAccount(req);
    return account ? json(res, { ok: true, account: publicCustomer(account) }) : json(res, { ok: false, signedOut: true, error: "Not signed in." });
  }
  if (parts[1] === "logout" && method === "POST") {
    destroyCustomerSession(req, res);
    return json(res, { ok: true });
  }
  if (parts[1] === "verification" && parts[2] === "resend" && method === "POST") {
    const email = clean(input.email, 180).toLowerCase();
    if (rateLimit(res, `customer-verify-resend:${clientIp(req)}:${email || "missing"}`, 5, 60 * 60 * 1000)) return;
    let devUrl = "";
    if (validEmail(email)) {
      const accounts = readStore("accounts", []);
      const index = accounts.findIndex((row) => String(row.email || "").toLowerCase() === email);
      if (index >= 0 && !accounts[index].emailVerified) {
        const token = secureToken();
        accounts[index].verificationTokenHash = hashToken(token);
        accounts[index].verificationTokenExpiresAt = Date.now() + VERIFY_TTL;
        accounts[index].verificationSentAt = Date.now();
        writeStore("accounts", accounts);
        const emailResult = await sendVerificationEmail(accounts[index], token, req);
        devUrl = emailResult.devUrl || "";
      }
    }
    return json(res, { ok: true, message: "If that account needs verification, we sent a new link.", ...(devUrl ? { devVerificationUrl: devUrl } : {}) });
  }
  if (parts[1] === "verify-email" && method === "POST") {
    const tokenHash = hashToken(String(input.token || ""));
    const accounts = readStore("accounts", []);
    const index = accounts.findIndex((row) => row?.verificationTokenHash && safeEqual(row.verificationTokenHash, tokenHash));
    if (index < 0) return json(res, { ok: false, error: "Verification link is invalid or expired." }, 400);
    const account = accounts[index];
    if (Date.now() > Number(account.verificationTokenExpiresAt || 0)) {
      return json(res, { ok: false, error: "Verification link is invalid or expired.", expired: true, email: account.email }, 400);
    }
    account.emailVerified = true;
    account.emailVerifiedAt = Date.now();
    delete account.verificationTokenHash;
    delete account.verificationTokenExpiresAt;
    delete account.verificationSentAt;
    accounts[index] = account;
    writeStore("accounts", accounts);
    upsertById("customers", publicCustomer(account));
    return json(res, { ok: true, account: publicCustomer(account), redirect: "/account/login?verified=1" });
  }
  if (parts[1] === "password-reset" && parts[2] === "request" && method === "POST") {
    const email = clean(input.email, 180).toLowerCase();
    if (rateLimit(res, `customer-reset:${clientIp(req)}:${email || "missing"}`, 5, 60 * 60 * 1000)) return;
    let devUrl = "";
    if (validEmail(email)) {
      const accounts = readStore("accounts", []);
      const index = accounts.findIndex((row) => String(row.email || "").toLowerCase() === email && row.emailVerified);
      if (index >= 0) {
        const token = secureToken();
        accounts[index].resetTokenHash = hashToken(token);
        accounts[index].resetTokenExpiresAt = Date.now() + RESET_TTL;
        accounts[index].resetRequestedAt = Date.now();
        writeStore("accounts", accounts);
        const emailResult = await sendPasswordResetEmail(accounts[index], token, req);
        devUrl = emailResult.devUrl || "";
      }
    }
    return json(res, { ok: true, message: "If an account exists, password reset instructions have been sent.", ...(devUrl ? { devResetUrl: devUrl } : {}) });
  }
  if (parts[1] === "password-reset" && parts[2] === "confirm" && method === "POST") {
    const tokenHash = hashToken(String(input.token || ""));
    const password = String(input.password || "");
    const passwordError = passwordStrengthError(password);
    if (passwordError) return json(res, { ok: false, error: passwordError }, 422);
    const accounts = readStore("accounts", []);
    const index = accounts.findIndex((row) => row?.resetTokenHash && safeEqual(row.resetTokenHash, tokenHash));
    if (index < 0 || Date.now() > Number(accounts[index].resetTokenExpiresAt || 0)) {
      return json(res, { ok: false, error: "Password reset link is invalid or expired." }, 400);
    }
    accounts[index].password = await hashCustomerPassword(password);
    delete accounts[index].resetTokenHash;
    delete accounts[index].resetTokenExpiresAt;
    delete accounts[index].resetRequestedAt;
    writeStore("accounts", accounts);
    destroyCustomerSessionsFor(accounts[index].id);
    return json(res, { ok: true, message: "Password updated. Please sign in with your new password." });
  }
  if (parts[1] === "password" && method === "POST") {
    const sessionAccount = currentAccount(req);
    if (!sessionAccount) return json(res, { ok: false, error: "Not signed in." }, 401);
    const accounts = readStore("accounts", []);
    const index = accounts.findIndex((row) => row?.id === sessionAccount.id);
    if (index < 0) return json(res, { ok: false, error: "Not signed in." }, 401);
    if (!(await verifyCustomerPassword(String(input.currentPassword || ""), String(accounts[index].password || "")))) {
      return json(res, { ok: false, error: "Current password did not match." }, 401);
    }
    const passwordError = passwordStrengthError(String(input.newPassword || ""));
    if (passwordError) return json(res, { ok: false, error: passwordError }, 422);
    accounts[index].password = await hashCustomerPassword(String(input.newPassword || ""));
    delete accounts[index].resetTokenHash;
    delete accounts[index].resetTokenExpiresAt;
    delete accounts[index].resetRequestedAt;
    writeStore("accounts", accounts);
    return json(res, { ok: true });
  }
  // A customer can only ever read THEIR OWN orders (matched by account id or email).
  if (parts[1] === "orders" && method === "GET") {
    const account = currentAccount(req);
    if (!account) return json(res, { ok: false, error: "Not signed in." }, 401);
    return json(res, { ok: true, items: ordersForAccount(account) });
  }
  // Update the signed-in customer's own profile / saved addresses (server-backed, cross-device).
  if (parts[1] === "profile" && method === "PATCH") {
    const accounts = readStore("accounts", []);
    const active = currentAccount(req);
    const index = accounts.findIndex((row) => row?.id === active?.id);
    if (index < 0) return json(res, { ok: false, error: "Not signed in." }, 401);
    const patch = input.patch && typeof input.patch === "object" ? input.patch : input;
    const account = accounts[index];
    if (patch.name !== undefined) account.name = clean(patch.name, 180);
    if (patch.company !== undefined) account.company = clean(patch.company, 180);
    if (patch.phone !== undefined) account.phone = clean(patch.phone, 80);
    if (Array.isArray(patch.addresses)) account.addresses = patch.addresses.slice(0, 20).map(normalizeAddress);
    if (Array.isArray(patch.favorites)) account.favorites = [...new Set(patch.favorites.slice(0, 200).map((v) => clean(v, 80)).filter(Boolean))];
    if (patch.avatar !== undefined) {
      const avatar = String(patch.avatar || "");
      // Small client-downscaled data URL only; empty string removes the photo.
      if (avatar === "" || (/^data:image\/(png|jpeg|webp);base64,/.test(avatar) && avatar.length <= 200000)) {
        account.avatar = avatar;
      }
    }
    if (patch.notifications && typeof patch.notifications === "object") {
      const prefs = {};
      for (const key of ["samplesFollowUp", "newCollections", "promotions"]) {
        if (patch.notifications[key] !== undefined) prefs[key] = Boolean(patch.notifications[key]);
      }
      account.notifications = { ...(account.notifications || {}), ...prefs };
    }
    accounts[index] = account;
    writeStore("accounts", accounts);
    upsertById("customers", publicCustomer(account));
    return json(res, { ok: true, account: publicCustomer(account) });
  }
  return json(res, { ok: false, error: "Not found" }, 404);
}

function ordersForAccount(account) {
  const email = String(account.email || "").toLowerCase();
  return readStore("orders", []).filter((order) =>
    (order?.checkout && order.checkout.customerId === account.id) ||
    String(order?.customer?.email || "").toLowerCase() === email
  );
}

function linkGuestOrders(account) {
  const email = String(account.email || "").toLowerCase();
  if (!email) return 0;
  const orders = readStore("orders", []);
  let changed = 0;
  for (const order of orders) {
    if (order?.checkout?.customerId) continue;
    if (String(order?.customer?.email || "").toLowerCase() !== email) continue;
    order.checkout = { ...(order.checkout || {}), customerId: account.id };
    changed += 1;
  }
  if (changed) writeStore("orders", orders);
  return changed;
}

function attachAccountToOrder(order, account) {
  if (!order || !account) return order;
  order.checkout = { ...(order.checkout || {}), mode: "account", customerId: account.id };
  order.customer = {
    ...(order.customer || {}),
    name: order.customer?.name || account.name || "",
    company: order.customer?.company || account.company || "",
    email: order.customer?.email || account.email || "",
    phone: order.customer?.phone || account.phone || ""
  };
  return order;
}

function normalizeAddress(addr) {
  addr = addr && typeof addr === "object" ? addr : {};
  return {
    id: clean(addr.id || `ADDR-${crypto.randomBytes(3).toString("hex").toUpperCase()}`, 60),
    label: clean(addr.label || "Home", 60),
    line1: clean(addr.line1 || "", 200),
    city: clean(addr.city || "", 80),
    state: clean(addr.state || "", 40),
    zip: clean(addr.zip || "", 20),
    isDefault: Boolean(addr.isDefault)
  };
}

async function handleListStore(req, res, method, parts, input) {
  const store = parts[0];
  // These shared stores hold customer PII (contact messages, quotes, internal
  // notes). Reads and mutations are staff-only. The one public path is POSTing
  // feedback, so the storefront contact/feedback forms can submit.
  const publicPost = method === "POST" && store === "feedback";
  if (!publicPost) {
    const denied = requireStaff(req, res);
    if (denied) return;
  }
  if (method === "GET") return json(res, { ok: true, items: readStore(store, []) });
  // Staff emails a saved quote to its customer; marks it sent with a 30-day expiry.
  if (store === "quotes" && parts.length === 3 && parts[2] === "send" && method === "POST") {
    const denied = requireStaff(req, res);
    if (denied) return;
    const staff = currentStaff(req);
    const id = clean(parts[1], 100);
    const quote = readStore("quotes", []).find((row) => row?.id === id);
    if (!quote) return json(res, { ok: false, error: "Quote not found." }, 404);
    const expiresAt = Number(quote.expiresAt) || (Number(quote.createdAt) || Date.now()) + 30 * 86400000;
    const result = await sendQuoteEmail({ ...quote, expiresAt }, staff);
    if (result.status !== "sent") return json(res, { ok: false, error: result.error || "Could not send the quote." }, 502);
    const items = readStore("quotes", []).map((row) => row?.id === id
      ? { ...row, status: row.status === "won" ? "won" : "sent", sentAt: Date.now(), expiresAt, updatedAt: Date.now() }
      : row);
    writeStore("quotes", items);
    return json(res, { ok: true, items, item: items.find((row) => row?.id === id) });
  }
  // Staff replies to a customer message: email via Resend, log on the item.
  if (store === "feedback" && parts.length === 3 && parts[2] === "reply" && method === "POST") {
    const denied = requireStaff(req, res);
    if (denied) return;
    const staff = currentStaff(req);
    const id = clean(parts[1], 100);
    const item = readStore("feedback", []).find((row) => row?.id === id);
    if (!item) return json(res, { ok: false, error: "Message not found." }, 404);
    const to = clean(item.email, 180);
    if (!to) return json(res, { ok: false, error: "This message has no email address to reply to." }, 422);
    const body = clean(input.message, 4000);
    if (!body) return json(res, { ok: false, error: "Write a reply first." }, 422);
    const settings = getSettings();
    const html = `<p>${escapeHtml(body).replace(/\n/g, "<br>")}</p><p style="color:#888;font-size:13px">— ${escapeHtml(staff.name || "Lunde Flooring")}, ${escapeHtml(settings.businessName)}<br>In reply to: “${escapeHtml(clean(item.message, 300))}”</p>`;
    const result = await sendTransactionalEmail({
      to,
      subject: `Re: your message to ${settings.businessName}`,
      html,
      text: `${body}\n\n— ${staff.name || "Lunde Flooring"}, ${settings.businessName}`,
      idempotencyKey: `lunde-msg-reply-${id}-${Date.now()}`
    });
    if (result.status !== "sent") return json(res, { ok: false, error: result.error || "Could not send the reply." }, 502);
    const reply = { at: Date.now(), author: staff.name || staff.email || "Staff", message: body };
    const items = readStore("feedback", []).map((row) => row?.id === id
      ? { ...row, replies: [...(Array.isArray(row.replies) ? row.replies : []), reply], status: row.status === "resolved" ? "resolved" : "open" }
      : row);
    writeStore("feedback", items);
    return json(res, { ok: true, items, reply });
  }
  if (method === "POST") {
    const items = upsertById(store, { createdAt: Date.now(), ...input });
    const created = items[0] || null;
    // New customer inquiries alert the shop (fire-and-forget; never blocks the submitter).
    if (publicPost && created && created.source !== "staff" && getSettings().emailNewMessageAlert !== false) {
      notifyNewMessage(created).catch(() => {});
    }
    // Never echo the whole store back to an anonymous submitter.
    if (publicPost) return json(res, { ok: true, item: created });
    return json(res, { ok: true, items, item: created });
  }
  if (method === "PATCH") {
    const id = clean(parts[1] || input.id, 100);
    const items = readStore(store, []).map((row) => row?.id === id ? deepMerge(row, input) : row);
    writeStore(store, items);
    return json(res, { ok: true, items });
  }
  if (method === "DELETE") {
    const id = clean(parts[1] || input.id, 100);
    const items = readStore(store, []).filter((row) => row?.id !== id);
    writeStore(store, items);
    return json(res, { ok: true, items });
  }
  return json(res, { ok: false, error: "Not found" }, 404);
}

function handleInventory(req, res, method, input) {
  if (method === "GET") {
    const denied = requireStaff(req, res);
    if (denied) return;
    return json(res, { ok: true, items: readStore("inventory", {}) });
  }
  if (method === "PUT") {
    const denied = requireStaff(req, res);
    if (denied) return;
    const items = readStore("inventory", {});
    if (input.items && typeof input.items === "object") {
      for (const [id, n] of Object.entries(input.items)) items[clean(id, 80)] = Math.max(0, Math.round(Number(n) || 0));
    } else if (input.id) {
      items[clean(input.id, 80)] = Math.max(0, Math.round(Number(input.cartons ?? input.value ?? 0)));
    }
    writeStore("inventory", items);
    return json(res, { ok: true, items });
  }
  return json(res, { ok: false, error: "Not found" }, 404);
}

function handleProducts(req, res, method, input) {
  if (method === "GET") {
    const denied = requireStaff(req, res);
    if (denied) return;
    return json(res, { ok: true, items: readStore("products", {}) });
  }
  if (method === "PUT") {
    const denied = requireStaff(req, res);
    if (denied) return;
    const items = readStore("products", {});
    const id = clean(input.id, 80);
    if (id) items[id] = input.patch && typeof input.patch === "object" ? input.patch : {};
    writeStore("products", items);
    return json(res, { ok: true, items });
  }
  return json(res, { ok: false, error: "Not found" }, 404);
}

const STAFF_PAGES = new Set([
  "dashboard.html", "orders.html", "order.html", "inventory.html", "products.html",
  "product-edit.html", "customers.html", "customer-profile.html", "quotes.html",
  "quote-builder.html", "reports.html", "messages.html", "settings.html", "staff-users.html"
]);

// Pages that additionally require Owner (admin-management) privileges.
const OWNER_PAGES = new Set(["staff-users.html"]);

async function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    return res.end();
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (pathname.split("/").some((part) => part.startsWith(".")) || pathname.startsWith("/api/data/")) return notFound(res);

  // ---- Customer account area (clean URLs, server-gated) ----
  if (pathname === "/account" || pathname === "/account/") {
    if (!currentAccountId(req)) return redirect(res, "/account/login");
    pathname = "/account.html";
  } else if (pathname === "/account/login") {
    pathname = "/account-login.html";
  } else if (pathname === "/account/register") {
    pathname = "/account-register.html";
  } else if (pathname === "/account/reset") {
    pathname = "/account-reset.html";
  } else if (pathname === "/account/verify") {
    pathname = "/account-verify.html";
  } else if (pathname === "/account.html") {
    return redirect(res, "/account");
  }

  // ---- Staff admin entry points (/admin, /admin/login, app.* host) ----
  // /admin shows the admin sign-in (served at the /admin URL, no redirect) for
  // logged-out staff, and goes straight to the dashboard once signed in.
  const host = String(req.headers.host || "").toLowerCase();
  if (pathname === "/admin" || pathname === "/admin/" || pathname === "/admin/login" || (host.startsWith("app.") && pathname === "/index.html")) {
    if (currentStaff(req)) return redirect(res, "/dashboard.html");
    pathname = "/admin.html";
  } else if (pathname === "/admin.html" && currentStaff(req)) {
    return redirect(res, "/dashboard.html");
  } else if (pathname === "/admin/reset") {
    // Public staff password-reset page (request link + set new password).
    pathname = "/staff-reset.html";
  }

  // Gate staff console pages: never serve admin HTML without a valid staff session.
  const basename = pathname.split("/").pop() || "";
  if (STAFF_PAGES.has(basename)) {
    const staff = currentStaff(req);
    if (!staff) return redirect(res, `/admin?next=${encodeURIComponent(basename)}`);
    if (OWNER_PAGES.has(basename) && !staff.canManageAdmins) return redirect(res, "/dashboard.html");
  }
  let filePath = path.normalize(path.join(__dirname, pathname));
  if (!filePath.startsWith(__dirname)) return notFound(res);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, "index.html");
  if (!fs.existsSync(filePath) && !path.extname(filePath)) filePath += ".html";
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return notFound(res);
  const ext = path.extname(filePath).toLowerCase();
  // First-party page-view counting: public HTML pages only, never staff/console.
  if (ext === ".html" && req.method === "GET" && !STAFF_PAGES.has(basename) &&
      !["admin.html", "login.html", "staff-reset.html"].includes(basename)) {
    recordPageView(req, basename);
  }
  const stat = fs.statSync(filePath);
  const lastModified = stat.mtime.toUTCString();
  const etag = `"${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`;
  // Hard-cache static media (stable filenames); revalidate code/markup so updates
  // reach returning visitors immediately after a deploy.
  const longCache = [".webp", ".png", ".jpg", ".jpeg", ".ico", ".svg", ".woff", ".woff2"].includes(ext);
  const cacheControl = longCache ? "public, max-age=31536000, immutable" : "no-cache";
  const ifNoneMatch = req.headers["if-none-match"];
  const ifModifiedSince = Date.parse(req.headers["if-modified-since"] || "");
  if ((ifNoneMatch && ifNoneMatch === etag) || (ifModifiedSince && ifModifiedSince >= Math.floor(stat.mtimeMs / 1000) * 1000)) {
    res.writeHead(304, { ETag: etag, "Last-Modified": lastModified, "Cache-Control": cacheControl });
    return res.end();
  }
  // Per-product SEO: rewrite product.html's <head> for the requested floor.
  if (basename === "product.html" && url.searchParams.get("slug")) {
    const product = productBySlug(url.searchParams.get("slug"));
    if (product) {
      const html = injectProductMeta(fs.readFileSync(filePath, "utf8"), product);
      res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-cache" });
      if (req.method === "HEAD") return res.end();
      return res.end(html);
    }
  }
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": cacheControl,
    "Last-Modified": lastModified,
    ETag: etag
  });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(filePath).pipe(res);
}

function productsById() {
  const raw = fs.readFileSync(path.join(__dirname, "data.js"), "utf8");
  const match = raw.match(/const products = (\[[\s\S]*?\]);\s*const productGalleries/);
  const products = match ? JSON.parse(match[1]) : [];
  return Object.fromEntries(products.map((p) => [String(p.id), p]));
}

function productIsArchived(product) {
  const sku = String(product.sku || product.id || "");
  const text = [product.title, product.style, product.collection, product.specs?.construction].join(" ");
  return sku.startsWith("L24") || /laminate/i.test(text);
}

/* ---- SEO: robots, sitemap, and per-product meta injection --------------- */
const SEO_BASE = (process.env.SITE_BASE_URL || "https://lundeflooring.com").replace(/\/+$/, "");

// Public, indexable static pages (checked against disk before listing).
const SEO_STATIC_PAGES = [
  ["/", "1.0", "weekly"],
  ["/catalog.html", "0.9", "weekly"],
  ["/areas-we-serve.html", "0.7", "monthly"],
  ["/samples.html", "0.7", "monthly"],
  ["/install.html", "0.6", "monthly"],
  ["/care-maintenance.html", "0.6", "monthly"],
  ["/warranty.html", "0.6", "monthly"],
  ["/faq.html", "0.6", "monthly"],
  ["/shipping-returns.html", "0.5", "monthly"],
  ["/our-story.html", "0.5", "monthly"],
  ["/contact.html", "0.6", "monthly"],
  ["/privacy.html", "0.2", "yearly"],
  ["/terms.html", "0.2", "yearly"],
  ["/accessibility.html", "0.2", "yearly"]
];

// Evaluate data.js in a minimal `window` shim so the server sees the exact
// customer-facing catalog (nice titles, series names) the browser builds — not
// the raw internal codes. Cached, refreshed when data.js changes on disk.
let _seoCatalog = { mtime: 0, list: [], bySlug: {} };
function loadPublicCatalog() {
  const dataFile = path.join(__dirname, "data.js");
  const mtime = fs.statSync(dataFile).mtimeMs;
  if (mtime === _seoCatalog.mtime && _seoCatalog.list.length) return _seoCatalog;
  const win = {};
  try {
    // data.js is a plain browser script that assigns onto `window`.
    // eslint-disable-next-line no-new-func
    new Function("window", fs.readFileSync(dataFile, "utf8") + "\n;return window;")(win);
  } catch (e) {
    logOperationalEvent("error", "seo_catalog_parse_failed", { message: e.message });
  }
  const list = (win.LUNDE_PUBLIC_PRODUCTS || []).filter((p) => !productIsArchived(p));
  const bySlug = {};
  list.forEach((p) => { bySlug[p.slug] = p; });
  _seoCatalog = { mtime, list, bySlug };
  return _seoCatalog;
}

function publicProductList() {
  return loadPublicCatalog().list;
}

function xmlEscape(s) {
  return String(s || "").replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

function serveRobots(res) {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /account",
    "Disallow: /cart.html",
    "Disallow: /checkout.html",
    "Disallow: /my-order.html",
    "Disallow: /order-confirmed.html",
    "Disallow: /login.html",
    "Disallow: /dashboard.html",
    "Disallow: /orders.html",
    "Disallow: /order.html",
    "Disallow: /inventory.html",
    "Disallow: /products.html",
    "Disallow: /customers.html",
    "Disallow: /quotes.html",
    "Disallow: /reports.html",
    "Disallow: /messages.html",
    "Disallow: /settings.html",
    "Disallow: /staff-users.html",
    "Disallow: /api/",
    "",
    `Sitemap: ${SEO_BASE}/sitemap.xml`,
    ""
  ].join("\n");
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" });
  res.end(body);
}

function serveSitemap(res) {
  const urls = [];
  const fmt = (mtime) => new Date(mtime).toISOString().slice(0, 10);
  for (const [loc, priority, freq] of SEO_STATIC_PAGES) {
    const file = loc === "/" ? "index.html" : loc.replace(/^\//, "");
    const abs = path.join(__dirname, file);
    if (!fs.existsSync(abs)) continue;
    urls.push({ loc: SEO_BASE + loc, lastmod: fmt(fs.statSync(abs).mtimeMs), priority, freq });
  }
  try {
    const productMtime = fmt(fs.statSync(path.join(__dirname, "data.js")).mtimeMs);
    for (const p of publicProductList()) {
      urls.push({ loc: `${SEO_BASE}/product.html?slug=${encodeURIComponent(p.slug)}`, lastmod: productMtime, priority: "0.7", freq: "monthly" });
    }
  } catch { /* if data.js can't be parsed, still return the static sitemap */ }
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) =>
      `  <url><loc>${xmlEscape(u.loc)}</loc><lastmod>${u.lastmod}</lastmod>` +
      `<changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`).join("\n") +
    "\n</urlset>\n";
  res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" });
  res.end(body);
}

function productBySlug(slug) {
  try { return loadPublicCatalog().bySlug[slug] || null; } catch { return null; }
}

function absMedia(src) {
  if (!src) return SEO_BASE + "/media/new-site/hostinger-v7/web/hero-living.webp";
  return SEO_BASE + "/" + String(src).replace(/^\.?\//, "");
}

// Rewrite product.html's <head> for a specific floor: unique title, description,
// canonical, Open Graph, and Product JSON-LD — so each of the 67 floors is a
// crawlable, locally-optimized page even though the body renders client-side.
function injectProductMeta(html, p) {
  const canonical = `${SEO_BASE}/product.html?slug=${encodeURIComponent(p.slug)}`;
  const title = `${p.title} | LVP Flooring in Bakersfield | Lunde Flooring Co.`;
  const desc = `Shop ${p.title}, a waterproof luxury vinyl plank floor in the ${p.collection}. ` +
    `Sold by the carton at $${Number(p.pricePerSqft).toFixed(2)}/sq. ft. with local delivery across ` +
    `Bakersfield and Kern County. Order a free sample from Lunde Flooring Co.`;
  const img = absMedia(p.mainImage);
  const room = absMedia(p.roomImage);
  const ld = {
    "@context": "https://schema.org", "@type": "Product",
    name: p.title, image: [img, room], description: desc, sku: p.sku || p.id,
    brand: { "@type": "Brand", name: "Lunde Flooring Co." },
    category: "Luxury Vinyl Plank Flooring",
    color: p.color || undefined,
    offers: {
      "@type": "Offer", priceCurrency: "USD", price: Number(p.pricePerSqft).toFixed(2),
      availability: "https://schema.org/InStock", itemCondition: "https://schema.org/NewCondition",
      url: canonical, seller: { "@id": SEO_BASE + "/#business" },
      areaServed: "Bakersfield & Kern County, California"
    }
  };
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SEO_BASE + "/" },
      { "@type": "ListItem", position: 2, name: "Floors", item: SEO_BASE + "/catalog.html" },
      { "@type": "ListItem", position: 3, name: p.title, item: canonical }
    ]
  };
  const injected =
    `\n    <link rel="canonical" href="${esc(canonical)}">` +
    `\n    <meta property="og:type" content="product">` +
    `\n    <meta property="og:title" content="${esc(title)}">` +
    `\n    <meta property="og:description" content="${esc(desc)}">` +
    `\n    <meta property="og:image" content="${esc(img)}">` +
    `\n    <meta property="og:url" content="${esc(canonical)}">` +
    `\n    <meta name="twitter:card" content="summary_large_image">` +
    `\n    <script type="application/ld+json">${JSON.stringify(ld)}</script>` +
    `\n    <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>`;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(/<meta name="description" content="[\s\S]*?">/, `<meta name="description" content="${esc(desc)}">`);
  html = html.replace(/<\/head>/, injected + "\n  </head>");
  return html;
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function computeOrderTotals(items, delivery, placement, promoCode) {
  const products = productsById();
  let material = 0;
  let samples = 0;
  let cartons = 0;
  for (const [id, entry] of Object.entries(items || {})) {
    const product = products[id];
    if (!product || productIsArchived(product) || !entry) continue;
    const sqft = Math.max(0, Number(entry.sqft || 0));
    const sampleCount = Math.max(0, Math.round(Number(entry.samples || 0)));
    if (sqft > 0) {
      const lineCartons = cartonsFor(product, sqft);
      cartons += lineCartons;
      material += lineCartons * cartonPrice(product);
    }
    samples += sampleCount * Number(product.samplePrice || 0);
  }
  const subtotal = material + samples;
  const promo = promoForCode(promoCode);
  const discount = promo ? Math.min(subtotal, promo.type === "percent" ? subtotal * promo.value : promo.value) : 0;
  const discountedSubtotal = Math.max(0, subtotal - discount);
  // Pricing knobs come from staff Settings (with the historical values as defaults).
  const pricing = getSettings();
  const garagePlacement = delivery === "pickup" || placement !== "garage" ? 0 : cartons * pricing.garagePerCarton;
  const freeDelivery = discountedSubtotal >= pricing.freeShipOver;
  const baseFreight = delivery === "pickup" || freeDelivery || material <= 0 ? 0 : pricing.freightFlat;
  const freight = baseFreight + garagePlacement;
  const tax = discountedSubtotal * pricing.taxRate;
  return { material, samples, cartons, subtotal, discount, discountedSubtotal, promo, freight, garagePlacement, tax, total: discountedSubtotal + freight + tax };
}

function normalizeOrder(order, base = {}) {
  const statuses = ["placed", "processing", "shipped", "delivered", "cancelled"];
  const items = {};
  for (const [id, entry] of Object.entries(order.items || base.items || {})) {
    if (!entry || typeof entry !== "object") continue;
    items[clean(id, 60)] = { sqft: Math.max(0, Number(entry.sqft || 0)), samples: Math.max(0, Math.round(Number(entry.samples || 0))) };
  }
  const status = statuses.includes(order.status) ? order.status : (base.status || "placed");
  const createdAt = Number(order.createdAt || base.createdAt || Date.now());
  let history = Array.isArray(order.history) ? order.history : (base.history || []);
  history = history.filter((row) => row && statuses.includes(row.status)).map((row) => ({ status: row.status, at: Number(row.at || createdAt) }));
  if (!history.length) history = [{ status, at: createdAt }];
  const totals = order.totals && typeof order.totals === "object" ? order.totals : (base.totals || {});
  const delivery = order.delivery && typeof order.delivery === "object" ? order.delivery : (base.delivery || {});
  const customer = order.customer && typeof order.customer === "object" ? order.customer : (base.customer || {});
  return {
    id: clean(order.id || base.id || `LU-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`, 80),
    createdAt,
    status,
    history,
    items,
    totals: {
      material: Number(totals.material || 0),
      samples: Number(totals.samples || 0),
      cartons: Number(totals.cartons || 0),
      subtotal: Number(totals.subtotal || 0),
      discount: Number(totals.discount || 0),
      freight: Number(totals.freight || 0),
      garagePlacement: Number(totals.garagePlacement || 0),
      tax: Number(totals.tax || 0),
      total: Number(totals.total || 0)
    },
    checkout: order.checkout && typeof order.checkout === "object" ? order.checkout : (base.checkout || {}),
    delivery: {
      method: clean(delivery.method || "pickup", 40),
      address: clean(delivery.address || "", 500),
      addressId: clean(delivery.addressId || "", 80),
      label: clean(delivery.label || "", 80),
      window: clean(delivery.window || "", 80),
      placement: clean(delivery.placement || "", 80),
      notes: clean(delivery.notes || "", 1200)
    },
    customer: {
      name: clean(customer.name || "", 180),
      company: clean(customer.company || "", 180),
      project: clean(customer.project || "", 180),
      email: clean(customer.email || "", 180),
      phone: clean(customer.phone || "", 80)
    },
    payment: order.payment && typeof order.payment === "object" ? order.payment : (base.payment || { last4: "", name: "" }),
    staffNotes: Array.isArray(order.staffNotes) ? order.staffNotes : (base.staffNotes || []),
    inventory: order.inventory && typeof order.inventory === "object" ? order.inventory : (base.inventory || {}),
    adminNotifications: Array.isArray(order.adminNotifications) ? order.adminNotifications : (base.adminNotifications || []),
    paymentNotices: Array.isArray(order.paymentNotices) ? order.paymentNotices : (base.paymentNotices || []),
    refunds: Array.isArray(order.refunds) ? order.refunds : (base.refunds || []),
    fulfillmentEmail: order.fulfillmentEmail && typeof order.fulfillmentEmail === "object" ? order.fulfillmentEmail : (base.fulfillmentEmail || {}),
    confirmationEmail: order.confirmationEmail && typeof order.confirmationEmail === "object" ? order.confirmationEmail : (base.confirmationEmail || {}),
    deliveryEmail: order.deliveryEmail && typeof order.deliveryEmail === "object" ? order.deliveryEmail : (base.deliveryEmail || {})
  };
}

function savePendingStripeOrder(order, session) {
  const pending = readStore("pending_stripe_orders", []);
  const row = {
    id: clean(order.id, 80),
    sessionId: clean(session?.id, 180),
    paymentIntentId: clean(session?.payment_intent, 180),
    status: "awaiting_payment",
    order,
    createdAt: Number(order.createdAt || Date.now()),
    updatedAt: Date.now()
  };
  writeStore("pending_stripe_orders", [row, ...pending.filter((item) => item?.id !== row.id && item?.sessionId !== row.sessionId)].slice(0, 500));
}

function pendingStripeOrder(orderId, sessionId) {
  const id = clean(orderId, 80);
  const sid = clean(sessionId, 180);
  return readStore("pending_stripe_orders", []).find((row) => (id && row?.id === id) || (sid && row?.sessionId === sid)) || null;
}

function markPendingStripeOrder(orderId, sessionId, status) {
  const id = clean(orderId, 80);
  const sid = clean(sessionId, 180);
  let changed = false;
  const pending = readStore("pending_stripe_orders", []).map((row) => {
    if (!row || !((id && row.id === id) || (sid && row.sessionId === sid))) return row;
    changed = true;
    return { ...row, status: clean(status, 60), updatedAt: Date.now() };
  });
  if (changed) writeStore("pending_stripe_orders", pending);
}

function findStripeOrder({ orderId, sessionId, paymentIntentId }) {
  const id = clean(orderId, 80);
  const sid = clean(sessionId, 180);
  const pi = clean(paymentIntentId, 180);
  return readStore("orders", []).find((order) =>
    (id && order?.id === id) ||
    (sid && order?.payment?.stripeSessionId === sid) ||
    (pi && order?.payment?.stripePaymentIntent === pi)
  ) || (id || sid ? pendingStripeOrder(id, sid)?.order : null);
}

function applyInventoryDeduction(order, source) {
  if (order.inventory?.deductedAt) return order.inventory;
  const products = productsById();
  const inventory = readStore("inventory", {});
  const adjustments = [];
  for (const [id, entry] of Object.entries(order.items || {})) {
    const product = products[id];
    const sqft = Number(entry?.sqft || 0);
    if (!product || sqft <= 0) continue;
    const cartons = cartonsFor(product, sqft);
    const current = inventory[id] === undefined ? 999 : Math.max(0, Math.round(Number(inventory[id]) || 0));
    inventory[id] = Math.max(0, current - cartons);
    adjustments.push({ productId: id, cartons, before: current, after: inventory[id] });
  }
  if (adjustments.length) writeStore("inventory", inventory);
  order.inventory = {
    ...(order.inventory || {}),
    status: adjustments.length ? "deducted" : "no_flooring_items",
    deductedAt: Date.now(),
    source: clean(source, 180),
    adjustments
  };
  return order.inventory;
}

function restoreInventoryForRefund(order, source) {
  if (order.inventory?.restoredAt) return order.inventory;
  const adjustments = Array.isArray(order.inventory?.adjustments) ? order.inventory.adjustments : [];
  if (!adjustments.length) return order.inventory || {};
  const inventory = readStore("inventory", {});
  const restored = adjustments.map((row) => {
    const id = clean(row.productId, 60);
    const cartons = Math.max(0, Math.round(Number(row.cartons || 0)));
    const current = inventory[id] === undefined ? 999 : Math.max(0, Math.round(Number(inventory[id]) || 0));
    inventory[id] = current + cartons;
    return { productId: id, cartons, before: current, after: inventory[id] };
  });
  writeStore("inventory", inventory);
  order.inventory = { ...(order.inventory || {}), status: "restored", restoredAt: Date.now(), restoreSource: clean(source, 180), restored };
  return order.inventory;
}

async function stripeRequest(method, stripePath, params) {
  if (!config.stripeSecretKey) return { ok: false, status: 503, error: "Stripe secret key is not configured." };
  const response = await fetch(`https://api.stripe.com${stripePath}`, {
    method,
    headers: { Authorization: `Bearer ${config.stripeSecretKey}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": STRIPE_API_VERSION },
    body: encodeForm(params)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status, error: clean(data.error?.message || "Stripe request failed.", 800), stripe: data };
  return { ok: true, status: response.status, data };
}

async function sendFulfillmentEmail(order, source) {
  const to = clean(config.fulfillmentEmail, 180);
  if (!to) return { status: "skipped", recipientName: config.fulfillmentName, error: "No fulfillment recipient configured." };
  if (!config.resendApiKey) return { status: "skipped", recipient: to, recipientName: config.fulfillmentName, error: "RESEND_API_KEY is not configured." };
  const adminBase = config.adminBaseUrl || config.siteBaseUrl;
  const template = buildEmail(order, `${adminBase}/order.html?id=${encodeURIComponent(order.id)}`);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `lunde-${source}-${order.id}`
    },
    body: JSON.stringify({ from: config.fromEmail, to: [to], subject: `Fulfillment needed: order ${order.id}`, ...template })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { status: "failed", recipient: to, recipientName: config.fulfillmentName, error: clean(data.message || `Resend HTTP ${response.status}`, 600) };
  return { status: "sent", recipient: to, recipientName: config.fulfillmentName, messageId: clean(data.id, 180) };
}

/* Send the customer their order confirmation, then record the outcome on the order.
   Skips gracefully (no throw) when there's no customer email or Resend isn't set up. */
async function sendCustomerConfirmation(order, source) {
  const result = await sendCustomerEmail(order, source);
  return recordConfirmationStatus(order.id, { ...result, source });
}

async function sendCustomerEmail(order, source) {
  const to = clean(order.customer?.email, 180);
  if (!to) return { status: "skipped", error: "Order has no customer email." };
  if (!getSettings().emailOrderConfirmation) return { status: "skipped", recipient: to, error: "Order confirmation emails are turned off in Settings." };
  if (!config.resendApiKey) return { status: "skipped", recipient: to, error: "RESEND_API_KEY is not configured." };
  const base = config.siteBaseUrl || config.adminBaseUrl || "";
  const template = buildCustomerEmail(order, base ? `${base}/account` : "");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
      // one confirmation per order, even if the Stripe webhook retries
      "Idempotency-Key": `lunde-confirm-${order.id}`
    },
    body: JSON.stringify({ from: config.fromEmail, to: [to], subject: `Your Lunde Flooring order ${order.id} is confirmed`, ...template, ...replyToField() })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { status: "failed", recipient: to, error: clean(data.message || `Resend HTTP ${response.status}`, 600) };
  return { status: "sent", recipient: to, messageId: clean(data.id, 180) };
}

async function sendVerificationEmail(account, token, req) {
  const url = `${siteBase(req)}/account/verify?token=${encodeURIComponent(token)}`;
  const template = buildActionEmail({
    title: "Verify your Lunde account",
    intro: `Hi ${account.name || "there"}, confirm this email address so your customer account can be used for orders, saved details, and order history.`,
    buttonText: "Verify email",
    url,
    footer: "This link expires in 24 hours."
  });
  const result = await sendTransactionalEmail({
    to: account.email,
    subject: "Verify your Lunde Flooring account",
    idempotencyKey: `lunde-verify-${account.id}-${account.verificationSentAt || Date.now()}`,
    ...template
  });
  if (!config.resendApiKey && process.env.NODE_ENV !== "production") result.devUrl = url;
  return result;
}

async function sendPasswordResetEmail(account, token, req) {
  const url = `${siteBase(req)}/account/reset?token=${encodeURIComponent(token)}`;
  const template = buildActionEmail({
    title: "Reset your password",
    intro: `Hi ${account.name || "there"}, use this secure link to choose a new password for your Lunde Flooring account.`,
    buttonText: "Reset password",
    url,
    footer: "This link expires in 1 hour. If you did not request it, you can ignore this email."
  });
  const result = await sendTransactionalEmail({
    to: account.email,
    subject: "Reset your Lunde Flooring password",
    idempotencyKey: `lunde-reset-${account.id}-${account.resetRequestedAt || Date.now()}`,
    ...template
  });
  if (!config.resendApiKey && process.env.NODE_ENV !== "production") result.devUrl = url;
  return result;
}

async function sendStaffPasswordResetEmail(user, token, req) {
  const url = `${siteBase(req)}/admin/reset?token=${encodeURIComponent(token)}`;
  const template = buildActionEmail({
    title: "Reset your staff password",
    intro: `Hi ${user.name || "there"}, use this secure link to choose a new password for your Lunde Flooring staff console account.`,
    buttonText: "Reset password",
    url,
    footer: "This link expires in 1 hour. If you did not request it, you can ignore this email."
  });
  const result = await sendTransactionalEmail({
    to: user.email,
    subject: "Reset your Lunde Flooring staff password",
    idempotencyKey: `lunde-staff-reset-${user.id}-${user.resetRequestedAt || Date.now()}`,
    ...template
  });
  if (!config.resendApiKey && process.env.NODE_ENV !== "production") result.devUrl = url;
  return result;
}

async function sendTransactionalEmail({ to, subject, html, text, idempotencyKey }) {
  const recipient = clean(to, 180);
  if (!recipient) return { status: "skipped", error: "No recipient email." };
  if (!config.resendApiKey) return { status: "skipped", recipient, error: "RESEND_API_KEY is not configured." };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": clean(idempotencyKey, 180)
    },
    body: JSON.stringify({ from: config.fromEmail, to: [recipient], subject, html, text, ...replyToField() })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { status: "failed", recipient, error: clean(data.message || `Resend HTTP ${response.status}`, 600) };
  return { status: "sent", recipient, messageId: clean(data.id, 180) };
}

/* Optional reply-to from staff Settings, spread into Resend payloads. */
function replyToField() {
  const replyTo = clean(getSettings().emailReplyTo, 180);
  return replyTo ? { reply_to: replyTo } : {};
}

async function sendCustomerPaymentUpdate(order, kind, options) {
  const to = clean(order.customer?.email, 180);
  if (!to) return { status: "skipped", error: "Order has no customer email." };
  const refund = kind === "refund" || kind === "partial-refund";
  const title = refund ? "Refund update" : "Payment issue";
  const intro = refund
    ? `We recorded a ${kind === "refund" ? "refund" : "partial refund"} for order ${order.id}. If you have questions, reply to this email and our team will help.`
    : `Stripe reported a payment issue for order ${order.id}. Your order has not moved to fulfillment. Please return to checkout or contact us if you need help.`;
  const url = config.siteBaseUrl ? `${config.siteBaseUrl}/my-order.html?id=${encodeURIComponent(order.id)}` : "";
  const template = buildActionEmail({
    title,
    intro,
    buttonText: "View order",
    url: url || config.siteBaseUrl || "https://lundeflooring.com/",
    footer: refund ? "Refund timing depends on your card issuer." : "No fulfillment work starts until payment succeeds."
  });
  const result = await sendTransactionalEmail({
    to,
    subject: options.subject,
    idempotencyKey: options.idempotencyKey,
    ...template
  });
  recordPaymentNoticeStatus(order.id, kind, result);
  if (result.status === "failed") logOperationalEvent("error", "customer_payment_update_failed", { orderId: order.id, kind, error: result.error });
  return result;
}

async function sendCustomerDeliveryEmail(order, staff) {
  if (!getSettings().emailDeliveryNotice) {
    return { status: "skipped", recipient: order.customer?.email || "", error: "Delivery notice emails are turned off in Settings." };
  }
  const url = config.siteBaseUrl ? `${config.siteBaseUrl}/my-order.html?id=${encodeURIComponent(order.id)}` : "";
  const template = buildDeliveryEmail(order, url || config.siteBaseUrl || "https://lundeflooring.com/");
  const result = await sendTransactionalEmail({
    to: order.customer?.email || "",
    subject: `Your Lunde Flooring order ${order.id} has been delivered`,
    idempotencyKey: `lunde-delivered-${order.id}`,
    ...template
  });
  recordDeliveryEmailStatus(order.id, { ...result, source: "status-delivered", staffId: staff?.id || "", staffName: staff?.name || staff?.email || "" });
  if (result.status === "failed") logOperationalEvent("error", "customer_delivery_email_failed", { orderId: order.id, error: result.error });
  return result;
}

/* Alert the shop when a customer submits the contact form. */
async function notifyNewMessage(item) {
  const to = clean(config.fulfillmentEmail, 180);
  if (!to || !config.resendApiKey) return { status: "skipped" };
  const adminBase = config.adminBaseUrl || config.siteBaseUrl || "";
  const meta = [item.name, item.email, item.phone, item.topic].filter(Boolean).map((v) => escapeHtml(clean(v, 180))).join(" · ");
  const html = `<h2 style="margin:0 0 8px">New website message</h2>`
    + (meta ? `<p style="margin:0 0 10px;color:#666">${meta}</p>` : "")
    + `<p style="font-size:15px;line-height:1.6">${escapeHtml(clean(item.message, 2000)).replace(/\n/g, "<br>")}</p>`
    + (Array.isArray(item.photos) && item.photos.length ? `<p style="color:#666">${item.photos.length} photo${item.photos.length === 1 ? "" : "s"} attached — view in the console.</p>` : "")
    + (adminBase ? `<p><a href="${adminBase}/messages.html">Open the Messages inbox</a></p>` : "");
  return sendTransactionalEmail({
    to,
    subject: `New message from ${clean(item.name, 120) || "a website visitor"}`,
    html,
    text: clean(item.message, 2000),
    idempotencyKey: `lunde-newmsg-${item.id}`
  });
}

/* Email a saved quote to its customer (staff action). */
async function sendQuoteEmail(quote, staff) {
  const to = clean(quote.customer?.email, 180);
  if (!to) return { status: "skipped", error: "This quote has no customer email." };
  const settings = getSettings();
  const products = productsById();
  const rows = Object.entries(quote.items || {}).map(([pid, entry]) => {
    const product = products[pid];
    if (!product || !(entry.sqft > 0)) return "";
    const cartons = cartonsFor(product, entry.sqft);
    const price = cartons * cartonPrice(product);
    return `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(product.title)}</td>`
      + `<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${entry.sqft} sq ft · ${cartons} cartons</td>`
      + `<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">$${price.toFixed(2)}</td></tr>`;
  }).join("");
  const validUntil = new Date(quote.expiresAt || (quote.createdAt + 30 * 86400000)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const base = config.siteBaseUrl || "https://lundeflooring.com";
  const html = `<h2 style="margin:0 0 6px">Your quote from ${escapeHtml(settings.businessName)}</h2>`
    + `<p style="margin:0 0 14px;color:#666">${escapeHtml(quote.job || "Saved quote")} · ${escapeHtml(quote.id)} · Valid through ${validUntil}</p>`
    + `<table style="border-collapse:collapse;width:100%;max-width:560px;font-size:14px">${rows}`
    + `<tr><td style="padding:10px 12px;font-weight:700">Subtotal</td><td></td><td style="padding:10px 12px;text-align:right;font-weight:700">$${Number(quote.totals?.subtotal || 0).toFixed(2)}</td></tr></table>`
    + (quote.notes ? `<p style="color:#555">${escapeHtml(clean(quote.notes, 1200)).replace(/\n/g, "<br>")}</p>` : "")
    + `<p>Delivery and tax are calculated at checkout. Reply to this email or call ${escapeHtml(settings.businessPhone)} with any questions.</p>`
    + `<p><a href="${base}/account?tab=quotes">View your quotes online</a></p>`;
  return sendTransactionalEmail({
    to,
    subject: `Your ${settings.businessName} quote — ${clean(quote.job, 120) || quote.id}`,
    html,
    text: `Your quote ${quote.id} (${quote.job || ""}) — subtotal $${Number(quote.totals?.subtotal || 0).toFixed(2)}, valid through ${validUntil}.`,
    idempotencyKey: `lunde-quote-send-${quote.id}-${Date.now()}`
  });
}

async function sendAdminNotification(title, order, details) {
  const to = clean(config.fulfillmentEmail, 180);
  const body = [
    title,
    `Order: ${order.id}`,
    `Status: ${order.status}`,
    `Payment status: ${order.payment?.status || "unknown"}`,
    details.detail || "",
    `Source: ${details.source || "system"}`,
    details.eventId ? `Stripe event: ${details.eventId}` : ""
  ].filter(Boolean).join("\n");
  const adminBase = config.adminBaseUrl || config.siteBaseUrl || "https://lundeflooring.com";
  const url = `${adminBase}/order.html?id=${encodeURIComponent(order.id)}`;
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#17211b">`
    + `<h1>${escapeHtml(title)}</h1><p><b>Order:</b> ${escapeHtml(order.id)}</p>`
    + `<p><b>Status:</b> ${escapeHtml(order.status)}<br><b>Payment:</b> ${escapeHtml(order.payment?.status || "unknown")}</p>`
    + (details.detail ? `<p>${escapeHtml(details.detail)}</p>` : "")
    + `<p><a href="${escapeHtml(url)}">Open order in admin</a></p>`
    + (details.eventId ? `<p style="color:#647067">Stripe event: ${escapeHtml(details.eventId)}</p>` : "")
    + `</body></html>`;
  const result = await sendTransactionalEmail({
    to,
    subject: `Lunde admin: ${title} (${order.id})`,
    html,
    text: `${body}\nAdmin link: ${url}`,
    idempotencyKey: `lunde-admin-${clean(details.eventId || `${details.source || "system"}-${title}-${order.id}`, 120)}`
  });
  recordAdminNotificationStatus(order.id, { ...result, title, source: details.source || "system", eventId: details.eventId || "" });
  if (result.status === "failed") logOperationalEvent("error", "admin_notification_failed", { orderId: order.id, title, error: result.error });
  return result;
}

function buildDeliveryEmail(order, orderUrl) {
  const deliveredAt = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const pickup = order.delivery?.method === "pickup";
  const destination = pickup
    ? "your pickup order from our Bakersfield warehouse"
    : `your order to ${order.delivery?.address || "the delivery address on file"}`;
  return buildActionEmail({
    title: "Your order has been delivered",
    intro: `Hi ${order.customer?.name || "there"}, order ${order.id} has been marked delivered on ${deliveredAt}. Thanks for choosing Lunde Flooring Co. for ${destination}. If anything does not look right, reply to this email and our team will help.`,
    buttonText: "View order",
    url: orderUrl,
    footer: "Keep your receipt and order details for care, maintenance, and warranty reference."
  });
}

function buildActionEmail({ title, intro, buttonText, url, footer }) {
  const safeUrl = escapeHtml(url);
  const html = `<!doctype html><html><body style="margin:0;background:#f3efe7;font-family:Arial,Helvetica,sans-serif;color:#201e1a">`
    + `<table width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px">`
    + `<table width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e5e1d8;border-radius:10px;overflow:hidden">`
    + `<tr><td style="padding:30px 28px;background:#201e1a;color:#f3efe7"><div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;opacity:.82">Lunde Flooring Co.</div><div style="font-size:24px;font-weight:800;margin-top:8px">${escapeHtml(title)}</div></td></tr>`
    + `<tr><td style="padding:26px 28px 8px"><p style="margin:0;font-size:15px;line-height:1.6">${escapeHtml(intro)}</p></td></tr>`
    + `<tr><td style="padding:18px 28px 24px"><a href="${safeUrl}" style="display:inline-block;background:#17211b;color:#fff;text-decoration:none;border-radius:6px;padding:13px 20px;font-weight:700">${escapeHtml(buttonText)}</a></td></tr>`
    + `<tr><td style="padding:0 28px 26px"><p style="margin:0;color:#5c5750;font-size:13px;line-height:1.55">Button not working? Copy this link into your browser:<br><a href="${safeUrl}" style="color:#17211b;word-break:break-all">${safeUrl}</a></p>`
    + `<p style="margin:18px 0 0;color:#8a8478;font-size:12px">${escapeHtml(footer)}</p></td></tr>`
    + `</table></td></tr></table></body></html>`;
  const text = `Lunde Flooring Co.\n\n${title}\n\n${intro}\n\n${buttonText}: ${url}\n\n${footer}`;
  return { html, text };
}

function buildCustomerEmail(order, trackUrl) {
  const products = productsById();
  const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
  const date = new Date(Number(order.createdAt || Date.now())).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const pickup = order.delivery?.method === "pickup";
  let rows = "";
  let textItems = "";
  for (const [id, entry] of Object.entries(order.items || {})) {
    const product = products[id] || { title: id, specs: {} };
    const sqft = Number(entry.sqft || 0);
    const samples = Number(entry.samples || 0);
    if (sqft > 0) {
      const cartons = cartonsFor(product, sqft);
      const price = cartons * cartonPrice(product);
      rows += itemRow(escapeHtml(product.title || id), `${cartons} carton${cartons === 1 ? "" : "s"} · ${sqft} sq. ft.`, money(price), emailThumbMedia(product.mainImage));
      textItems += `- ${product.title}: ${cartons} carton(s), ${sqft} sq. ft. — ${money(price)}\n`;
    }
    if (samples > 0) {
      const price = samples * Number(product.samplePrice || 0);
      rows += itemRow(`${escapeHtml(product.title || id)} — sample`, `${samples} sample${samples === 1 ? "" : "s"}`, money(price), emailThumbMedia(product.mainImage));
      textItems += `- ${product.title} sample x${samples} — ${money(price)}\n`;
    }
  }
  const t = order.totals || {};
  const totalsRows =
    sumRow("Subtotal", money(t.subtotal)) +
    (Number(t.discount) > 0 ? sumRow("Discount", `−${money(t.discount)}`) : "") +
    sumRow(pickup ? "Pickup" : "Shipping", Number(t.freight) > 0 ? money(t.freight) : "Free") +
    sumRow("Estimated tax", money(t.tax)) +
    `<tr><td style="padding:12px 0 0;border-top:2px solid #17211b;font-weight:800">Total</td><td style="padding:12px 0 0;border-top:2px solid #17211b;text-align:right;font-weight:800">${money(t.total)}</td></tr>`;
  const whatsNext = pickup
    ? "We're preparing your order and will email you as soon as it's ready for pickup at our Bakersfield warehouse."
    : "We're preparing your order and will email tracking details as soon as it ships.";
  const fulfillment = pickup
    ? "Pickup — Lunde warehouse, Bakersfield, CA"
    : `Shipping to: ${escapeHtml(order.delivery?.address || "the address on file")}`;
  const cta = trackUrl
    ? `<tr><td style="padding:4px 28px 28px"><a href="${escapeHtml(trackUrl)}" style="display:inline-block;background:#17211b;color:#fff;text-decoration:none;border-radius:6px;padding:13px 22px;font-weight:700">Track your order</a></td></tr>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f3efe7;font-family:Arial,Helvetica,sans-serif;color:#201e1a">`
    + `<table width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px">`
    + `<table width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #e5e1d8;border-radius:10px;overflow:hidden">`
    + `<tr><td style="padding:30px 28px;background:#201e1a;color:#f3efe7">`
    + `<div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;opacity:.8">Lunde Flooring Co.</div>`
    + `<div style="font-size:24px;font-weight:800;margin-top:8px">Thank you for your order</div>`
    + `<div style="margin-top:6px;opacity:.85">Order ${escapeHtml(order.id)} · ${escapeHtml(date)}</div></td></tr>`
    + `<tr><td style="padding:24px 28px 6px"><p style="margin:0 0 4px;font-size:15px">Hi ${escapeHtml(order.customer?.name || "there")},</p>`
    + `<p style="margin:0;color:#5c5750;font-size:14px;line-height:1.6">We've received your order and your payment was successful. ${whatsNext}</p></td></tr>`
    + `<tr><td style="padding:18px 28px 4px"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8a8478;font-weight:700">Your items</div>`
    + `<table width="100%" cellspacing="0" cellpadding="0" style="margin-top:6px">${rows}</table></td></tr>`
    + `<tr><td style="padding:8px 28px"><table width="100%" cellspacing="0" cellpadding="0">${totalsRows}</table></td></tr>`
    + `<tr><td style="padding:18px 28px 4px"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8a8478;font-weight:700">Delivery</div>`
    + `<p style="margin:6px 0 0;color:#5c5750;font-size:14px">${fulfillment}</p></td></tr>`
    + cta
    + `<tr><td style="padding:6px 28px 30px;border-top:1px solid #efebe2;color:#8a8478;font-size:12px;line-height:1.6">`
    + `Questions about your order? Just reply to this email and our team will help.</td></tr>`
    + `</table></td></tr></table></body></html>`;
  const text = `Thank you for your order, ${order.customer?.name || "there"}!\n\n`
    + `Order ${order.id} · ${date}\nYour payment was successful. ${whatsNext}\n\nItems:\n${textItems}\n`
    + `Subtotal: ${money(t.subtotal)}\n${Number(t.discount) > 0 ? `Discount: -${money(t.discount)}\n` : ""}`
    + `${pickup ? "Pickup" : "Shipping"}: ${Number(t.freight) > 0 ? money(t.freight) : "Free"}\nEstimated tax: ${money(t.tax)}\nTotal: ${money(t.total)}\n\n`
    + `${fulfillment}\n${trackUrl ? `\nTrack your order: ${trackUrl}\n` : ""}\nQuestions? Reply to this email.\n— Lunde Flooring Co.`;
  return { html, text };
}

function emailThumbMedia(src) {
  if (!src) return "";
  const cleanPath = String(src).replace(/^\.?\//, "");
  const thumbPath = cleanPath.replace(/(\.[a-z0-9]+)$/i, ".thumb$1");
  if (thumbPath !== cleanPath && fs.existsSync(path.join(__dirname, thumbPath))) {
    return SEO_BASE + "/" + thumbPath;
  }
  return absMedia(src);
}

function itemRow(title, detail, price, imageUrl = "") {
  const imageCell = imageUrl
    ? `<td width="58" style="padding:11px 12px 11px 0;border-top:1px solid #efebe2;vertical-align:top">`
      + `<img src="${escapeHtml(imageUrl)}" width="46" height="46" alt="" style="display:block;width:46px;height:46px;border-radius:6px;object-fit:cover;background:#f3efe7;border:1px solid #e5e1d8"></td>`
    : "";
  return `<tr>${imageCell}<td style="padding:11px 0;border-top:1px solid #efebe2;vertical-align:top"><b>${title}</b><br><span style="color:#8a8478;font-size:13px">${detail}</span></td>`
    + `<td style="padding:11px 0;border-top:1px solid #efebe2;text-align:right;white-space:nowrap"><b>${price}</b></td></tr>`;
}

function sumRow(label, value) {
  return `<tr><td style="padding:5px 0;color:#5c5750;font-size:14px">${escapeHtml(label)}</td><td style="padding:5px 0;text-align:right;font-size:14px">${escapeHtml(value)}</td></tr>`;
}

function recordConfirmationStatus(orderId, details) {
  const orders = readStore("orders", []);
  for (const order of orders) {
    if (order.id !== orderId) continue;
    const prev = order.confirmationEmail || {};
    order.confirmationEmail = {
      status: clean(details.status, 40),
      lastAttemptAt: Date.now(),
      sentAt: details.status === "sent" ? Date.now() : Number(prev.sentAt || 0),
      recipient: clean(details.recipient || prev.recipient || "", 180),
      source: clean(details.source, 60),
      messageId: clean(details.messageId || prev.messageId || "", 180),
      error: clean(details.error, 600)
    };
    writeStore("orders", orders);
    return order;
  }
  return null;
}

function recordPaymentNoticeStatus(orderId, kind, details) {
  const orders = readStore("orders", []);
  for (const order of orders) {
    if (order.id !== orderId) continue;
    const attempts = Array.isArray(order.paymentNotices) ? order.paymentNotices : [];
    order.paymentNotices = [
      ...attempts,
      {
        kind: clean(kind, 60),
        status: clean(details.status, 40),
        at: Date.now(),
        recipient: clean(details.recipient || "", 180),
        messageId: clean(details.messageId || "", 180),
        error: clean(details.error || "", 600)
      }
    ].slice(-20);
    writeStore("orders", orders);
    return order;
  }
  return null;
}

function recordDeliveryEmailStatus(orderId, details) {
  const orders = readStore("orders", []);
  for (const order of orders) {
    if (order.id !== orderId) continue;
    const prev = order.deliveryEmail || {};
    const attempts = Array.isArray(prev.attempts) ? prev.attempts : [];
    const entry = {
      status: clean(details.status, 40),
      at: Date.now(),
      source: clean(details.source, 60),
      staffId: clean(details.staffId || "", 80),
      staffName: clean(details.staffName || "", 180),
      recipient: clean(details.recipient || prev.recipient || "", 180),
      messageId: clean(details.messageId || "", 180),
      error: clean(details.error || "", 600)
    };
    order.deliveryEmail = {
      status: entry.status,
      lastAttemptAt: entry.at,
      sentAt: entry.status === "sent" ? entry.at : Number(prev.sentAt || 0),
      recipient: entry.recipient,
      messageId: entry.messageId || prev.messageId || "",
      error: entry.error,
      attempts: [...attempts, entry].slice(-10)
    };
    writeStore("orders", orders);
    return order;
  }
  return null;
}

function recordAdminNotificationStatus(orderId, details) {
  const orders = readStore("orders", []);
  for (const order of orders) {
    if (order.id !== orderId) continue;
    const attempts = Array.isArray(order.adminNotifications) ? order.adminNotifications : [];
    order.adminNotifications = [
      ...attempts,
      {
        title: clean(details.title, 120),
        status: clean(details.status, 40),
        at: Date.now(),
        source: clean(details.source, 60),
        eventId: clean(details.eventId, 180),
        recipient: clean(details.recipient || "", 180),
        messageId: clean(details.messageId || "", 180),
        error: clean(details.error || "", 600)
      }
    ].slice(-20);
    writeStore("orders", orders);
    return order;
  }
  return null;
}

function buildEmail(order, adminUrl) {
  const products = productsById();
  const date = new Date(Number(order.createdAt || Date.now())).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const method = order.delivery?.method === "pickup" ? "Pickup" : "Shipping / delivery";
  let rows = "";
  for (const [id, entry] of Object.entries(order.items || {})) {
    const product = products[id] || { title: id, sku: id, specs: {} };
    const sqft = Number(entry.sqft || 0);
    const samples = Number(entry.samples || 0);
    const cartons = sqft > 0 ? cartonsFor(product, sqft) : 0;
    const qty = [`${cartons || ""}${cartons ? ` carton${cartons === 1 ? "" : "s"}` : ""}`, `${samples || ""}${samples ? ` sample${samples === 1 ? "" : "s"}` : ""}`].filter((s) => s.trim()).join(" + ") || "0";
    const options = [product.collection, product.style, product.color, product.specs?.dimensions, product.specs?.thickness, sqft ? `${sqft} sq. ft. requested` : ""].filter(Boolean).join(" / ");
    rows += `<tr><td style="padding:12px 0;border-top:1px solid #e5e8e3"><b>${escapeHtml(product.title || id)}</b><br><span style="color:#647067">SKU: ${escapeHtml(product.sku || id)}<br>${escapeHtml(options)}</span></td><td style="padding:12px 0;border-top:1px solid #e5e8e3;text-align:right"><b>${escapeHtml(qty)}</b></td></tr>`;
  }
  const notes = [order.delivery?.notes || "", ...(order.staffNotes || []).map((n) => typeof n === "object" ? n.text || "" : String(n || ""))].filter(Boolean);
  const notesText = notes.length ? notes.join("\n") : "No customer or internal notes.";
  const line = (label, value) => `<tr><td style="padding:7px 0;color:#647067">${escapeHtml(label)}</td><td style="padding:7px 0;font-weight:700">${escapeHtml(value || "Not provided")}</td></tr>`;
  const html = `<!doctype html><html><body style="background:#f7f5ef;font-family:Arial,Helvetica,sans-serif;color:#17211b"><table width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:white;border:1px solid #e5e8e3;border-radius:8px"><tr><td style="padding:24px;background:#17211b;color:white"><div style="font-size:12px;text-transform:uppercase">Lunde Flooring fulfillment</div><h1>Order ${escapeHtml(order.id)}</h1></td></tr><tr><td style="padding:22px 24px"><table width="100%">${line("Order date/time", date)}${line("Order status", order.status)}${line("Customer name", order.customer?.name)}${line("Customer phone", order.customer?.phone)}${line("Customer email", order.customer?.email)}${line("Method", method)}${line("Address", order.delivery?.address)}${line("Delivery window", order.delivery?.window)}${line("Placement", order.delivery?.placement)}</table></td></tr><tr><td style="padding:0 24px 22px"><h2>Items to fulfill</h2><table width="100%">${rows}</table></td></tr><tr><td style="padding:0 24px 22px"><h2>Notes and instructions</h2><p>${escapeHtml(notesText).replaceAll("\n", "<br>")}</p></td></tr><tr><td style="padding:0 24px 26px"><a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#17211b;color:white;text-decoration:none;border-radius:6px;padding:12px 16px">View order in admin</a></td></tr></table></td></tr></table></body></html>`;
  const text = `Lunde Flooring fulfillment\nOrder: ${order.id}\nOrder date/time: ${date}\nOrder status: ${order.status}\nCustomer: ${order.customer?.name || "Not provided"}\nPhone: ${order.customer?.phone || "Not provided"}\nEmail: ${order.customer?.email || "Not provided"}\nMethod: ${method}\nAddress: ${order.delivery?.address || "Not provided"}\n\nNotes:\n${notesText}\n\nAdmin link: ${adminUrl}`;
  return { html, text };
}

function recordEmailStatus(orderId, details) {
  const orders = readStore("orders", []);
  let latest = null;
  for (const order of orders) {
    if (order.id !== orderId) continue;
    const prev = order.fulfillmentEmail || {};
    const entry = {
      status: clean(details.status, 40),
      at: Date.now(),
      source: clean(details.source, 60),
      recipient: clean(details.recipient || prev.recipient || "", 180),
      recipientName: clean(details.recipientName || prev.recipientName || "", 180),
      messageId: clean(details.messageId, 180),
      error: clean(details.error, 600)
    };
    const attempts = Array.isArray(prev.attempts) ? prev.attempts : [];
    attempts.push(entry);
    order.fulfillmentEmail = {
      status: entry.status,
      lastAttemptAt: entry.at,
      sentAt: entry.status === "sent" ? entry.at : Number(prev.sentAt || 0),
      recipient: entry.recipient,
      recipientName: entry.recipientName,
      messageId: entry.messageId || prev.messageId || "",
      error: entry.error,
      attempts: attempts.slice(-10)
    };
    latest = order;
    break;
  }
  writeStore("orders", orders);
  return latest;
}

function readStore(name, fallback) {
  if (supabaseStoreEnabled()) {
    return storeCache.has(name) ? cloneStoreValue(storeCache.get(name)) : fallback;
  }
  const file = dataFile(name);
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeStore(name, value) {
  if (supabaseStoreEnabled()) {
    const next = cloneStoreValue(value);
    storeCache.set(name, next);
    persistSupabaseStore(name, next).catch((error) => {
      logOperationalEvent("error", "supabase_store_write_failed", { store: name, message: error.message });
    });
    return value;
  }
  const file = dataFile(name);
  const tmp = `${file}.tmp-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
  return value;
}

function supabaseStoreEnabled() {
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
}

async function hydrateSupabaseStores() {
  if (!supabaseStoreEnabled()) return;
  const rows = await supabaseRequest("GET", `/${SUPABASE_STORE_TABLE}?select=name,value`);
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.name) storeCache.set(row.name, cloneStoreValue(row.value));
  }
  console.log(`Loaded ${storeCache.size} Supabase store rows.`);
}

async function persistSupabaseStore(name, value) {
  return supabaseRequest("POST", `/${SUPABASE_STORE_TABLE}`, {
    name,
    value,
    updated_at: new Date().toISOString()
  }, {
    Prefer: "resolution=merge-duplicates,return=minimal"
  });
}

async function supabaseRequest(method, pathSuffix, body, extraHeaders = {}) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1${pathSuffix}`, {
    method,
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      ...extraHeaders
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase ${method} ${pathSuffix} failed: ${response.status} ${text.slice(0, 300)}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function cloneStoreValue(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function stripeEventProcessed(eventId) {
  return readStore("stripe_events", []).some((row) => row?.id === eventId && row.status === "processed");
}

function recordStripeEvent(event, status, extra = {}) {
  const eventId = clean(event.id, 180);
  if (!eventId) return null;
  const rows = readStore("stripe_events", []);
  const prev = rows.find((row) => row?.id === eventId) || {};
  const row = {
    ...prev,
    id: eventId,
    type: clean(event.type, 120),
    status: clean(status, 40),
    stripeCreated: Number(event.created || prev.stripeCreated || 0),
    receivedAt: Number(prev.receivedAt || Date.now()),
    updatedAt: Date.now(),
    error: clean(extra.error || "", 600)
  };
  writeStore("stripe_events", [row, ...rows.filter((item) => item?.id !== eventId)].slice(0, 500));
  return row;
}

function logOperationalEvent(level, type, details = {}) {
  const entry = {
    at: new Date().toISOString(),
    level: clean(level, 20),
    type: clean(type, 120),
    details: redactLogDetails(details)
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  try {
    const rows = readStore("app_events", []);
    writeStore("app_events", [entry, ...rows].slice(0, 1000));
  } catch {
    // Console logging still preserves the event when disk logging fails.
  }
  return entry;
}

function redactLogDetails(value) {
  if (Array.isArray(value)) return value.map(redactLogDetails).slice(0, 20);
  if (!value || typeof value !== "object") return typeof value === "string" ? clean(value, 600) : value;
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (/secret|password|token|key|authorization/i.test(key)) out[key] = "[redacted]";
    else out[key] = redactLogDetails(val);
  }
  return out;
}

function dataFile(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function upsertById(store, item) {
  const id = clean(item.id || `ITEM-${crypto.randomBytes(3).toString("hex").toUpperCase()}`, 100);
  const nextItem = { ...item, id };
  const next = [nextItem, ...readStore(store, []).filter((row) => row?.id !== id)];
  return writeStore(store, next);
}

function upsertOrderWithoutEmail(order) {
  writeStore("orders", [order, ...readStore("orders", []).filter((row) => row?.id !== order.id)]);
  return order;
}

function currentStaff(req) {
  const payload = verifyPayload(parseCookies(req).lunde_staff);
  if (!payload?.id) return null;
  const user = getAdminUsers().find((row) => row.id === payload.id);
  return user && user.active !== false ? publicUser(user) : null;
}

function requireStaff(req, res) {
  if (currentStaff(req)) return false;
  json(res, { ok: false, error: "Staff sign-in required." }, 401);
  return true;
}

function requireOwner(req, res) {
  const user = currentStaff(req);
  if (user && user.canManageAdmins) return false;
  json(res, { ok: false, error: user ? "You do not have permission to manage staff accounts." : "Staff sign-in required." }, user ? 403 : 401);
  return true;
}

function currentAccount(req) {
  const sid = clean(parseCookies(req).lunde_customer || "", 180);
  if (!sid) return null;
  const now = Date.now();
  const sessions = readStore("customer_sessions", []);
  const session = sessions.find((row) => row?.id === sid && Number(row.expiresAt || 0) > now);
  if (!session) {
    pruneCustomerSessions();
    return null;
  }
  return readStore("accounts", []).find((row) => row?.id === session.accountId) || null;
}

function currentAccountId(req) {
  return clean(currentAccount(req)?.id || "", 80);
}

function createCustomerSession(req, res, account) {
  pruneCustomerSessions();
  const sid = secureToken();
  const now = Date.now();
  const sessions = readStore("customer_sessions", []).filter((row) => row?.id !== sid);
  sessions.push({
    id: sid,
    accountId: account.id,
    createdAt: now,
    expiresAt: now + CUSTOMER_TTL * 1000,
    ip: clientIp(req),
    userAgent: clean(req.headers["user-agent"], 300)
  });
  writeStore("customer_sessions", sessions);
  setCookie(res, req, "lunde_customer", sid, CUSTOMER_TTL);
}

function destroyCustomerSession(req, res) {
  const sid = clean(parseCookies(req).lunde_customer || "", 180);
  if (sid) writeStore("customer_sessions", readStore("customer_sessions", []).filter((row) => row?.id !== sid));
  clearCookie(res, "lunde_customer");
}

function destroyCustomerSessionsFor(accountId) {
  writeStore("customer_sessions", readStore("customer_sessions", []).filter((row) => row?.accountId !== accountId));
}

function pruneCustomerSessions() {
  const now = Date.now();
  const sessions = readStore("customer_sessions", []);
  const fresh = sessions.filter((row) => row?.id && row?.accountId && Number(row.expiresAt || 0) > now);
  if (fresh.length !== sessions.length) writeStore("customer_sessions", fresh);
}

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", config.authSecret).update(body).digest("hex");
  return `${body}.${mac}`;
}

function verifyPayload(token) {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".", 2);
  const expected = crypto.createHmac("sha256", config.authSecret).update(body).digest("hex");
  const macBuffer = Buffer.from(String(mac || ""));
  const expectedBuffer = Buffer.from(expected);
  if (macBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(macBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload.exp && nowSeconds() <= Number(payload.exp) ? payload : null;
  } catch {
    return null;
  }
}

function setCookie(res, req, name, value, ttl) {
  const secure = isProduction || req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted;
  res.setHeader("Set-Cookie", `${name}=${value}; Max-Age=${ttl}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`);
}

function clearCookie(res, name) {
  res.setHeader("Set-Cookie", `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored.startsWith("scrypt:")) return false;
  const [, salt, hash] = stored.split(":");
  if (!salt || !/^[a-f0-9]{128}$/i.test(hash || "")) return false;
  const test = crypto.scryptSync(password, salt, 64).toString("hex");
  const testBuffer = Buffer.from(test, "hex");
  const hashBuffer = Buffer.from(hash, "hex");
  return testBuffer.length === hashBuffer.length && crypto.timingSafeEqual(testBuffer, hashBuffer);
}

async function hashCustomerPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyCustomerPassword(password, stored) {
  if (stored.startsWith("$2")) return bcrypt.compare(password, stored);
  return verifyPassword(password, stored);
}

function secureToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHmac("sha256", config.authSecret).update(String(token || "")).digest("hex");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "")) && String(email || "").length <= 180;
}

function passwordStrengthError(password) {
  const value = String(password || "");
  if (value.length < 10) return "Password must be at least 10 characters.";
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    return "Password must include uppercase, lowercase, and a number.";
  }
  return "";
}

function publicUser(user) {
  return {
    id: user.id, name: user.name, initials: user.initials, role: user.role, email: user.email,
    active: user.active !== false, canManageAdmins: user.role === "Owner", avatar: user.avatar || ""
  };
}

function publicCustomer(customer) {
  const {
    password,
    verificationTokenHash,
    verificationTokenExpiresAt,
    verificationSentAt,
    resetTokenHash,
    resetTokenExpiresAt,
    resetRequestedAt,
    ...rest
  } = customer || {};
  return rest;
}

function publicCustomers() {
  return readStore("customers", []).map(publicCustomer);
}

function readRaw(req, maxBytes = MAX_API_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let done = false;
    req.on("data", (chunk) => {
      if (done) return;
      total += chunk.length;
      if (total > maxBytes) {
        done = true;
        reject(Object.assign(new Error("Request body too large."), {
          statusCode: 413,
          publicMessage: "Request body too large."
        }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!done) resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", (error) => {
      if (!done) reject(error);
    });
  });
}

function rateLimit(res, key, limit, windowMs) {
  const now = Date.now();
  if (authRateLimits.size > 5000) {
    for (const [storedKey, row] of authRateLimits) {
      if (row.resetAt <= now) authRateLimits.delete(storedKey);
    }
  }
  const row = authRateLimits.get(key);
  if (!row || row.resetAt <= now) {
    authRateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  row.count += 1;
  authRateLimits.set(key, row);
  if (row.count <= limit) return false;
  const retryAfter = Math.max(1, Math.ceil((row.resetAt - now) / 1000));
  res.writeHead(429, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Retry-After": String(retryAfter)
  });
  res.end(JSON.stringify({ ok: false, error: "Too many attempts. Please wait and try again." }));
  return true;
}

function clientIp(req) {
  return clean(String(req.headers["x-forwarded-for"] || "").split(",")[0] || req.socket.remoteAddress || "unknown", 80);
}

function parseJson(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function json(res, body, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  res.end();
}

function clean(value, max = 2000) {
  return String(value ?? "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim().slice(0, max);
}

function escapeHtml(value) {
  return clean(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[ch]));
}

function promoForCode(code) {
  const codes = getSettings().promoCodes || {};
  return codes[clean(code, 40).toUpperCase()] || null;
}

function sqftPerCarton(product) {
  return Math.max(1, Number(String(product.specs?.squareFootagePerCarton || "1").match(/[\d.]+/)?.[0] || 1));
}

function cartonsFor(product, sqft) {
  return Math.ceil(Number(sqft || 0) / sqftPerCarton(product) - 0.000001);
}

function cartonPrice(product) {
  return sqftPerCarton(product) * Number(product.pricePerSqft || 0);
}

function stripeAmount(amount) {
  return Math.max(0, Math.round(Number(amount || 0) * 100));
}

function verifyStripeSignature(raw, header) {
  const timestamp = /(?:^|,)t=(\d+)/.exec(header)?.[1] || "";
  const signatures = [...String(header || "").matchAll(/(?:^|,)v1=([a-f0-9]+)/g)].map((match) => match[1]);
  if (!timestamp || !signatures.length || Math.abs(nowSeconds() - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac("sha256", config.stripeWebhookSecret).update(`${timestamp}.${raw}`).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  return signatures.some((signature) => {
    const signatureBuffer = Buffer.from(signature);
    return signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  });
}

function encodeForm(value, prefix) {
  const pairs = [];
  const walk = (val, key) => {
    if (val === undefined || val === null) return;
    if (Array.isArray(val)) val.forEach((child, i) => walk(child, `${key}[${i}]`));
    else if (typeof val === "object") Object.entries(val).forEach(([childKey, child]) => walk(child, key ? `${key}[${childKey}]` : childKey));
    else pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
  };
  walk(value, prefix || "");
  return pairs.join("&");
}

function deepMerge(base, patch) {
  const out = { ...(base || {}) };
  for (const [key, value] of Object.entries(patch || {})) {
    out[key] = value && typeof value === "object" && !Array.isArray(value) ? deepMerge(out[key], value) : value;
  }
  return out;
}

function siteBase(req) {
  if (config.siteBaseUrl) return config.siteBaseUrl;
  const proto = req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http");
  return `${proto}://${req.headers.host || "localhost"}`;
}

function defaultSettings() {
  return {
    freightFlat: 149, garagePerCarton: 3, taxRate: 0.065, freeShipOver: 1200,
    businessName: "Lunde Flooring Co.", businessPhone: "(661) 444-2857",
    businessEmail: "orders@lundeflooring.com", businessAddress: "Bakersfield, CA",
    businessHours: "",
    emailOrderConfirmation: true, emailDeliveryNotice: true, emailNewMessageAlert: true, emailReplyTo: "",
    promoCodes: {
      LUNDE10: { code: "LUNDE10", label: "LUNDE10", type: "percent", value: 0.10 },
      SAMPLE5: { code: "SAMPLE5", label: "SAMPLE5", type: "fixed", value: 5 }
    }
  };
}

/* Stored settings merged over defaults, so new fields appear without migrations. */
function getSettings() {
  return { ...defaultSettings(), ...readStore("settings", {}) };
}

/* ---------- site traffic (first-party, cookie-free, staff-only reporting) ----------
   Counts storefront HTML page views per day with an approximate unique-visitor
   count (salted daily hash of ip+ua — never stored raw, resets every day).
   Buffered in memory and flushed to the store at most every 30s so Supabase
   isn't written on every page view. */
const trafficState = { days: null, dirty: false };
function trafficDayKey(ts = Date.now()) { return new Date(ts).toISOString().slice(0, 10); }
function loadTraffic() {
  if (!trafficState.days) {
    const stored = readStore("traffic", { days: {} });
    trafficState.days = stored && stored.days ? stored.days : {};
  }
  return trafficState.days;
}
function recordPageView(req, basename) {
  try {
    const ua = String(req.headers["user-agent"] || "");
    if (!ua || /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|lighthouse|headless|pingdom|uptime|monitor/i.test(ua)) return;
    if (currentStaff(req)) return; // staff browsing the store shouldn't inflate numbers
    const days = loadTraffic();
    const key = trafficDayKey();
    const day = days[key] || (days[key] = { views: 0, uniques: 0, hashes: [], pages: {} });
    day.views += 1;
    const visitorHash = crypto.createHash("sha256")
      .update(`${clientIp(req)}|${ua}|${key}|${config.authSecret}`)
      .digest("hex").slice(0, 16);
    if (day.hashes.length < 5000 && !day.hashes.includes(visitorHash)) {
      day.hashes.push(visitorHash);
      day.uniques += 1;
    }
    const page = basename === "index.html" ? "/" : `/${basename}`;
    if (Object.keys(day.pages).length < 200 || day.pages[page] !== undefined) {
      day.pages[page] = (day.pages[page] || 0) + 1;
    }
    const keys = Object.keys(days).sort();
    while (keys.length > 60) delete days[keys.shift()]; // keep ~2 months
    trafficState.dirty = true;
  } catch { /* analytics must never break a page load */ }
}
setInterval(() => {
  if (trafficState.dirty && trafficState.days) {
    trafficState.dirty = false;
    try { writeStore("traffic", { days: trafficState.days }); } catch { trafficState.dirty = true; }
  }
}, 30 * 1000).unref();

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
