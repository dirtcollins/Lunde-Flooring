/* Lunde V6 — checkout */
(function () {
  var L = window.lunde;
  var cart = L.cart, cartTotals = L.cartTotals, productById = L.productById, cartonsFor = L.cartonsFor,
      materialEstimate = L.materialEstimate, sqftPerCarton = L.sqftPerCarton, cartonPrice = L.cartonPrice, money = L.money;
  var page = document.getElementById("coPage");
  var form = document.getElementById("coForm");

  if (!Object.keys(cart()).length) {
    page.innerHTML = '<div class="v6-empty"><p class="eyebrow">Checkout</p><h1 class="display">Your cart is empty.</h1>' +
      '<p>Add cartons or samples from any floor, then come back to check out.</p>' +
      '<a class="btn lg" href="./catalog.html">Browse the floors</a></div>';
    return;
  }

  var appliedPromo = "";
  var deliveryGeo = null; // {lat,lng} of the selected delivery address, for distance pricing
  var PROFILE_KEY = "lunde_profile_v1";
  var CHECKOUT_PENDING_KEY = "lunde_pending_checkout_v1";
  function profile() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; } catch (e) { return {}; } }

  function delivery() { return form.querySelector("input[name='delivery']:checked").value; }
  function placement() { var el = form.querySelector("input[name='deliveryPlacement']:checked"); return el ? el.value : "curb"; }

  function renderLines() {
    var items = cart(), html = "";
    Object.keys(items).forEach(function (id) {
      var p = productById(id); if (!p) return;
      var e = items[id];
      if (e.sqft > 0) {
        var cartons = cartonsFor(p, e.sqft);
        html += '<div class="v6-line"><span class="v6-line-img" style="background-image:url(\'' + window.lunde.thumb(p.mainImage) + '\')"></span>' +
          '<div class="v6-line-info"><strong>' + p.title + '</strong><span>' + cartons + ' cartons · ' + money(cartonPrice(p)) + '/carton</span></div>' +
          '<span class="v6-line-price">' + money(materialEstimate(p, e.sqft)) + '</span></div>';
      }
      if ((e.samples || 0) > 0) {
        html += '<div class="v6-line"><span class="v6-line-img" style="background-image:url(\'' + window.lunde.thumb(p.mainImage) + '\')"></span>' +
          '<div class="v6-line-info"><strong>' + p.title + ' — sample</strong><span>' + e.samples + ' × ' + money(p.samplePrice) + '</span></div>' +
          '<span class="v6-line-price">' + money(e.samples * p.samplePrice) + '</span></div>';
      }
    });
    document.getElementById("coLines").innerHTML = html;
  }

  function renderTotals() {
    var isPickup = delivery() === "pickup";
    var t = cartTotals(cart(), delivery(), placement(), appliedPromo, isPickup ? null : deliveryGeo);
    document.getElementById("sumMaterial").textContent = money(t.material);
    document.getElementById("sumSamples").textContent = money(t.samples);
    var dRow = document.getElementById("sumDiscountRow");
    dRow.hidden = !t.discount;
    document.getElementById("sumDiscountLabel").textContent = t.promo ? "Discount (" + t.promo.label + ")" : "Discount";
    document.getElementById("sumDiscount").textContent = "−" + money(t.discount);

    var note = document.getElementById("sumDeliveryNote");
    var freightLabel = document.getElementById("sumFreightLabel");
    var freightVal = document.getElementById("sumFreight");
    var button = document.getElementById("placeOrder");
    note.hidden = true; note.dataset.state = "";
    button.disabled = false;

    if (isPickup) {
      freightLabel.textContent = "Warehouse pickup";
      freightVal.textContent = "Free";
    } else if (t.outOfArea) {
      // Beyond the delivery zone — block delivery, steer to pickup/contact.
      freightLabel.textContent = "Delivery";
      freightVal.textContent = "Unavailable";
      note.hidden = false; note.dataset.state = "error";
      note.textContent = "This address is ~" + Math.round(t.deliveryMiles) + " mi out — outside our 100-mile delivery area. Choose warehouse pickup, or contact us for a freight quote.";
      button.disabled = true;
    } else if (!t.deliveryLocated) {
      // No coordinates yet (address not selected from suggestions).
      freightLabel.textContent = t.garagePlacement ? "Delivery + garage (est.)" : "Delivery (estimated)";
      freightVal.textContent = t.freight ? money(t.freight) : "Free";
      note.hidden = false;
      note.textContent = "Pick your address from the suggestions to calculate exact delivery. Shown as an estimate for now.";
    } else {
      var miles = Math.max(1, Math.round(t.deliveryMiles));
      freightLabel.textContent = (t.garagePlacement ? "Delivery + garage" : "Delivery") + " (" + miles + " mi)";
      freightVal.textContent = t.freight ? money(t.freight) : "Free";
    }
    document.getElementById("sumTax").textContent = money(t.tax);
    document.getElementById("sumTotal").textContent = money(t.total);
  }

  function toggleAddress() {
    var pickup = delivery() === "pickup";
    document.getElementById("addrFields").style.display = pickup ? "none" : "grid";
    document.getElementById("deliveryDetails").style.display = pickup ? "none" : "grid";
    form.querySelectorAll("#addrFields input").forEach(function (i) { i.required = !pickup && (i.name === "address" || i.name === "city" || i.name === "state" || i.name === "zip"); });
  }

  function applyPromo() {
    var entered = document.getElementById("promoCode").value.trim().toUpperCase();
    var msg = document.getElementById("promoMessage");
    if (!entered) { appliedPromo = ""; msg.textContent = ""; renderTotals(); return; }
    var promo = L.validatePromo && L.validatePromo(entered);
    if (!promo) { appliedPromo = ""; msg.textContent = "Promo code was not found."; msg.dataset.state = "error"; renderTotals(); return; }
    appliedPromo = promo.code;
    document.getElementById("promoCode").value = promo.code;
    msg.textContent = promo.type === "percent" ? Math.round(promo.value * 100) + "% discount applied." : money(promo.value) + " discount applied.";
    msg.dataset.state = "ok";
    renderTotals();
  }

  function prefill() {
    var saved = profile();
    var cust = L.currentCustomer && L.currentCustomer();
    if (cust && L.customerDetails) { var d = L.customerDetails(cust); for (var k in d) if (d[k] && !saved[k]) saved[k] = d[k]; }
    Object.keys(saved).forEach(function (k) { if (form.elements[k] && !form.elements[k].value) form.elements[k].value = saved[k]; });
    if (cust) {
      var note = document.getElementById("coAcct");
      note.innerHTML = '<span>Signed in as <b>' + cust.email + '</b> — your details are saved.</span><a href="/account">My account</a>';
    }
  }

  function cacheLocalOrder(order) {
    try {
      var key = "lunde_orders_v1";
      var orders = JSON.parse(localStorage.getItem(key) || "[]");
      orders = orders.filter(function (row) { return row && row.id !== order.id; });
      orders.unshift(order);
      localStorage.setItem(key, JSON.stringify(orders));
    } catch (err) {}
  }

  async function createStripeCheckout(order) {
    var response = await fetch("./api/stripe/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ order: order })
    });
    var data = await response.json().catch(function () { return null; });
    if (!response.ok || !data || !data.ok || !data.url) {
      throw new Error((data && data.error) || "Stripe checkout is not available right now.");
    }
    return data;
  }

  form.addEventListener("change", function (e) {
    if (e.target.name === "delivery") { toggleAddress(); renderTotals(); }
    if (e.target.name === "deliveryPlacement") renderTotals();
  });
  document.getElementById("applyPromo").addEventListener("click", applyPromo);
  document.getElementById("promoCode").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); applyPromo(); } });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!form.reportValidity()) return;
    var button = document.getElementById("placeOrder");
    var promoMessage = document.getElementById("promoMessage");
    button.disabled = true;
    button.textContent = "Opening secure checkout...";
    promoMessage.textContent = "";
    promoMessage.dataset.state = "";
    var data = new FormData(form);
    var method = delivery();
    var orderItems = cart();
    var geo = method === "pickup" ? null : deliveryGeo;
    var totals = cartTotals(orderItems, method, String(data.get("deliveryPlacement") || ""), appliedPromo, geo);
    if (method !== "pickup" && totals.outOfArea) {
      promoMessage.textContent = "That address is outside our 100-mile delivery area. Choose warehouse pickup or contact us for a freight quote.";
      promoMessage.dataset.state = "error";
      button.disabled = false;
      button.textContent = "Continue to secure payment";
      return;
    }
    var cust = L.currentCustomer && L.currentCustomer();
    var order = {
      id: L.newOrderId(),
      createdAt: Date.now(),
      status: "placed",
      history: [{ status: "placed", at: Date.now() }],
      items: orderItems,
      totals: totals,
      checkout: { mode: cust ? "account" : "guest", customerId: cust ? cust.id : "", promoCode: appliedPromo || "" },
      delivery: {
        method: method,
        address: method === "pickup" ? "Lunde warehouse, Bakersfield, CA" : (data.get("address") + ", " + data.get("city") + ", " + data.get("state") + " " + data.get("zip")),
        window: method === "pickup" ? "" : String(data.get("deliveryWindow") || ""),
        placement: method === "pickup" ? "" : String(data.get("deliveryPlacement") || ""),
        notes: String(data.get("deliveryNotes") || "").trim(),
        lat: geo ? geo.lat : null,
        lng: geo ? geo.lng : null
      },
      customer: {
        name: String(data.get("name") || "").trim(), company: String(data.get("company") || "").trim(),
        project: String(data.get("project") || "").trim(), email: String(data.get("email") || "").trim(),
        phone: String(data.get("phone") || "").trim()
      },
      payment: { method: "stripe", status: "awaiting_payment", last4: "", name: "" }
    };
    try {
      var checkout = await createStripeCheckout(order);
      var serverOrder = checkout.order || order;
      cacheLocalOrder(serverOrder);
      var saved = profile();
      ["name", "company", "email", "phone", "address", "city", "state", "zip"].forEach(function (k) {
        var v = String(data.get(k) || "").trim(); if (v) saved[k] = v;
      });
      localStorage.setItem(PROFILE_KEY, JSON.stringify(saved));
      try {
        localStorage.setItem(CHECKOUT_PENDING_KEY, JSON.stringify({ orderId: serverOrder.id, sessionId: checkout.sessionId || "", at: Date.now() }));
      } catch (err) {}
      location.href = checkout.url;
    } catch (err) {
      promoMessage.textContent = err.message || "Stripe checkout is not available right now.";
      promoMessage.dataset.state = "error";
      button.disabled = false;
      button.textContent = "Continue to secure payment";
    }
  });

  /* address autocomplete on the delivery street field (fills city/state/zip too) */
  if (window.lundeAddressAutocomplete && form.elements.address) {
    window.lundeAddressAutocomplete(form.elements.address, { onSelect: function (parts) {
      form.elements.address.value = parts.line1;
      if (parts.city) form.elements.city.value = parts.city;
      if (parts.state) form.elements.state.value = parts.state;
      if (parts.zip) form.elements.zip.value = parts.zip;
      deliveryGeo = (parts.lat != null && parts.lon != null) ? { lat: parts.lat, lng: parts.lon } : null;
      renderTotals();
    } });
  }
  // Editing any address field by hand invalidates the geocoded point — fall back
  // to an estimate until they re-pick from suggestions.
  ["address", "city", "state", "zip"].forEach(function (name) {
    var el = form.elements[name];
    if (el) el.addEventListener("input", function () { deliveryGeo = null; renderTotals(); });
  });

  toggleAddress();
  prefill();
  renderLines();
  renderTotals();
  /* the customer session hydrates asynchronously from the server — refresh
     prefilled details and the signed-in note once it resolves */
  window.addEventListener("lunde:customer", prefill);
})();
