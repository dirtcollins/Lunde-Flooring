/* Lunde V6 — order detail / tracking (v2) */
(function () {
  var L = window.lunde;
  var orderById = L.orderById, productById = L.productById, cartonsFor = L.cartonsFor,
      materialEstimate = L.materialEstimate, cartonPrice = L.cartonPrice, money = L.money,
      STATUSES = L.STATUSES, STATUS_LABELS = L.STATUS_LABELS;
  var page = document.getElementById("moPage");
  var params = new URLSearchParams(location.search);
  var id = params.get("id");
  var order = id ? orderById(id) : null;
  var CHECKOUT_PENDING_KEY = "lunde_pending_checkout_v1";

  function clearCartAfterStripeSuccess(orderId) {
    if (params.get("stripe") !== "success" || !params.get("session_id")) return;
    try {
      var pending = JSON.parse(localStorage.getItem(CHECKOUT_PENDING_KEY) || "{}");
      if (pending && pending.orderId === orderId) {
        L.clearCart();
        localStorage.removeItem(CHECKOUT_PENDING_KEY);
      }
    } catch (err) {}
  }

  var NOTIFY = { placed: "Order confirmed — we emailed your receipt.", processing: "Your cartons are being pulled and staged.", shipped: "On the truck — tracking emailed to you.", delivered: "Delivered. Enjoy your new floor!", cancelled: "This order was cancelled." };
  var WINDOW = { morning: "Morning (8am–12pm)", afternoon: "Afternoon (12pm–5pm)" };
  var PLACEMENT = { garage: "Garage placement (+$3/carton)", curb: "Left at curb" };

  function ic(p) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>'; }
  function fmtDate(ts) { return new Date(ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); }
  function fmtShort(ts) { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  function ago(ts) { var s = (Date.now() - ts) / 1000; if (s < 60) return "just now"; if (s < 3600) return Math.round(s / 60) + "m ago"; if (s < 86400) return Math.round(s / 3600) + "h ago"; return Math.round(s / 86400) + "d ago"; }
  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  if (!order) {
    page.innerHTML = '<div class="v6-empty"><p class="eyebrow">Order</p><h1 class="display">Order not found.</h1><p>We couldn’t find that order. Check your account for your order history.</p><a class="btn lg" href="/account?tab=orders">My orders</a></div>';
    return;
  }
  clearCartAfterStripeSuccess(order.id);

  var lines = "";
  Object.keys(order.items).forEach(function (pid) {
    var p = productById(pid); if (!p) return; var e = order.items[pid];
    if (e.sqft > 0) {
      var cartons = cartonsFor(p, e.sqft);
      lines += '<div class="v6-line"><a class="v6-line-img" href="./product.html?slug=' + p.slug + '" style="background-image:url(\'' + L.thumb(p.mainImage) + '\')" aria-label="' + esc(p.title) + '"></a>' +
        '<div class="v6-line-info"><strong>' + esc(p.title) + '</strong><span>' + cartons + ' cartons · ' + money(cartonPrice(p)) + '/carton · covers ' + e.sqft + ' sq. ft.</span></div>' +
        '<span class="v6-line-price">' + money(materialEstimate(p, e.sqft)) + '</span></div>';
    }
    if ((e.samples || 0) > 0) {
      // Free sample-box orders carry $0 sample totals; paid orders show the real price.
      var sampleFree = !((order.totals || {}).samples > 0);
      lines += '<div class="v6-line"><a class="v6-line-img" href="./product.html?slug=' + p.slug + '" style="background-image:url(\'' + L.thumb(p.mainImage) + '\')" aria-label="' + esc(p.title) + '"></a>' +
        '<div class="v6-line-info"><strong>' + esc(p.title) + ' — sample</strong><span>' + e.samples + ' × ' + (sampleFree ? "Free" : money(p.samplePrice)) + '</span></div>' +
        '<span class="v6-line-price">' + (sampleFree ? "Free" : money(e.samples * p.samplePrice)) + '</span></div>';
    }
  });

  var t = order.totals;
  var activeIdx = STATUSES.indexOf(order.status);
  var cancelled = order.status === "cancelled";
  var historyAt = {};
  (order.history || []).forEach(function (h) { if (!historyAt[h.status]) historyAt[h.status] = h.at; });
  var stepper = cancelled ? '' : '<div class="mo-stepper">' + STATUSES.map(function (s, i) {
    var done = i <= activeIdx;
    return '<div class="mo-step' + (done ? " done" : "") + (i === activeIdx ? " now" : "") + '">' + STATUS_LABELS[s] +
      (done && historyAt[s] ? '<small>' + fmtShort(historyAt[s]) + '</small>' : '<small>&nbsp;</small>') + '</div>';
  }).join("") + '</div>';

  var nextStatus = STATUSES[activeIdx + 1];
  var banner = cancelled
    ? '<div class="mo-banner" style="border-left-color:#9a4a2e"><i style="background:#9a4a2e;animation:none"></i><div><strong>Cancelled</strong><span>' + NOTIFY.cancelled + '</span></div></div>'
    : '<div class="mo-banner"><i></i><div><strong>Right now · ' + STATUS_LABELS[order.status] + '</strong><span>' + (nextStatus ? "Next up: " + STATUS_LABELS[nextStatus] + " — we’ll email you the moment it moves." : "All done — thanks for your business.") + '</span></div></div>';

  var timeline = (order.history || []).slice().reverse().map(function (h) {
    return '<div class="mo-tl"><span><b>' + STATUS_LABELS[h.status] + '</b> · ' + (NOTIFY[h.status] || "") + '</span><span class="when">' + ago(h.at) + '</span></div>';
  }).join("");

  var d = order.delivery || {};
  var c = order.customer || {};
  var pay = order.payment || {};
  var deliveryCard = d.method === "pickup"
    ? '<p><b>Warehouse pickup</b><br>Lunde warehouse, Bakersfield, CA<br>We’ll notify you when it’s ready.</p>'
    : '<p><b>Curbside delivery</b><br>' + esc(d.address || "") + (d.window ? '<br>Window: ' + (WINDOW[d.window] || d.window) : "") + (d.placement ? '<br>' + (PLACEMENT[d.placement] || d.placement) : "") + (d.notes ? '<br>Notes: ' + esc(d.notes) : "") + '</p>';

  page.innerHTML =
    '<a class="mo-back" href="/account?tab=orders">' + ic('<path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.6"/>') + 'All orders</a>' +
    '<div class="mo-head" data-screen-label="Order ' + order.id + '"><div><p class="eyebrow">Order ' + order.id + '</p><h1 class="display">' + (cancelled ? "Order cancelled" : STATUS_LABELS[order.status]) + '.</h1><span class="acct-when">Placed ' + fmtDate(order.createdAt) + (c.name ? " · " + esc(c.name) : "") + '</span></div>' +
      '<div class="mo-head-right"><span class="status-badge" data-status="' + order.status + '"><i></i>' + STATUS_LABELS[order.status] + '</span></div></div>' +
    stepper +
    '<div class="mo-layout"><div>' +
      banner +
      '<h3 class="mo-section-h">Items</h3>' + lines +
      '<div class="v6-sum" style="position:static;margin-top:24px">' +
        '<div class="v6-sumrow"><span>Material</span><b>' + money(t.material) + '</b></div>' +
        '<div class="v6-sumrow"><span>Samples</span><b>' + money(t.samples) + '</b></div>' +
        (t.discount ? '<div class="v6-sumrow"><span>Discount</span><b>−' + money(t.discount) + '</b></div>' : "") +
        '<div class="v6-sumrow"><span>Freight</span><b>' + (t.freight ? money(t.freight) : "Free") + '</b></div>' +
        '<div class="v6-sumrow"><span>Tax</span><b>' + money(t.tax) + '</b></div>' +
        '<div class="v6-sumtotal"><span>Total' + (pay.last4 ? ' · ••••' + esc(pay.last4) : "") + '</span><b>' + money(t.total) + '</b></div>' +
        '<div class="mo-actions"><button class="btn lg" type="button" id="reorderBtn">Reorder these items</button>' +
        '<button class="btn ghost" type="button" id="printBtn">Print receipt</button></div>' +
      '</div>' +
    '</div><aside class="mo-info">' +
      '<div class="mo-info-card"><h4>' + ic('<path d="M4 8h13l3 4v4H4z"/><circle cx="8" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>') + 'Delivery</h4>' + deliveryCard + '</div>' +
      '<div class="mo-info-card"><h4>' + ic('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/>') + 'Contact</h4><p><b>' + esc(c.name || "Guest") + '</b>' + (c.company ? '<br>' + esc(c.company) : "") + (c.email ? '<br>' + esc(c.email) : "") + (c.phone ? '<br>' + esc(c.phone) : "") + (c.project ? '<br>Project: ' + esc(c.project) : "") + '</p></div>' +
      '<div class="mo-info-card"><h4>' + ic('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>') + 'Updates</h4><div class="mo-timeline">' + timeline + '</div></div>' +
      '<div class="mo-info-card"><h4>' + ic('<path d="M4 5h16v11H9l-4 4V5Z"/>') + 'Need a hand?</h4><p>Questions about this order, delivery timing, or installation? <a class="u" href="./contact.html">Contact us</a> and mention order <b>' + order.id + '</b> — we’ll take it from there.</p></div>' +
    '</aside></div>';

  document.getElementById("reorderBtn").addEventListener("click", function () {
    if (L.reorderToCart) { var n = L.reorderToCart(order.id); if (L.showToast) L.showToast(n ? "Items added to your cart" : "Those items are no longer available", n ? "View cart" : null, n ? function () { location.href = "./cart.html"; } : null); }
  });
  document.getElementById("printBtn").addEventListener("click", function () { window.print(); });
})();
