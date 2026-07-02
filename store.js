/* Lunde shared store: cart storage, carton math, cart drawer, orders. */

(function () {
  const CART_KEY = "foundation_flooring_quote_v1"; /* same shape as the old estimate — keeps any saved items */
  const ORDERS_KEY = "lunde_orders_v1";
  const QUOTES_KEY = "lunde_quotes_v1";
  const CUSTOMERS_KEY = "lunde_customers_v1";
  const CUSTOMER_SESSION_KEY = "lunde_customer_session_v1";
  let activeCustomer = null;
  const FREIGHT_FLAT = 149;
  const FREE_FREIGHT_MIN = 1200; // free local delivery at/above this material subtotal
  const GARAGE_PLACEMENT_PER_CARTON = 3;
  const TAX_RATE = 0.065;
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const PROMO_CODES = {
    LUNDE10: { code: "LUNDE10", label: "LUNDE10", type: "percent", value: 0.10 },
    SAMPLE5: { code: "SAMPLE5", label: "SAMPLE5", type: "fixed", value: 5 }
  };

  const STATUSES = ["placed", "processing", "shipped", "delivered"];
  const STATUS_LABELS = {
    placed: "Placed",
    processing: "Processing",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled"
  };

  function products() {
    const ov = productOverrides();
    return (window.LUNDE_PRODUCTS || []).map((p) => mergeOverride(p, ov[p.id]));
  }
  function productById(id) {
    const base = (window.LUNDE_PRODUCTS || []).find((p) => p.id === id);
    return base ? mergeOverride(base, productOverrides()[id]) : undefined;
  }
  const PRODUCTS_KEY = "lunde_product_overrides_v1";
  function productOverrides() { return readJson(PRODUCTS_KEY, {}); }
  function mergeOverride(p, ov) {
    if (!ov) return p;
    return { ...p, ...ov, specs: { ...p.specs, ...(ov.specs || {}) } };
  }

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
  }
  function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  function cart() { return readJson(CART_KEY, {}); }
  function saveCart(obj) {
    const clean = Object.fromEntries(Object.entries(obj).filter(([, e]) => (e.sqft || 0) > 0 || (e.samples || 0) > 0));
    writeJson(CART_KEY, clean);
    renderHeaderCount();
    return clean;
  }
  function updateEntry(productId, values) {
    const c = cart();
    const next = { ...(c[productId] || { sqft: 0, samples: 0 }), ...values };
    if ((next.sqft || 0) <= 0 && (next.samples || 0) <= 0) delete c[productId];
    else c[productId] = next;
    return saveCart(c);
  }
  function clearCart() { saveCart({}); }

  function sqftPerCarton(product) { return Number.parseFloat(product?.specs?.squareFootagePerCarton) || 1; }
  function cartonsFor(product, sqft) { return Math.ceil(((Number(sqft) || 0) / sqftPerCarton(product)) - 0.000001); }
  function sqftForCartons(product, cartons) { return Math.max(0, Math.round(Number(cartons) || 0) * sqftPerCarton(product)); }
  function cartonPrice(product) { return sqftPerCarton(product) * product.pricePerSqft; }
  function materialEstimate(product, sqft) { return cartonsFor(product, sqft) * cartonPrice(product); }

  function normalizeEmail(email) { return String(email || "").trim().toLowerCase(); }
  function customers() { return readJson(CUSTOMERS_KEY, []); }
  function saveCustomers(list) { writeJson(CUSTOMERS_KEY, list); return list; }
  function currentCustomerId() { return activeCustomer && activeCustomer.id ? activeCustomer.id : ""; }
  function currentCustomer() { return activeCustomer; }
  function customerDetails(customer) {
    if (!customer) return {};
    return {
      name: customer.name || "",
      company: customer.company || "",
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      city: customer.city || "",
      state: customer.state || "",
      zip: customer.zip || ""
    };
  }
  /* Server-authoritative signup. The account (with a hashed password) lives on
     the server so the same credentials work from any device/browser. The browser
     keeps only non-sensitive display info — never the password. */
  async function createCustomerAccount(details) {
    const email = normalizeEmail(details.email);
    const password = String(details.password || "");
    if (!email) return { ok: false, error: "Enter a valid email address." };
    if (password.length < 10) return { ok: false, error: "Password must be at least 10 characters." };
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) return { ok: false, error: "Password must include uppercase, lowercase, and a number." };
    const data = await serverSignup({
      email,
      password,
      name: String(details.name || "").trim(),
      company: String(details.company || "").trim(),
      phone: String(details.phone || "").trim()
    });
    if (data === null) return { ok: false, error: "Could not reach the server. Check your connection and try again." };
    if (data.ok) return { ok: true, pendingVerification: true, email: data.email || email, emailSent: data.emailSent, devVerificationUrl: data.devVerificationUrl || "" };
    return { ok: false, error: data.error || "Could not create the account." };
  }
  /* Server-authoritative sign-in: credentials are verified against the server,
     so a customer can sign in from any device using the same email + password. */
  async function signInCustomer(email, password) {
    const data = await serverLogin(normalizeEmail(email), String(password || ""));
    if (data === null) return { ok: false, error: "Could not reach the server. Check your connection and try again." };
    if (data.ok && data.account) {
      ensureLocalCustomerFromAccount(data.account);
      announceAuth();
      return { ok: true, customer: currentCustomer() };
    }
    return { ok: false, code: data.code || "", email: data.email || email, error: data.error || "Email or password did not match." };
  }
  function signOutCustomer() {
    activeCustomer = null;
    localStorage.removeItem(CUSTOMER_SESSION_KEY);
    serverCustomerLogout().catch(() => {});
    announceAuth();
    return true;
  }
  function updateCurrentCustomer(patch) {
    const active = currentCustomer();
    if (!active) return null;
    const clean = Object.fromEntries(Object.entries(patch || {}).map(([key, value]) => [key, String(value || "").trim()]));
    const updated = { ...active, ...clean, updatedAt: Date.now() };
    saveCustomers(customers().map((customer) => customer.id === updated.id ? updated : customer));
    return updated;
  }
  function validatePromo(code) {
    const normalized = String(code || "").trim().toUpperCase();
    if (!normalized) return null;
    // Staff-managed codes from Settings win; the constants are only a fallback
    // for a cold cache that has never reached the server.
    const managed = readJson("lunde_settings_v1", {}).promoCodes;
    const codes = managed && typeof managed === "object" ? managed : PROMO_CODES;
    return codes[normalized] || null;
  }

  /* ---------- customer profile (staff) ---------- */
  function customerById(id) { return customers().find((c) => c.id === id) || null; }
  function addrFrom(r) {
    return { line1: r.address || "", city: r.city || "", state: r.state || "", zip: r.zip || "", country: "United States" };
  }
  function customerOrders(record) {
    const email = String(record.email || "").toLowerCase();
    return orders()
      .filter((o) => (record.id && o.checkout && o.checkout.customerId === record.id) || (email && String(o.customer && o.customer.email || "").toLowerCase() === email))
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  function customerProfile(idOrEmail) {
    let record = customerById(idOrEmail);
    let synthesized = false;
    if (!record) {
      const em = String(idOrEmail || "").toLowerCase();
      record = customers().find((c) => String(c.email || "").toLowerCase() === em) || null;
    }
    if (!record) {
      const em = String(idOrEmail || "").toLowerCase();
      const ord = orders().find((o) => String(o.customer && o.customer.email || "").toLowerCase() === em);
      if (ord) {
        synthesized = true;
        record = { id: "", name: ord.customer.name, company: ord.customer.company, email: ord.customer.email, phone: ord.customer.phone, address: ord.delivery && ord.delivery.method !== "pickup" ? ord.delivery.address : "", createdAt: ord.createdAt };
      }
    }
    if (!record) return null;
    const ords = customerOrders(record);
    const fulfilled = ords.filter((o) => o.status !== "cancelled");
    const ltv = fulfilled.reduce((s, o) => s + (o.totals.total || 0), 0);
    const openValue = ords.filter((o) => !["delivered", "cancelled"].includes(o.status)).reduce((s, o) => s + (o.totals.total || 0), 0);
    const defaults = { paymentTerms: "Net 30", taxExempt: false, preferredContact: "Email", marketingEmails: true, creditLimit: 10000, summaryNotes: "" };
    const profile = { ...defaults, ...(record.profile || {}) };
    if (profile.availableCredit == null) profile.availableCredit = Math.max(0, profile.creditLimit - openValue);
    return {
      ...record, synthesized, profile,
      notes: record.notes || [],
      billing: record.billing || addrFrom(record),
      shipping: record.shipping || record.billing || addrFrom(record),
      addresses: normalizeAddresses(record),
      orders: ords,
      stats: { ltv, totalOrders: ords.length, avgOrder: fulfilled.length ? ltv / fulfilled.length : 0, lastOrder: ords[0] ? ords[0].createdAt : record.createdAt, openValue }
    };
  }
  function updateCustomerProfile(id, patch) {
    const list = customers();
    let rec = list.find((c) => c.id === id);
    if (!rec) {
      rec = { id: id || ("CUST-" + Date.now().toString(36).toUpperCase()), createdAt: Date.now() };
      // Creating a record for a guest (keyed by email): seed contact details
      // from their order so notes/terms edits don't orphan the profile.
      const em = String(id || "").toLowerCase();
      if (em.includes("@")) {
        const ord = orders().find((o) => String(o.customer && o.customer.email || "").toLowerCase() === em);
        rec.email = em;
        if (ord && ord.customer) {
          rec.name = ord.customer.name || "";
          rec.company = ord.customer.company || "";
          rec.phone = ord.customer.phone || "";
        }
      }
      list.unshift(rec);
    }
    const merged = { ...rec, ...patch };
    if (patch.profile) merged.profile = { ...(rec.profile || {}), ...patch.profile };
    if (patch.billing) merged.billing = { ...(rec.billing || {}), ...patch.billing };
    if (patch.shipping) merged.shipping = { ...(rec.shipping || {}), ...patch.shipping };
    saveCustomers(list.map((c) => c.id === merged.id ? merged : c));
    push(CUSTOMERS_ENDPOINT, "PATCH", { id: merged.id, patch });
    return merged;
  }
  function addCustomerNote(id, text, author) {
    const t = String(text || "").trim();
    if (!t) return null;
    const note = { id: "CN-" + Date.now().toString(36).toUpperCase(), at: Date.now(), author: author || "Staff", text: t };
    const rec = customerById(id);
    updateCustomerProfile(id, { notes: [note, ...((rec && rec.notes) || [])] });
    return note;
  }

  /* ---------- multiple shipping addresses ---------- */
  function genAddrId() { return "ADDR-" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1296).toString(36); }
  const ADDRESS_LABELS = ["Home", "Office", "Warehouse", "Job Site", "Rental Property", "Commercial", "Other"];
  function normalizeAddresses(rec) {
    let list = Array.isArray(rec && rec.addresses) ? rec.addresses.map((a) => ({ ...a })) : [];
    if (!list.length) {
      const s = (rec && rec.shipping) || (rec && rec.address ? { line1: rec.address, city: rec.city, state: rec.state, zip: rec.zip } : null);
      if (s && (s.line1 || s.city)) {
        list = [{ id: genAddrId(), label: "Primary", line1: s.line1 || "", city: s.city || "", state: s.state || "", zip: s.zip || "", country: s.country || "United States", isDefault: true }];
      }
    }
    if (list.length && !list.some((a) => a.isDefault)) list[0].isDefault = true;
    return list;
  }
  function customerAddresses(id) { const rec = customerById(id); return rec ? normalizeAddresses(rec) : []; }
  function saveAddresses(id, list) {
    let seenDefault = false;
    list.forEach((a) => { if (a.isDefault) { if (seenDefault) a.isDefault = false; else seenDefault = true; } });
    if (list.length && !seenDefault) list[0].isDefault = true;
    const merged = updateCustomerProfile(id, { addresses: list });
    if (currentCustomerId() === id && typeof saveAccountProfile === "function") saveAccountProfile({ addresses: list }).catch(() => {});
    return merged;
  }
  function addCustomerAddress(id, addr) {
    const list = customerAddresses(id);
    const makeDefault = addr.isDefault || list.length === 0;
    if (makeDefault) list.forEach((a) => { a.isDefault = false; });
    const a = {
      id: genAddrId(),
      label: String(addr.label || "Address").trim(),
      line1: String(addr.line1 || "").trim(), city: String(addr.city || "").trim(),
      state: String(addr.state || "").trim(), zip: String(addr.zip || "").trim(),
      country: String(addr.country || "United States").trim(), isDefault: makeDefault
    };
    list.push(a);
    saveAddresses(id, list);
    return a;
  }
  function updateCustomerAddress(id, addrId, patch) {
    const clean = {};
    ["label", "line1", "city", "state", "zip", "country"].forEach((k) => { if (patch[k] != null) clean[k] = String(patch[k]).trim(); });
    let list = customerAddresses(id).map((a) => a.id === addrId ? { ...a, ...clean } : a);
    if (patch.isDefault) list = list.map((a) => ({ ...a, isDefault: a.id === addrId }));
    saveAddresses(id, list);
  }
  function deleteCustomerAddress(id, addrId) {
    const list = customerAddresses(id).filter((a) => a.id !== addrId);
    saveAddresses(id, list);
  }
  function setDefaultAddress(id, addrId) {
    saveAddresses(id, customerAddresses(id).map((a) => ({ ...a, isDefault: a.id === addrId })));
  }
  function formatAddress(a) {
    if (!a) return "";
    return [a.line1, [a.city, a.state].filter(Boolean).join(", "), a.zip].filter(Boolean).join(", ");
  }
  /* current-customer (storefront) wrappers */
  function myAddresses() { const c = currentCustomer(); return c ? customerAddresses(c.id) : []; }
  function addMyAddress(addr) { const c = currentCustomer(); return c ? addCustomerAddress(c.id, addr) : null; }
  function updateMyAddress(addrId, patch) { const c = currentCustomer(); if (c) updateCustomerAddress(c.id, addrId, patch); }
  function deleteMyAddress(addrId) { const c = currentCustomer(); if (c) deleteCustomerAddress(c.id, addrId); }
  function setMyDefaultAddress(addrId) { const c = currentCustomer(); if (c) setDefaultAddress(c.id, addrId); }


  /* Store-wide pricing/settings: server-backed, cached locally, constants as fallback. */
  const SETTINGS_KEY = "lunde_settings_v1";
  function siteSettings() {
    return {
      freightFlat: FREIGHT_FLAT, garagePerCarton: GARAGE_PLACEMENT_PER_CARTON,
      taxRate: TAX_RATE, freeShipOver: FREE_FREIGHT_MIN,
      ...readJson(SETTINGS_KEY, {})
    };
  }
  async function pullSettings() {
    const data = await api(`${API_BASE}/settings`);
    if (data && data.ok && data.settings) writeJson(SETTINGS_KEY, data.settings);
    return data;
  }
  async function updateSettings(patch) {
    const data = await api(`${API_BASE}/settings`, { method: "PATCH", body: patch });
    if (data && data.ok && data.settings) writeJson(SETTINGS_KEY, data.settings);
    return data;
  }

  function cartTotals(items, delivery, placement, promoCode) {
    let material = 0, samples = 0, cartons = 0;
    for (const [id, entry] of Object.entries(items || cart())) {
      const product = productById(id);
      if (!product) continue;
      if (entry.sqft > 0) {
        material += materialEstimate(product, entry.sqft);
        cartons += cartonsFor(product, entry.sqft);
      }
      samples += (entry.samples || 0) * product.samplePrice;
    }
    const subtotal = material + samples;
    const promo = validatePromo(promoCode);
    const discount = promo
      ? Math.min(subtotal, promo.type === "percent" ? subtotal * promo.value : promo.value)
      : 0;
    const discountedSubtotal = Math.max(0, subtotal - discount);
    // Pricing knobs come from staff Settings (cached), constants as fallback.
    const s = siteSettings();
    const garagePlacement = delivery === "pickup" || placement !== "garage" ? 0 : cartons * s.garagePerCarton;
    const freeDelivery = discountedSubtotal >= s.freeShipOver;
    const baseFreight = delivery === "pickup" || freeDelivery || material <= 0 ? 0 : s.freightFlat;
    const freight = baseFreight + garagePlacement;
    const tax = discountedSubtotal * s.taxRate;
    return { material, samples, cartons, subtotal, discount, discountedSubtotal, promo, freight, garagePlacement, tax, total: discountedSubtotal + freight + tax };
  }

  function cartCount() {
    return Object.entries(cart()).reduce((sum, [id, e]) => {
      const product = productById(id);
      return sum + (product && e.sqft > 0 ? cartonsFor(product, e.sqft) : 0) + (e.samples || 0);
    }, 0);
  }

  /* ---------- orders ---------- */

  function orders() { return readJson(ORDERS_KEY, []); }
  function orderById(id) { return orders().find((o) => o.id === id); }
  function saveOrder(order) {
    const all = [order, ...orders()];
    writeJson(ORDERS_KEY, all);
    push(ORDERS_ENDPOINT, "POST", order);
    return order;
  }
  // Normalize any historical staffNotes value into an array of note objects.
  // Accepts: array of {at,author,text} (current), array of strings, a bare
  // string (older local saves), or empty. Never throws.
  function coerceStaffNotes(raw, fallbackAt) {
    if (Array.isArray(raw)) {
      return raw.map((n) => (n && typeof n === "object")
        ? { at: n.at || fallbackAt || Date.now(), author: n.author || "Staff", text: String(n.text == null ? "" : n.text) }
        : { at: fallbackAt || Date.now(), author: "Staff", text: String(n == null ? "" : n) })
        .filter((n) => n.text);
    }
    if (raw) return [{ at: fallbackAt || Date.now(), author: "Staff", text: String(raw) }];
    return [];
  }
  function updateOrder(id, patch) {
    const all = orders().map((order) => {
      if (order.id !== id) return order;
      const next = { ...order, ...patch };
      if (patch.status && patch.status !== order.status) {
        next.history = [...(order.history || []), { status: patch.status, at: Date.now() }];
      }
      // Internal notes are a running log: a string patch appends a new note,
      // and any legacy string/array value is coerced to the note-object shape.
      if (typeof patch.staffNotes === "string") {
        const text = patch.staffNotes.trim();
        const prior = coerceStaffNotes(order.staffNotes, order.createdAt);
        const author = (typeof window !== "undefined" && window.lundeSession && window.lundeSession.name) || "Staff";
        next.staffNotes = text ? [...prior, { at: Date.now(), author, text }] : prior;
      }
      return next;
    });
    writeJson(ORDERS_KEY, all);
    push(`${ORDERS_ENDPOINT}/${encodeURIComponent(id)}`, "PATCH", patch);
    return orderById(id);
  }
  function newOrderId() {
    return "LU-" + new Date().toISOString().slice(2, 10).replaceAll("-", "") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  /* ---------- quotes (persistent; save a cart, reload or reorder later) ---------- */

  function quotes() { return readJson(QUOTES_KEY, []); }
  function quoteById(id) { return quotes().find((q) => q.id === id); }
  function newQuoteId() {
    return "LQ-" + new Date().toISOString().slice(2, 10).replaceAll("-", "") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  }
  function saveQuotes(list) { writeJson(QUOTES_KEY, list); return list; }

  /* Snapshot the current cart (or a passed item map) into a saved quote. */
  function saveQuoteFromCart(job, opts) {
    const o = opts || {};
    const items = o.items || cart();
    if (!Object.keys(items).length) return null;
    const t = cartTotals(items);
    const customer = currentCustomer();
    const detail = o.customer || (customer ? customerDetails(customer) : {});
    const quote = {
      id: newQuoteId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: "saved",
      job: String(job || "Saved quote").trim() || "Saved quote",
      notes: String(o.notes || "").trim(),
      customerId: o.customerId || (customer ? customer.id : ""),
      items: JSON.parse(JSON.stringify(items)),
      totals: { material: t.material, samples: t.samples, cartons: t.cartons, subtotal: t.subtotal, total: t.total },
      customer: { name: detail.name || "", company: detail.company || "", email: detail.email || "", phone: detail.phone || "" }
    };
    saveQuotes([quote, ...quotes()]);
    push(QUOTES_ENDPOINT, "POST", quote);
    return quote;
  }
  function updateQuote(id, patch) {
    let updated = null;
    saveQuotes(quotes().map((q) => {
      if (q.id !== id) return q;
      updated = { ...q, ...patch, updatedAt: Date.now() };
      return updated;
    }));
    if (updated) push(`${QUOTES_ENDPOINT}/${encodeURIComponent(id)}`, "PATCH", { ...patch, updatedAt: updated.updatedAt });
    return updated;
  }
  function duplicateQuote(id) {
    const q = quoteById(id);
    if (!q) return null;
    const copy = { ...JSON.parse(JSON.stringify(q)), id: newQuoteId(), createdAt: Date.now(), updatedAt: Date.now(), status: "saved", job: (q.job || "Saved quote") + " (copy)" };
    saveQuotes([copy, ...quotes()]);
    push(QUOTES_ENDPOINT, "POST", copy);
    return copy;
  }
  function deleteQuote(id) {
    saveQuotes(quotes().filter((q) => q.id !== id));
    push(`${QUOTES_ENDPOINT}/${encodeURIComponent(id)}`, "DELETE");
    return true;
  }
  /* Email the quote to its customer (server sends via Resend, marks it sent). */
  async function sendQuoteToCustomer(id) {
    const data = await api(`${QUOTES_ENDPOINT}/${encodeURIComponent(id)}/send`, { method: "POST" });
    if (data && data.ok && Array.isArray(data.items)) saveQuotes(data.items);
    return data || { ok: false, error: "Could not reach the server." };
  }
  /* Reply to an inbox message by email (server sends + logs the reply). */
  async function replyToFeedback(id, message) {
    const data = await api(`${FEEDBACK_ENDPOINT}/${encodeURIComponent(id)}/reply`, { method: "POST", body: { message } });
    if (data && data.ok && Array.isArray(data.items)) saveFeedbackItems(data.items);
    return data || { ok: false, error: "Could not reach the server." };
  }
  /* Re-send the customer's receipt email for an order. */
  async function resendOrderReceipt(id) {
    const data = await api(`${ORDERS_ENDPOINT}/${encodeURIComponent(id)}/receipt-email`, { method: "POST" });
    return data || { ok: false, error: "Could not reach the server." };
  }
  /* Merge a quote's lines into the live cart. Pricing re-derives from the
     current catalog (carton math is always recomputed), so quotes never
     carry stale prices into checkout. */
  function quoteToCart(id) {
    const q = quoteById(id);
    if (!q) return 0;
    const c = cart();
    let added = 0;
    for (const [pid, entry] of Object.entries(q.items || {})) {
      if (!productById(pid)) continue;
      const cur = c[pid] || { sqft: 0, samples: 0 };
      c[pid] = { sqft: (cur.sqft || 0) + (entry.sqft || 0), samples: (cur.samples || 0) + (entry.samples || 0) };
      added += 1;
    }
    saveCart(c);
    return added;
  }
  async function pullQuotes() {
    const data = await api(QUOTES_ENDPOINT);
    if (data && data.ok && Array.isArray(data.items)) writeJson(QUOTES_KEY, data.items);
    return data;
  }

  /* Re-add every line from a past order into the cart (reorder the same spec). */
  function reorderToCart(orderId) {
    const order = orderById(orderId);
    if (!order) return 0;
    const c = cart();
    let added = 0;
    for (const [pid, entry] of Object.entries(order.items || {})) {
      if (!productById(pid)) continue;
      const cur = c[pid] || { sqft: 0, samples: 0 };
      c[pid] = { sqft: (cur.sqft || 0) + (entry.sqft || 0), samples: (cur.samples || 0) + (entry.samples || 0) };
      added += 1;
    }
    saveCart(c);
    return added;
  }

  function renderHeaderCount() {
    document.querySelectorAll("[data-cart-count]").forEach((node) => {
      node.textContent = String(cartCount());
    });
  }

  /* ---------- backend sync (orders / inventory / customers / auth) ---------- */
  /* The console talks to the Node API when it is reachable, and transparently
     falls back to this device's localStorage when it is not (offline / static
     hosting / this design preview). Reads stay synchronous against the cache;
     writes update the cache immediately and push to the server in the
     background. */

  const API_BASE = "./api";
  const ORDERS_ENDPOINT = `${API_BASE}/orders`;
  const QUOTES_ENDPOINT = `${API_BASE}/quotes`;
  const INVENTORY_ENDPOINT = `${API_BASE}/inventory`;
  const CUSTOMERS_ENDPOINT = `${API_BASE}/customers`;
  const PRODUCTS_ENDPOINT = `${API_BASE}/products`;
  const NOTES_ENDPOINT = `${API_BASE}/notes`;
  const NOTES_KEY = "lunde_team_notes_v1";
  let apiOnline = null;

  function apiIsOnline() { return apiOnline === true; }

  async function api(pathname, { method = "GET", body } = {}) {
    try {
      const opts = { method, headers: { Accept: "application/json" }, credentials: "same-origin" };
      if (body !== undefined) {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
      }
      const url = method === "GET" ? `${pathname}?t=${Date.now()}` : pathname;
      const response = await fetch(url, opts);
      apiOnline = true;
      if (response.status === 401) return { ok: false, status: 401, error: "unauthorized" };
      if (!response.ok) throw new Error("API error " + response.status);
      return await response.json();
    } catch (error) {
      apiOnline = false;
      return null;
    }
  }

  function push(pathname, method, body) {
    // fire-and-forget; never blocks the UI or the customer checkout flow
    api(pathname, { method, body }).catch(() => {});
  }

  async function pullOrders() {
    const data = await api(ORDERS_ENDPOINT);
    if (data && data.ok && Array.isArray(data.items)) writeJson(ORDERS_KEY, data.items);
    return data;
  }
  async function pullInventory() {
    const data = await api(INVENTORY_ENDPOINT);
    if (data && data.ok && data.items && typeof data.items === "object") writeJson(INVENTORY_KEY, data.items);
    return data;
  }
  async function pullCustomers() {
    const data = await api(CUSTOMERS_ENDPOINT);
    if (data && data.ok && Array.isArray(data.items)) writeJson(CUSTOMERS_KEY, data.items);
    return data;
  }
  async function pullProducts() {
    const data = await api(PRODUCTS_ENDPOINT);
    if (data && data.ok && data.items && typeof data.items === "object") writeJson(PRODUCTS_KEY, data.items);
    return data;
  }
  /* Save an edited product as an override (merged over the catalog in data.js). */
  function updateProduct(id, patch) {
    const ov = productOverrides();
    const cur = ov[id] || {};
    const next = { ...cur, ...patch };
    if (patch && patch.specs) next.specs = { ...(cur.specs || {}), ...patch.specs };
    ov[id] = next;
    writeJson(PRODUCTS_KEY, ov);
    push(PRODUCTS_ENDPOINT, "PUT", { id, patch: next });
    return productById(id);
  }

  /* standalone internal team notes (Messages composer) */
  function teamNotes() { return readJson(NOTES_KEY, []); }
  function addTeamNote(text, author) {
    const note = {
      id: "NOTE-" + Date.now().toString(36).toUpperCase(),
      createdAt: Date.now(),
      author: String(author || "Staff").trim() || "Staff",
      text: String(text || "").trim()
    };
    if (!note.text) return null;
    writeJson(NOTES_KEY, [note, ...teamNotes()]);
    push(NOTES_ENDPOINT, "POST", note);
    return note;
  }
  async function pullNotes() {
    const data = await api(NOTES_ENDPOINT);
    if (data && data.ok && Array.isArray(data.items)) writeJson(NOTES_KEY, data.items);
    return data;
  }
  async function syncFromServer() {
    await Promise.all([pullOrders(), pullInventory(), pullCustomers(), pullProducts(), pullNotes(), pullQuotes(), pullSettings(), refreshFeedback()]);
    // Console pages listen for this to re-render with fresh data.
    try { document.dispatchEvent(new CustomEvent("lunde:synced", { detail: { online: apiOnline === true } })); } catch {}
    return apiOnline === true;
  }

  /* Staff console freshness: the console used to render only this device's
     localStorage cache — real customer orders never appeared until a manual
     refresh. Pull everything on load and whenever the tab regains focus. */
  function staffAutoSync() {
    let hasStaffSession = false;
    try { hasStaffSession = Boolean(localStorage.getItem("lunde_staff_session_v1")); } catch {}
    if (!hasStaffSession) return;
    syncFromServer().catch(() => {});
    let lastSync = Date.now();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && Date.now() - lastSync > 30 * 1000) {
        lastSync = Date.now();
        syncFromServer().catch(() => {});
      }
    });
  }

  /* staff auth (demo) */
  async function staffLogin(email, password) {
    const data = await authPost(`${API_BASE}/auth/login`, { email, password });
    if (data === null) return { ok: false, error: "Could not reach the server. Check your connection and try again." };
    return data;
  }
  async function staffMe() { return api(`${API_BASE}/auth/me`); }
  async function staffLogout() { return api(`${API_BASE}/auth/logout`, { method: "POST" }); }
  async function staffRequestPasswordReset(email) { return authPost(`${API_BASE}/auth/password-reset/request`, { email: normalizeEmail(email) }); }
  async function staffResetPassword(token, password) { return authPost(`${API_BASE}/auth/password-reset/confirm`, { token, password }); }

  /* Admin user management (Owner-only on the server). Each helper preserves the
     server's JSON body so the UI can show validation/permission errors. */
  async function adminRequest(pathname, method, body) {
    try {
      const opts = { method, headers: { Accept: "application/json" }, credentials: "same-origin" };
      if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
      const url = method === "GET" ? `${pathname}?t=${Date.now()}` : pathname;
      const response = await fetch(url, opts);
      apiOnline = true;
      return await response.json().catch(() => ({ ok: false, error: "Unexpected server response." }));
    } catch (error) {
      apiOnline = false;
      return { ok: false, error: "Could not reach the server. Check your connection and try again." };
    }
  }
  async function adminUsersList() { return adminRequest(`${API_BASE}/admins`, "GET"); }
  async function adminUserCreate(details) { return adminRequest(`${API_BASE}/admins`, "POST", details); }
  async function adminUserUpdate(id, patch) { return adminRequest(`${API_BASE}/admins/${encodeURIComponent(id)}`, "PATCH", patch); }
  async function adminUserDelete(id) { return adminRequest(`${API_BASE}/admins/${encodeURIComponent(id)}`, "DELETE"); }

  /* customer auth — server-backed accounts (durable, cross-device).
     Local cache stays authoritative for the synchronous UI and offline use;
     these reconcile it with the server session in the background. */
  function ensureLocalCustomerFromAccount(acc) {
    if (!acc || !acc.id) return;
    activeCustomer = { ...acc };
    const list = customers();
    const existing = list.find((c) => c.id === acc.id);
    const display = { id: acc.id, createdAt: acc.createdAt || Date.now(), name: acc.name || "", company: acc.company || "", email: acc.email || "", phone: acc.phone || "", addresses: Array.isArray(acc.addresses) ? acc.addresses : [], favorites: Array.isArray(acc.favorites) ? acc.favorites : [], avatar: acc.avatar || "" };
    // Server account is the source of truth for a signed-in customer's favorites.
    if (Array.isArray(acc.favorites)) writeJson(FAVORITES_KEY, acc.favorites);
    if (existing) {
      saveCustomers(list.map((c) => c.id === acc.id ? { ...c, ...display } : c));
    } else {
      saveCustomers([display, ...list]);
    }
    localStorage.removeItem(CUSTOMER_SESSION_KEY);
  }
  function announceAuth() { try { window.dispatchEvent(new CustomEvent("lunde:customer")); } catch {} }

  /* Auth POST that preserves the server's JSON error body for any status (the
     shared api() helper collapses 401/4xx responses and loses the message).
     Returns null only when the network is unreachable. */
  async function authPost(pathname, body) {
    try {
      const response = await fetch(pathname, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body)
      });
      apiOnline = true;
      return await response.json().catch(() => ({ ok: false, error: "Unexpected server response." }));
    } catch (error) {
      apiOnline = false;
      return null;
    }
  }
  async function serverSignup(details) { return authPost(`${API_BASE}/customer/signup`, details); }
  async function serverLogin(email, password) { return authPost(`${API_BASE}/customer/login`, { email, password }); }
  async function serverCustomerLogout() { return api(`${API_BASE}/customer/logout`, { method: "POST" }); }
  async function serverCustomerMe() { return api(`${API_BASE}/customer/me`); }
  async function resendVerificationEmail(email) { return authPost(`${API_BASE}/customer/verification/resend`, { email: normalizeEmail(email) }); }
  async function verifyCustomerEmail(token) { return authPost(`${API_BASE}/customer/verify-email`, { token }); }
  async function requestPasswordReset(email) { return authPost(`${API_BASE}/customer/password-reset/request`, { email: normalizeEmail(email) }); }
  async function resetCustomerPassword(token, password) { return authPost(`${API_BASE}/customer/password-reset/confirm`, { token, password }); }
  async function updateCustomerPassword(currentPassword, newPassword) { return authPost(`${API_BASE}/customer/password`, { currentPassword, newPassword }); }

  /* Reconcile this device with the server session on page load. The server cookie
     is the source of truth: adopt its account if signed in, or drop a stale local
     session if the server session has expired or been cleared. */
  async function hydrateCustomerSession() {
    const data = await serverCustomerMe();
    if (data === null) return; // offline — keep existing display cache as-is, don't signal
    if (data.ok && data.account) {
      ensureLocalCustomerFromAccount(data.account);
    } else {
      activeCustomer = null;
      localStorage.removeItem(CUSTOMER_SESSION_KEY);
    }
    announceAuth(); // always fire once hydration resolves so guards know the real state
  }

  /* The signed-in customer's own orders, from the server (cross-device). */
  async function accountOrders() {
    const data = await api(`${API_BASE}/customer/orders`);
    return data && data.ok && Array.isArray(data.items) ? data.items : [];
  }
  /* Persist profile/address changes to the server account, then refresh the cache. */
  async function saveAccountProfile(patch) {
    const data = await api(`${API_BASE}/customer/profile`, { method: "PATCH", body: { patch } });
    if (data && data.ok && data.account) {
      ensureLocalCustomerFromAccount(data.account);
      announceAuth();
      return { ok: true, account: data.account };
    }
    return { ok: false, error: (data && data.error) || "Could not save your details." };
  }
  /* Async server-first sign-in, used when no local account matches (e.g. the
     account was created on another device). */
  async function signInCustomerRemote(email, password) {
    const data = await serverLogin(email, password);
    if (data && data.ok && data.account) {
      ensureLocalCustomerFromAccount(data.account);
      announceAuth();
      return { ok: true, customer: customers().find((c) => c.id === data.account.id) };
    }
    return { ok: false, code: data && data.code || "", email: data && data.email || email, error: (data && data.error) || "Email or password did not match." };
  }

  /* ---------- cart drawer ---------- */

  function mountDrawer() {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="drawer-scrim" data-drawer-close></div>
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="Shopping cart">
        <div class="drawer-head">
          <h2>Cart</h2>
          <button class="drawer-close" type="button" data-drawer-close aria-label="Close cart">&#215;</button>
        </div>
        <div class="drawer-body" id="drawerBody"></div>
        <div class="drawer-foot">
          <dl class="drawer-totals">
            <div><dt>Flooring material</dt><dd id="drawerMaterial">$0.00</dd></div>
            <div><dt>Samples</dt><dd id="drawerSamples">$0.00</dd></div>
            <div class="grand"><dt>Subtotal</dt><dd id="drawerTotal">$0.00</dd></div>
          </dl>
          <div class="drawer-actions">
            <a class="btn solid full" id="drawerCheckout" href="./checkout.html">Checkout</a>
            <button class="btn quiet" id="drawerSaveQuote" type="button">Save as quote</button>
            <button class="btn quiet" id="drawerQuotePdf" type="button">Download quote (PDF)</button>
            <a class="btn quiet" href="/account">View my account</a>
          </div>
          <p class="drawer-note">Material is sold by full carton. Freight and tax are calculated at checkout.</p>
        </div>
      </aside>
    `;
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  }

  function lineMarkup(product, entry) {
    const cartons = cartonsFor(product, entry.sqft);
    const covered = cartons * sqftPerCarton(product);
    const lineTotal = (entry.sqft > 0 ? materialEstimate(product, entry.sqft) : 0) + (entry.samples || 0) * product.samplePrice;
    const cartonLabel = `${cartons} carton${cartons === 1 ? "" : "s"}`;
    const cartonNote = entry.sqft > 0 ? `${cartonLabel} &middot; covers ${covered.toFixed(1)} sq. ft. &middot; ` : "";
    return `
      <div class="drawer-line" data-line="${product.id}">
        <img src="${window.lunde.thumb(product.mainImage)}" alt="${product.title} sample" loading="lazy">
        <div>
          <div class="drawer-line-head">
            <strong>${product.title}</strong>
            <b data-line-total>${money.format(lineTotal)}</b>
          </div>
          <p class="drawer-line-meta">${cartonNote}${money.format(cartonPrice(product))} / carton &middot; ${product.specs.squareFootagePerCarton}/ctn &middot; ${product.sku}</p>
          <div class="drawer-line-controls">
            <span class="carton-stepper" aria-label="Cartons of ${product.title}">
              <button type="button" data-line-carton="-1" aria-label="Remove one carton">&#8722;</button>
              <input type="number" min="0" step="1" value="${cartons || ""}" placeholder="0" data-line-cartons aria-label="Carton quantity for ${product.title}">
              <button type="button" data-line-carton="1" aria-label="Add one carton">+</button>
              <span>cartons</span>
            </span>
            <span class="stepper" aria-label="Samples of ${product.title}">
              <button type="button" data-line-sample="-1" aria-label="Remove a sample">&#8722;</button>
              <output>${entry.samples || 0} sample${(entry.samples || 0) === 1 ? "" : "s"}</output>
              <button type="button" data-line-sample="1" aria-label="Add a sample">+</button>
            </span>
            <button class="line-remove" type="button" data-line-remove>Remove</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderDrawerTotals() {
    const t = cartTotals(cart());
    document.querySelector("#drawerMaterial").textContent = money.format(t.material);
    document.querySelector("#drawerSamples").textContent = money.format(t.samples);
    document.querySelector("#drawerTotal").textContent = money.format(t.subtotal);
    const checkout = document.querySelector("#drawerCheckout");
    checkout.style.opacity = Object.keys(cart()).length ? "1" : "0.45";
    checkout.style.pointerEvents = Object.keys(cart()).length ? "auto" : "none";
  }

  function renderDrawer() {
    const body = document.querySelector("#drawerBody");
    if (!body) return;
    const entries = Object.entries(cart());
    body.innerHTML = entries.length
      ? entries.map(([id, entry]) => {
          const product = productById(id);
          return product ? lineMarkup(product, entry) : "";
        }).join("")
      : `<div class="drawer-empty"><p>Your cart is empty.</p><p>Add cartons or samples from any floor.</p></div>`;
    renderDrawerTotals();
  }

  function openDrawer() {
    renderDrawer();
    document.body.classList.add("drawer-open");
  }
  function closeDrawer() { document.body.classList.remove("drawer-open"); }

  function wireDrawer() {
    document.addEventListener("click", (event) => {
      const opener = event.target.closest("[data-open-cart]");
      if (opener) { event.preventDefault(); openDrawer(); return; }
      if (event.target.closest("[data-drawer-close]")) { closeDrawer(); return; }

      const line = event.target.closest("[data-line]");
      if (line) {
        const id = line.dataset.line;
        const product = productById(id);
        const cartonBtn = event.target.closest("[data-line-carton]");
        if (cartonBtn && product) {
          const entry = cart()[id] || { sqft: 0, samples: 0 };
          const nextCartons = Math.max(0, cartonsFor(product, entry.sqft) + Number(cartonBtn.dataset.lineCarton));
          updateEntry(id, { sqft: sqftForCartons(product, nextCartons) });
          renderDrawer();
          return;
        }
        const sampleBtn = event.target.closest("[data-line-sample]");
        if (sampleBtn) {
          const entry = cart()[id] || { sqft: 0, samples: 0 };
          updateEntry(id, { samples: Math.max(0, (entry.samples || 0) + Number(sampleBtn.dataset.lineSample)) });
          renderDrawer();
        }
        if (event.target.closest("[data-line-remove]")) {
          updateEntry(id, { sqft: 0, samples: 0 });
          renderDrawer();
        }
      }
    });

    document.addEventListener("input", (event) => {
      if (!event.target.matches("[data-line-cartons]")) return;
      const line = event.target.closest("[data-line]");
      if (!line) return;
      const id = line.dataset.line;
      const product = productById(id);
      if (!product) return;
      updateEntry(id, { sqft: sqftForCartons(product, event.target.value) });
      const entry = cart()[id] || { sqft: 0, samples: 0 };
      if (entry.sqft <= 0 && entry.samples <= 0) {
        renderDrawer();
        return;
      }
      const lineTotal = (entry.sqft > 0 ? materialEstimate(product, entry.sqft) : 0) + (entry.samples || 0) * product.samplePrice;
      line.querySelector("[data-line-total]").textContent = money.format(lineTotal);
      line.querySelector(".drawer-line-meta").innerHTML = entry.sqft > 0
        ? `${cartonsFor(product, entry.sqft)} carton${cartonsFor(product, entry.sqft) === 1 ? "" : "s"} &middot; covers ${(cartonsFor(product, entry.sqft) * sqftPerCarton(product)).toFixed(1)} sq. ft. &middot; ${money.format(cartonPrice(product))} / carton &middot; ${product.specs.squareFootagePerCarton}/ctn &middot; ${product.sku}`
        : `${money.format(cartonPrice(product))} / carton &middot; ${product.specs.squareFootagePerCarton}/ctn &middot; ${product.sku}`;
      renderDrawerTotals();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && document.body.classList.contains("drawer-open")) closeDrawer();
    });
  }

  const FAVORITES_KEY = "lunde_favorites_v1";

  function favorites() { return readJson(FAVORITES_KEY, []); }
  function isFavorite(id) { return favorites().includes(id); }
  function toggleFavorite(id) {
    const list = favorites();
    const next = list.includes(id) ? list.filter((f) => f !== id) : [...list, id];
    writeJson(FAVORITES_KEY, next);
    // Mirror the saveAddresses pattern: keep the customer record (staff view)
    // and the server account (cross-device) in sync for signed-in customers.
    const active = currentCustomer();
    if (active) {
      updateCustomerProfile(active.id, { favorites: next });
      if (typeof saveAccountProfile === "function") saveAccountProfile({ favorites: next }).catch(() => {});
    }
    return next.includes(id);
  }

  /* ---------- recently viewed (device-local browsing history) ---------- */

  const RECENT_KEY = "lunde_recently_viewed_v1";
  const RECENT_MAX = 12;

  function recentlyViewed() {
    return readJson(RECENT_KEY, []).map((id) => productById(id)).filter(Boolean);
  }
  function trackRecentlyViewed(id) {
    if (!id || !productById(id)) return;
    const list = readJson(RECENT_KEY, []).filter((x) => x !== id);
    list.unshift(id);
    writeJson(RECENT_KEY, list.slice(0, RECENT_MAX));
  }
  function clearRecentlyViewed() { writeJson(RECENT_KEY, []); }

  /* ---------- inventory ---------- */

  const INVENTORY_KEY = "lunde_inventory_v2";

  // Deterministic pseudo-random carton stock per product. Every floor gets a
  // healthy, varied quantity in the 350–750 range so the catalog reads as
  // well-stocked, and the number stays stable per SKU (same floor always shows
  // the same count) rather than flipping on every page load.
  function seedStockFor(id) {
    let h = 2166136261;
    const s = String(id);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 350 + (Math.abs(h) % 401); // 350–750 inclusive
  }

  function inventory() {
    let inv = readJson(INVENTORY_KEY, null);
    if (!inv) {
      inv = {};
      products().forEach((p) => { inv[p.id] = seedStockFor(p.id); });
      writeJson(INVENTORY_KEY, inv);
    }
    return inv;
  }
  function setStock(id, n) {
    const inv = inventory();
    inv[id] = Math.max(0, Math.round(Number(n) || 0));
    writeJson(INVENTORY_KEY, inv);
    push(INVENTORY_ENDPOINT, "PUT", { id, cartons: inv[id] });
  }
  function decrementStock(items) {
    const inv = inventory();
    for (const [id, entry] of Object.entries(items)) {
      const product = productById(id);
      if (product && entry.sqft > 0) inv[id] = Math.max(0, (inv[id] || 0) - cartonsFor(product, entry.sqft));
    }
    writeJson(INVENTORY_KEY, inv);
  }
  function stockInfo(id) {
    const n = inventory()[id];
    const cartons = n === undefined ? 999 : n;
    if (cartons <= 0) return { level: "out", cartons: 0, text: "Backordered \u2014 ships in 2\u20133 weeks" };
    if (cartons <= 30) return { level: "low", cartons, text: `Low stock \u2014 ${cartons} cartons left, ships in 2 business days` };
    return { level: "in", cartons, text: "In stock \u2014 ships in 2 business days" };
  }

  /* ---------- toast ---------- */

  let toastTimer = null;
  function showToast(message, actionLabel, actionFn) {
    document.querySelector(".toast")?.remove();
    clearTimeout(toastTimer);
    const toast = document.createElement("div");
    toast.className = "toast";
    const span = document.createElement("span");
    span.textContent = message;
    toast.appendChild(span);
    if (actionLabel) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = actionLabel;
      btn.addEventListener("click", () => { toast.remove(); actionFn && actionFn(); });
      toast.appendChild(btn);
    }
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  /* ---------- quote PDF ---------- */

  function makePdfBlob(title, lines) {
    const clean = (s) => String(s).replace(/[\u2033\u201d]/g, "in").replace(/[\u00d7]/g, "x").replace(/[\u2192]/g, "->").replace(/[\u2013\u2014]/g, "-").replace(/[\u00b7\u2022]/g, "-").replace(/[\u2019]/g, "'").replace(/[^\x20-\x7E]/g, "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    let content = "BT /F2 18 Tf 54 750 Td (" + clean(title) + ") Tj ET\n";
    let y = 714;
    for (const line of lines) {
      if (line === "") { y -= 10; continue; }
      const bold = line.startsWith("## ");
      content += "BT /" + (bold ? "F2 12" : "F1 10") + " Tf 54 " + y + " Td (" + clean(bold ? line.slice(3) : line) + ") Tj ET\n";
      y -= bold ? 20 : 15;
      if (y < 60) break;
    }
    const objects = [];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
    objects[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
    objects[6] = "<< /Length " + content.length + " >>\nstream\n" + content + "endstream";
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (let i = 1; i <= 6; i++) { offsets[i] = pdf.length; pdf += i + " 0 obj\n" + objects[i] + "\nendobj\n"; }
    const xref = pdf.length;
    pdf += "xref\n0 7\n0000000000 65535 f \n";
    for (let i = 1; i <= 6; i++) pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    pdf += "trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
    return new Blob([pdf], { type: "application/pdf" });
  }

  function downloadQuotePdf() {
    const q = cart();
    const entries = Object.entries(q);
    if (!entries.length) { showToast("Your cart is empty"); return; }
    const t = cartTotals(q);
    const fmt = (v) => "$" + v.toFixed(2);
    const lines = [new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), "", "## Materials"];
    for (const [id, entry] of entries) {
      const product = productById(id);
      if (!product) continue;
      if (entry.sqft > 0) {
        const cartons = cartonsFor(product, entry.sqft);
        const covered = (cartons * sqftPerCarton(product)).toFixed(1);
        lines.push(`${product.title} (${product.sku})`);
        lines.push(`   ${entry.sqft} sq. ft. -> ${cartons} cartons (covers ${covered} sq. ft.) @ ${fmt(cartonPrice(product))}/carton = ${fmt(materialEstimate(product, entry.sqft))}`);
      }
      if ((entry.samples || 0) > 0) {
        lines.push(`${product.title} sample x ${entry.samples} = ${fmt(entry.samples * product.samplePrice)}`);
      }
    }
    lines.push("", "## Totals");
    lines.push(`Flooring material: ${fmt(t.material)}`);
    lines.push(`Samples: ${fmt(t.samples)}`);
    lines.push(`Subtotal: ${fmt(t.subtotal)}`);
    if (t.discount > 0) lines.push(`Discount: -${fmt(t.discount)}`);
    lines.push(`Curbside freight: ${t.freight > 0 ? fmt(t.freight) : "Free"} (free over ${fmt(FREE_FREIGHT_MIN)} or for warehouse pickup)`);
    lines.push(`Estimated tax (6.5%): ${fmt(t.tax)}`);
    lines.push(`Estimated total: ${fmt(t.total)}`);
    lines.push("", "Material is sold by full carton. Quote valid for 30 days.", "Lunde Flooring Co.");
    const url = URL.createObjectURL(makePdfBlob("Flooring quote", lines));
    const a = document.createElement("a");
    a.href = url;
    a.download = "lunde-quote.pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function parseDims(product) {
    const raw = String(product.specs.dimensions || "");
    const nums = (raw.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    const w = nums[0] || 0;
    const lengths = nums.slice(1);
    const l = lengths.length ? Math.max(...lengths) : 0;
    const multi = lengths.length > 1;
    const label = w && l ? `${w}\u2033 \u00d7 ${multi ? Math.min(...lengths) + "\u2013" + l : l}\u2033` : raw;
    return { w, l, lengths, multi, label };
  }

  /* ---------- website feedback ---------- */

  const FEEDBACK_KEY = "lunde_site_feedback_v1";
  const FEEDBACK_ENDPOINT = "./api/feedback";
  let feedbackCache = readJson(FEEDBACK_KEY, []);
  let feedbackApiOnline = null;

  function feedbackItems() { return feedbackCache; }
  function feedbackServerOnline() { return feedbackApiOnline === true; }
  function saveFeedbackItems(items) {
    feedbackCache = Array.isArray(items) ? items : [];
    writeJson(FEEDBACK_KEY, items);
    return feedbackCache;
  }
  async function feedbackRequest(method = "GET", payload) {
    try {
      const options = {
        method,
        headers: { "Accept": "application/json" }
      };
      if (payload) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(payload);
      }
      const url = method === "GET" ? `${FEEDBACK_ENDPOINT}?t=${Date.now()}` : FEEDBACK_ENDPOINT;
      const response = await fetch(url, options);
      if (!response.ok) throw new Error("Feedback API unavailable");
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "Feedback API error");
      if (Array.isArray(data.items)) saveFeedbackItems(data.items);
      feedbackApiOnline = true;
      return data;
    } catch (error) {
      feedbackApiOnline = false;
      return null;
    }
  }
  async function refreshFeedback() {
    const data = await feedbackRequest("GET");
    return { items: data?.items || feedbackItems(), synced: Boolean(data) };
  }
  async function addFeedback(item) {
    const clean = {
      id: "FB-" + Date.now().toString(36).toUpperCase(),
      createdAt: Date.now(),
      page: window.location.pathname.split("/").pop() || "index.html",
      url: window.location.href,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      status: "open",
      ...item
    };
    const data = await feedbackRequest("POST", clean);
    if (!data) saveFeedbackItems([clean, ...feedbackItems()]);
    return { item: clean, synced: Boolean(data) };
  }
  async function updateFeedback(id, patch) {
    const data = await feedbackRequest("PATCH", { id, ...patch });
    if (data) return feedbackItems();
    return saveFeedbackItems(feedbackItems().map((item) => item.id === id ? { ...item, ...patch } : item));
  }
  async function deleteFeedback(id) {
    const data = await feedbackRequest("DELETE", { id });
    if (data) return feedbackItems();
    return saveFeedbackItems(feedbackItems().filter((item) => item.id !== id));
  }
  function downloadFeedback() {
    const data = feedbackItems();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lunde-website-feedback.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function mountFeedbackWidget() {
    if (/staff\.html$/.test(window.location.pathname)) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <button class="feedback-trigger" type="button" data-feedback-open>Website feedback</button>
      <dialog class="feedback-dialog" id="feedbackDialog" aria-labelledby="feedbackTitle">
        <form method="dialog" id="feedbackForm">
          <div class="feedback-head">
            <p class="kicker">Website feedback</p>
            <button class="drawer-close" type="button" data-feedback-close aria-label="Close feedback">&#215;</button>
          </div>
          <h2 id="feedbackTitle">Leave a change note.</h2>
          <label>
            <span>What should change?</span>
            <textarea name="message" rows="5" required placeholder="Tell us what page, section, or shopping step needs work."></textarea>
          </label>
          <label>
            <span>Your name or initials</span>
            <input name="name" autocomplete="name" placeholder="Optional">
          </label>
          <label>
            <span>Priority</span>
            <select name="priority">
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="low">Low</option>
            </select>
          </label>
          <div class="feedback-actions">
            <button class="btn solid" type="submit">Save comment</button>
            <button class="btn" type="button" data-feedback-close>Cancel</button>
          </div>
        </form>
      </dialog>
    `;
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    const dialog = document.querySelector("#feedbackDialog");
    const form = document.querySelector("#feedbackForm");
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-feedback-open]")) dialog.showModal();
      if (event.target.closest("[data-feedback-close]")) dialog.close();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const result = await addFeedback({
        message: String(formData.get("message") || "").trim(),
        name: String(formData.get("name") || "").trim(),
        priority: String(formData.get("priority") || "normal")
      });
      form.reset();
      dialog.close();
      showToast(result.synced ? "Feedback saved to server" : "Saved on this device only", "View staff console", () => { window.location.href = "./messages.html"; });
    });
  }

  /* ---------- header search ---------- */
  /* The header magnifier opens a slide-down search field that submits to the
     catalog (which reads ?q=). Works on every storefront page — the inline
     header on index.html and the chrome.js header elsewhere. */
  function mountHeaderSearch() {
    if (document.getElementById("v6SearchOverlay")) return;
    var css = document.createElement("style");
    css.textContent =
      ".v6-search-overlay{position:fixed;inset:0;z-index:140;display:none;}" +
      ".v6-search-overlay.open{display:block;}" +
      ".v6-search-scrim{position:absolute;inset:0;background:rgba(32,30,26,0.34);opacity:0;transition:opacity .22s ease;}" +
      ".v6-search-overlay.open .v6-search-scrim{opacity:1;}" +
      ".v6-search-panel{position:absolute;left:0;right:0;top:0;background:var(--paper,#f3efe7);border-bottom:1px solid var(--line,#e2dccf);box-shadow:0 24px 50px -30px rgba(32,30,26,.55);transform:translateY(-101%);transition:transform .26s cubic-bezier(.22,.61,.36,1);padding:26px clamp(20px,4vw,64px) 30px;}" +
      ".v6-search-overlay.open .v6-search-panel{transform:translateY(0);}" +
      ".v6-search-form{max-width:780px;margin:0 auto;display:flex;align-items:center;gap:16px;border-bottom:1.5px solid var(--ink,#201e1a);padding-bottom:14px;}" +
      ".v6-search-form svg{width:24px;height:24px;color:var(--muted,#8a8275);flex:none;}" +
      ".v6-search-form input{flex:1;min-width:0;border:none;background:none;outline:none;font-family:inherit;font-size:clamp(20px,3.2vw,30px);color:var(--ink,#201e1a);}" +
      ".v6-search-form input::placeholder{color:var(--muted,#a59c8c);}" +
      ".v6-search-close{flex:none;border:1px solid var(--line-2,#d8d0c0);background:none;border-radius:999px;padding:8px 15px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted,#8a8275);cursor:pointer;transition:color .15s,border-color .15s;}" +
      ".v6-search-close:hover{color:var(--ink,#201e1a);border-color:var(--ink,#201e1a);}" +
      ".v6-search-hint{max-width:780px;margin:16px auto 0;display:flex;flex-wrap:wrap;gap:9px;align-items:center;}" +
      ".v6-search-hint .lab{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted,#8a8275);margin-right:4px;}" +
      ".v6-search-hint button{font:inherit;font-size:13px;color:var(--ink,#201e1a);background:none;border:1px solid var(--line-2,#d8d0c0);border-radius:999px;padding:7px 14px;cursor:pointer;transition:background .15s,border-color .15s;}" +
      ".v6-search-hint button:hover{background:var(--panel,#fbf9f4);border-color:var(--ink,#201e1a);}";
    document.head.appendChild(css);

    var overlay = document.createElement("div");
    overlay.className = "v6-search-overlay";
    overlay.id = "v6SearchOverlay";
    overlay.innerHTML =
      '<div class="v6-search-scrim" data-search-close></div>' +
      '<div class="v6-search-panel">' +
        '<form class="v6-search-form" role="search" id="v6SearchForm">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.2-3.2"></path></svg>' +
          '<input type="search" name="q" placeholder="Search floors, colors, SKUs\u2026" aria-label="Search floors" autocomplete="off">' +
          '<button class="v6-search-close" type="button" data-search-close>Esc</button>' +
        '</form>' +
        '<div class="v6-search-hint">' +
          '<span class="lab">Popular</span>' +
          '<button type="button" data-search-term="Oak">Oak</button>' +
          '<button type="button" data-search-term="Greige">Greige</button>' +
          '<button type="button" data-search-term="Luxury Vinyl">Luxury Vinyl</button>' +
          '<button type="button" data-search-term="Waterproof">Waterproof</button>' +
          '<button type="button" data-search-term="">Browse all floors</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var input = overlay.querySelector("input");
    function open() {
      overlay.classList.add("open");
      document.body.style.overflow = "hidden";
      setTimeout(function () { input.focus(); }, 60);
    }
    function close() {
      overlay.classList.remove("open");
      document.body.style.overflow = "";
    }
    function go(q) {
      var s = String(q == null ? input.value : q).trim();
      window.location.href = "./catalog.html" + (s ? "?q=" + encodeURIComponent(s) : "");
    }

    document.addEventListener("click", function (e) {
      var trigger = e.target.closest('[aria-label="Search floors"]');
      if (trigger && trigger.tagName === "A") { e.preventDefault(); open(); return; }
      if (e.target.closest("[data-search-close]")) { close(); return; }
      var term = e.target.closest("[data-search-term]");
      if (term) { go(term.getAttribute("data-search-term")); }
    });
    overlay.querySelector("#v6SearchForm").addEventListener("submit", function (e) { e.preventDefault(); go(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay.classList.contains("open")) close();
    });
  }

  function mountModeToggle() {
    const onStaff = document.body.hasAttribute("data-staff") || /\/(dashboard|login)\.html$/.test(window.location.pathname);
    const toggle = document.createElement("nav");
    toggle.className = "mode-toggle";
    toggle.setAttribute("aria-label", "Site mode");
    toggle.innerHTML = `
      <a href="./index.html" class="${onStaff ? "" : "active"}">Customer</a>
      <a href="./dashboard.html" class="${onStaff ? "active" : ""}">Staff</a>
    `;
    document.body.appendChild(toggle);
    document.querySelector("#drawerQuotePdf")?.addEventListener("click", downloadQuotePdf);
    document.querySelector("#drawerSaveQuote")?.addEventListener("click", () => {
      if (!Object.keys(cart()).length) { showToast("Your cart is empty"); return; }
      const job = window.prompt("Name this quote (e.g. \u201CKitchen remodel\u201D, \u201C123 Oak St\u201D):", "Saved quote");
      if (job === null) return;
      const quote = saveQuoteFromCart(job);
      if (quote) showToast("Saved as quote " + quote.id, "View quotes", () => { window.location.href = "/account?tab=quotes"; });
    });
  }

  /* ---------- client demo seed (used when no server is reachable) ---------- */
  /* Mirrors server/seed.js so the console is populated in static / preview
     contexts. Only runs once, and only if there are no orders yet. */
  const DEMO_FLAG = "lunde_demo_seeded_v4";

  function seedDemoData(force) {
    const alreadySeeded = localStorage.getItem(DEMO_FLAG);
    if (!force && alreadySeeded) return false;
    // On the first v2 seed (or a forced reseed) we (re)build the demo set even
    // if a stray test order exists, so every console page has real content.
    const HOUR = 3600000, DAY = HOUR * 24, now = Date.now();
    const SQFT = 24, PSF = 2.79, SAMPLE = 2.99;
    const oid = (n) => "LU-" + new Date(now - n * DAY).toISOString().slice(2, 10).replace(/-/g, "") + "-" + (1000 + n).toString(36).toUpperCase();
    const C = [
      { id: "CUST-DEMO1", name: "Maria Delgado", company: "Delgado Interiors", email: "maria@delgadointeriors.com", phone: "(661) 555-0142", address: "2841 Mount Vernon Ave", city: "Bakersfield", state: "CA", zip: "93306" },
      { id: "CUST-DEMO2", name: "Trevor Nash", company: "", email: "trevor.nash@gmail.com", phone: "(661) 555-0188", address: "1190 Oak St", city: "Bakersfield", state: "CA", zip: "93301" },
      { id: "CUST-DEMO3", name: "Priya Raman", company: "Cascade Builders", email: "praman@cascadebuilders.co", phone: "(661) 555-0119", address: "455 Coffee Rd", city: "Bakersfield", state: "CA", zip: "93309" },
      { id: "CUST-DEMO4", name: "Sam Whitfield", company: "Whitfield Remodel", email: "sam@whitfieldremodel.com", phone: "(661) 555-0173", address: "78 Truxtun Ave", city: "Bakersfield", state: "CA", zip: "93301" },
      { id: "CUST-DEMO5", name: "Elena Brooks", company: "", email: "elena.brooks@outlook.com", phone: "(661) 555-0155", address: "3322 Ming Ave", city: "Bakersfield", state: "CA", zip: "93304" }
    ];
    const plan = [
      { c: 0, ago: 0.2, s: "placed", lines: { G001: 360, G003: 120 }, m: "delivery", w: "morning", p: "garage" },
      { c: 1, ago: 0.6, s: "placed", lines: { G002: 96 }, m: "pickup" },
      { c: 2, ago: 1.1, s: "processing", lines: { G004: 720, G005: 240, G006: 96 }, m: "delivery", w: "afternoon", p: "curb", notes: "Call before delivery \u2014 gate code 4417." },
      { c: 3, ago: 2.3, s: "shipped", lines: { G006: 480 }, m: "delivery", w: "morning", p: "garage" },
      { c: 0, ago: 4.0, s: "delivered", lines: { G001: 240, G005: 144 }, m: "delivery", w: "afternoon", p: "curb" },
      { c: 4, ago: 0.05, s: "placed", lines: { G003: 48 }, samples: true, m: "pickup" },
      { c: 2, ago: 6.5, s: "delivered", lines: { G004: 600 }, m: "delivery", w: "morning", p: "garage" },
      { c: 1, ago: 3.2, s: "cancelled", lines: { G002: 72 }, m: "pickup" }
    ];
    const flow = ["placed", "processing", "shipped", "delivered"];
    const round = (n) => Math.round(n * 100) / 100;
    const demoOrders = plan.map((pl, i) => {
      const createdAt = Math.round(now - pl.ago * DAY);
      const cust = C[pl.c];
      const items = {};
      Object.entries(pl.lines).forEach(([sku, sq]) => { if (productById(sku)) items[sku] = { sqft: sq, samples: 0 }; });
      if (pl.samples) { const k = Object.keys(items)[0]; if (k) items[k].samples = 3; }
      const totals = cartTotals(items, pl.m, pl.p || "", "");
      let history;
      if (pl.s === "cancelled") history = [{ status: "placed", at: createdAt }, { status: "cancelled", at: createdAt + 2 * HOUR }];
      else history = flow.slice(0, flow.indexOf(pl.s) + 1).map((s, k) => ({ status: s, at: createdAt + k * 6 * HOUR }));
      return {
        id: oid(i), createdAt, status: pl.s, history, items,
        totals,
        checkout: { mode: "account", customerId: cust.id, promoCode: "" },
        delivery: {
          method: pl.m,
          address: pl.m === "pickup" ? "Lunde warehouse, Bakersfield, CA" : `${cust.address}, ${cust.city}, ${cust.state} ${cust.zip}`,
          window: pl.m === "pickup" ? "" : (pl.w || ""), placement: pl.m === "pickup" ? "" : (pl.p || ""), notes: pl.notes || ""
        },
        customer: { name: cust.name, company: cust.company, project: "", email: cust.email, phone: cust.phone },
        payment: (function () {
          var TERMS = ["Net 30", "Due on receipt", "Net 45", "Net 30", "Due on receipt"];
          var brands = ["Visa", "Mastercard", "American Express", "Visa", "Discover"];
          var isInvoice = /net\s*\d+/i.test(TERMS[pl.c] || "");
          var paid = pl.s !== "cancelled" && (!isInvoice || pl.s === "delivered");
          return {
            method: isInvoice ? "invoice" : "card",
            terms: isInvoice ? TERMS[pl.c] : "",
            brand: brands[pl.c % brands.length], last4: String(4000 + i).slice(-4),
            name: cust.name, exp: "0" + ((i % 9) + 1) + "/27",
            paidAt: paid ? createdAt + 90000 : null,
            refundedAt: pl.s === "cancelled" ? createdAt + 2 * HOUR : null,
            txnId: "ch_" + Math.abs(createdAt + i * 7919).toString(36).slice(-14),
            billing: cust.address + ", " + cust.city + ", " + cust.state + " " + cust.zip
          };
        })(),
        staffNotes: i === 0 ? [{ at: createdAt + HOUR, author: "Avery Stone", text: "Customer asked about delivery ETA \u2014 quoted 2 business days." }] : []
      };
    });
    writeJson(ORDERS_KEY, demoOrders);
    if (force || !quotes().length) {
      const qid = (n) => "LQ-" + new Date(now - n * DAY).toISOString().slice(2, 10).replace(/-/g, "") + "-" + (2000 + n).toString(36).toUpperCase();
      const cust = (k) => ({ name: C[k].name, company: C[k].company, email: C[k].email, phone: C[k].phone });
      const demoQuotes = [
        { id: qid(1), createdAt: now - 1.5 * DAY, updatedAt: now - 1.2 * DAY, status: "saved", job: "Master bath \u2014 123 Oak St", notes: "Waiting on tile selection before they finalize.", customerId: C[0].id, customer: cust(0), items: { G003: { sqft: 120, samples: 0 }, G005: { sqft: 48, samples: 2 } } },
        { id: qid(3), createdAt: now - 3 * DAY, updatedAt: now - 2.6 * DAY, status: "saved", job: "Kitchen remodel", notes: "", customerId: C[2].id, customer: cust(2), items: { G004: { sqft: 360, samples: 0 }, G006: { sqft: 96, samples: 0 } } },
        { id: qid(8), createdAt: now - 8 * DAY, updatedAt: now - 7 * DAY, status: "won", job: "Guest suite flooring", notes: "Converted to order after sample approval.", customerId: C[3].id, customer: cust(3), items: { Y8001: { sqft: 240, samples: 0 } } }
      ].filter((q) => Object.keys(q.items).every((id) => productById(id)));
      writeJson(QUOTES_KEY, demoQuotes);
    }
    const custProfiles = [
      { paymentTerms: "Net 30", creditLimit: 15000, availableCredit: 11200, preferredContact: "Email", marketingEmails: true, taxExempt: false, summaryNotes: "Designer account — specs by collection, invoices to AP." },
      { paymentTerms: "Due on receipt", creditLimit: 5000, preferredContact: "Phone", marketingEmails: false, taxExempt: false, summaryNotes: "Homeowner. Confirm delivery window by text." },
      { paymentTerms: "Net 45", creditLimit: 25000, availableCredit: 18750, preferredContact: "Email", marketingEmails: true, taxExempt: true, summaryNotes: "GC — tax exempt, resale cert on file." },
      { paymentTerms: "Net 30", creditLimit: 10000, availableCredit: 6250, preferredContact: "Email", marketingEmails: true, taxExempt: false, summaryNotes: "Prefers email updates and evening deliveries." },
      { paymentTerms: "Due on receipt", creditLimit: 5000, preferredContact: "Email", marketingEmails: false, taxExempt: false, summaryNotes: "" }
    ];
    const custNotes = {
      "CUST-DEMO4": [{ id: "CN-SEED4", at: now - 26 * DAY, author: "Avery Stone", text: "Great customer. Working on kitchen + downstairs flooring for full renovation. Prefers deliveries after 4pm. Very responsive via email." }],
      "CUST-DEMO1": [{ id: "CN-SEED1", at: now - 12 * DAY, author: "Avery Stone", text: "Trade account — always orders by full pallet. Send new collection drops." }]
    };
    writeJson(CUSTOMERS_KEY, C.map((c, i) => ({ ...c, createdAt: now - (40 - i * 5) * DAY, profile: custProfiles[i] || custProfiles[0], billing: { line1: c.address, city: c.city, state: c.state, zip: c.zip, country: "United States" }, shipping: { line1: c.address, city: c.city, state: c.state, zip: c.zip, country: "United States" }, notes: custNotes[c.id] || [] })));
    const invLevels = { G001: 120, G002: 18, G003: 64, G004: 0, G005: 240, G006: 8, Y8001: 96, Y8002: 180, E012: 52, L241: 300 };
    const inv = inventory();
    Object.entries(invLevels).forEach(([k, v]) => { inv[k] = v; });
    writeJson(INVENTORY_KEY, inv);
    // Seed website feedback into the local cache so Messages / Feedback have
    // content even with no server reachable.
    const demoFeedback = [
      { id: "FB-DEMO1", createdAt: now - 0.3 * DAY, page: "product.html", url: "./product.html?slug=g00-g001-g001", viewport: "1440x900", status: "open", priority: "high", name: "QA", message: "On the product page the carton price overlaps the sqft price on mobile widths around 380px." },
      { id: "FB-DEMO2", createdAt: now - 1.4 * DAY, page: "index.html", url: "./index.html", viewport: "1280x800", status: "open", priority: "normal", name: "Dana", message: "Hero filter chips could use a clear-all button when several collections are selected." },
      { id: "FB-DEMO3", createdAt: now - 3.1 * DAY, page: "checkout.html", url: "./checkout.html", viewport: "390x844", status: "resolved", priority: "low", name: "", message: "Promo code field should auto-uppercase as you type." }
    ];
    if (force || !feedbackItems().length) saveFeedbackItems(demoFeedback);
    localStorage.setItem(DEMO_FLAG, String(now));
    return true;
  }

  window.lunde = {
    money: (v) => money.format(v),
    products, productById,
    thumb: (url) => (url && /\.webp$/i.test(url) && !/\.(thumb|md)\.webp$/i.test(url) ? url.replace(/\.webp$/i, ".thumb.webp") : url),
    img: (url) => (url && /\.webp$/i.test(url) && !/\.(thumb|md)\.webp$/i.test(url) ? url.replace(/\.webp$/i, ".md.webp") : url),
    cart, updateEntry, clearCart, cartTotals, cartCount,
    customers, currentCustomer, customerDetails, createCustomerAccount, signInCustomer, signOutCustomer, updateCurrentCustomer, validatePromo, PROMO_CODES,
    customerById, customerProfile, customerOrders, updateCustomerProfile, addCustomerNote,
    customerAddresses, addCustomerAddress, updateCustomerAddress, deleteCustomerAddress, setDefaultAddress, formatAddress, ADDRESS_LABELS,
    myAddresses, addMyAddress, updateMyAddress, deleteMyAddress, setMyDefaultAddress,
    cartonsFor, sqftForCartons, materialEstimate, sqftPerCarton, cartonPrice,
    updateProduct, productOverrides,
    teamNotes, addTeamNote, pullNotes,
    orders, orderById, saveOrder, updateOrder, newOrderId, coerceStaffNotes,
    quotes, quoteById, saveQuoteFromCart, updateQuote, duplicateQuote, deleteQuote, quoteToCart, pullQuotes, reorderToCart,
    sendQuoteToCustomer, replyToFeedback, resendOrderReceipt,
    signInCustomerRemote, hydrateCustomerSession, accountOrders, saveAccountProfile,
    resendVerificationEmail, verifyCustomerEmail, requestPasswordReset, resetCustomerPassword, updateCustomerPassword,
    STATUSES, STATUS_LABELS, FREIGHT_FLAT, TAX_RATE, parseDims,
    siteSettings, pullSettings, updateSettings,
    favorites, isFavorite, toggleFavorite,
    recentlyViewed, trackRecentlyViewed, clearRecentlyViewed,
    inventory, setStock, decrementStock, stockInfo,
    feedbackItems, refreshFeedback, feedbackServerOnline, addFeedback, updateFeedback, deleteFeedback, downloadFeedback,
    apiIsOnline, syncFromServer, pullOrders, pullInventory, pullCustomers, pullProducts, staffLogin, staffMe, staffLogout, staffRequestPasswordReset, staffResetPassword, seedDemoData,
    adminUsersList, adminUserCreate, adminUserUpdate, adminUserDelete,
    showToast, downloadQuotePdf,
    openDrawer, closeDrawer, renderDrawer, renderHeaderCount
  };

  mountDrawer();
  wireDrawer();
  mountFeedbackWidget();
  mountHeaderSearch();
  mountModeToggle();
  renderHeaderCount();
  hydrateCustomerSession();
  pullSettings().catch(() => {}); // keep cached pricing/settings fresh on every page
  staffAutoSync(); // console pages: pull fresh data on load + tab focus
})();
