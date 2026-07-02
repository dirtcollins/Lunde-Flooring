/* Lunde V6 — dedicated post-payment order confirmation ("thank you") page.
   my-order.html remains the ongoing order-tracking page; this page is the
   branded confirmation shown immediately after a successful Stripe checkout.
   Payment is confirmed server-side by the Stripe webhook — this page only reads
   the locally cached order and links onward to tracking.
   Renders into two containers: #ocHero (overlay on the photo band) and
   #ocPage (order summary + next steps + actions). */
(function () {
  var L = window.lunde;
  var money = L.money, productById = L.productById, cartonsFor = L.cartonsFor,
      materialEstimate = L.materialEstimate, thumb = L.thumb;
  var hero = document.getElementById("ocHero");
  var page = document.getElementById("ocPage");
  var params = new URLSearchParams(location.search);
  var id = params.get("id");
  var CHECKOUT_PENDING_KEY = "lunde_pending_checkout_v1";
  var WINDOW = { morning: "Morning (8am–12pm)", afternoon: "Afternoon (12pm–5pm)" };
  var PLACEMENT = { garage: "Garage placement (+$3/carton)", curb: "Left at curb" };

  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function fmtDate(ts) { return ts ? new Date(ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : ""; }

  /* Clear the cart ONLY after a confirmed Stripe payment. Mirrors the guard in
     my-order.js / account.js: requires stripe=success + session_id and a pending
     marker that matches this order, so a direct visit never wipes the cart. */
  (function clearCartAfterStripeSuccess() {
    if (params.get("stripe") !== "success" || !params.get("session_id")) return;
    try {
      var pending = JSON.parse(localStorage.getItem(CHECKOUT_PENDING_KEY) || "{}");
      if (pending && pending.orderId === id && L.clearCart) {
        L.clearCart();
        localStorage.removeItem(CHECKOUT_PENDING_KEY);
      }
    } catch (err) { /* non-fatal */ }
  })();

  var order = id && L.orderById ? L.orderById(id) : null;
  var signedIn = L.currentCustomer && L.currentCustomer();
  var statusHref = signedIn ? "/account" : (id ? "/my-order.html?id=" + encodeURIComponent(id) : "/account");

  var check = '<svg class="oc-check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"></circle><path d="M15 27l7 7 15-16"></path></svg>';
  var actions =
    '<div class="oc-actions">' +
      '<a class="btn lg" href="' + statusHref + '">View order status</a>' +
      '<a class="btn ghost lg" href="./catalog.html">Continue shopping</a>' +
    '</div>';

  /* Graceful fallback if this browser has no cached copy of the order. */
  if (!order) {
    hero.innerHTML = check +
      '<p class="eyebrow">Order confirmed</p>' +
      '<h1>Thank you.</h1>' +
      '<p class="oc-sub">Your payment went through and your order is confirmed' +
        (id ? ' — reference <b>' + esc(id) + '</b>' : '') +
        '. A receipt is on its way to your email.</p>';
    page.innerHTML =
      '<div class="oc-note">We’ll personally review your order and email you to arrange <b>local delivery across Bakersfield &amp; Kern County</b>. Questions in the meantime? Email <a href="mailto:orders@lundeflooring.com">orders@lundeflooring.com</a>.</div>' +
      actions;
    return;
  }

  var first = String((order.customer && order.customer.name || "").split(" ")[0] || "").replace(/[<>&"]/g, "");
  var d = order.delivery || {}, c = order.customer || {}, t = order.totals || {};
  var pickup = d.method === "pickup";

  var lines = "";
  Object.keys(order.items || {}).forEach(function (pid) {
    var p = productById(pid); if (!p) return; var e = order.items[pid];
    if (e.sqft > 0) {
      lines += '<div class="v6-line"><span class="v6-line-img" style="background-image:url(\'' + thumb(p.mainImage) + '\')"></span>' +
        '<div class="v6-line-info"><strong>' + esc(p.title) + '</strong><span>' + cartonsFor(p, e.sqft) + ' cartons · ' + e.sqft + ' sq. ft.</span></div>' +
        '<span class="v6-line-price">' + money(materialEstimate(p, e.sqft)) + '</span></div>';
    }
    if ((e.samples || 0) > 0) {
      lines += '<div class="v6-line"><span class="v6-line-img" style="background-image:url(\'' + thumb(p.mainImage) + '\')"></span>' +
        '<div class="v6-line-info"><strong>' + esc(p.title) + ' — sample</strong><span>' + e.samples + ' × ' + money(p.samplePrice) + '</span></div>' +
        '<span class="v6-line-price">' + money(e.samples * p.samplePrice) + '</span></div>';
    }
  });

  var totals =
    '<div class="v6-sumrow"><span>Material</span><b>' + money(t.material || 0) + '</b></div>' +
    '<div class="v6-sumrow"><span>Samples</span><b>' + money(t.samples || 0) + '</b></div>' +
    (t.discount ? '<div class="v6-sumrow"><span>Discount</span><b>−' + money(t.discount) + '</b></div>' : "") +
    '<div class="v6-sumrow"><span>' + (pickup ? "Pickup" : "Freight") + '</span><b>' + (t.freight ? money(t.freight) : "Free") + '</b></div>' +
    '<div class="v6-sumrow"><span>Estimated tax</span><b>' + money(t.tax || 0) + '</b></div>' +
    '<div class="v6-sumtotal"><span>Total</span><b>' + money(t.total || 0) + '</b></div>';

  var deliveryHtml = pickup
    ? '<b>Warehouse pickup</b><br>Lunde warehouse, Bakersfield, CA'
    : '<b>Curbside delivery</b><br>' + esc(d.address || "") +
      (d.window ? '<br>Window: ' + (WINDOW[d.window] || d.window) : "") +
      (d.placement && d.placement !== "curb" ? '<br>' + (PLACEMENT[d.placement] || d.placement) : "") +
      (d.notes ? '<br>Notes: ' + esc(d.notes) : "");

  var contactHtml = '<b>' + esc(c.name || "Guest") + '</b>' +
    (c.company ? '<br>' + esc(c.company) : "") +
    (c.email ? '<br>' + esc(c.email) : "") +
    (c.phone ? '<br>' + esc(c.phone) : "") +
    (c.project ? '<br>Project: ' + esc(c.project) : "");

  var steps =
    '<div class="oc-steps"><h2>What happens next</h2>' +
      '<div class="oc-step"><b>1</b><p><strong>We review your order</strong>We confirm your floors are in stock and get everything staged.</p></div>' +
      '<div class="oc-step"><b>2</b><p><strong>We reach out about ' + (pickup ? "pickup" : "local delivery") + '</strong>We’ll email you' + (c.phone ? " or give you a call" : "") + ' to arrange ' + (pickup ? "a pickup time at our Bakersfield warehouse" : "a delivery time across Bakersfield &amp; Kern County") + '.</p></div>' +
      '<div class="oc-step"><b>3</b><p><strong>Your floor arrives</strong>We keep you posted the whole way — track your order status anytime.</p></div>' +
    '</div>';

  var note = '<div class="oc-note">Thanks for choosing Lunde — your local Bakersfield &amp; Kern County flooring supplier. A receipt is on its way to <b>' +
    (c.email ? esc(c.email) : "your email") + '</b>. We personally review every order and will contact you to arrange ' +
    (pickup ? "your warehouse pickup" : "local delivery") + '. Questions? Email <a href="mailto:orders@lundeflooring.com">orders@lundeflooring.com</a>.</div>';

  hero.innerHTML = check +
    '<p class="eyebrow">Order confirmed</p>' +
    '<h1>Thank you' + (first ? ", " + esc(first) : "") + '.</h1>' +
    '<p class="oc-sub">Your order <b>' + esc(order.id) + '</b> is confirmed and your payment went through.' +
      (order.createdAt ? ' Placed ' + fmtDate(order.createdAt) + '.' : '') + '</p>';

  page.innerHTML =
    note +
    '<div class="oc-card">' +
      '<div class="oc-card-head"><h2>Order ' + esc(order.id) + '</h2><span>' + fmtDate(order.createdAt) + '</span></div>' +
      '<div class="oc-card-body">' +
        lines +
        '<div class="v6-sum" style="position:static;border:0;padding:18px 0 0;margin-top:6px;background:transparent">' + totals + '</div>' +
        '<div class="oc-grid">' +
          '<div class="oc-block"><h3>Delivery</h3><p>' + deliveryHtml + '</p></div>' +
          '<div class="oc-block"><h3>Contact</h3><p>' + contactHtml + '</p></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    steps +
    actions;
})();
