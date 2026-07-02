/* Lunde V6 — my account */
(function () {
  var L = window.lunde;
  var orders = L.orders, productById = L.productById, cartonsFor = L.cartonsFor, sqftPerCarton = L.sqftPerCarton,
      materialEstimate = L.materialEstimate, cartonPrice = L.cartonPrice, money = L.money,
      STATUSES = L.STATUSES, STATUS_LABELS = L.STATUS_LABELS, favorites = L.favorites,
      currentCustomer = L.currentCustomer, quotes = L.quotes;

  var params = new URLSearchParams(location.search);
  var placedId = params.get("placed");
  var activeTab = params.get("tab") || "orders";
  var CHECKOUT_PENDING_KEY = "lunde_pending_checkout_v1";
  if (["orders", "favorites", "quotes", "addresses", "settings"].indexOf(activeTab) < 0) activeTab = "orders";

  function ago(ts) { var s = (Date.now() - ts) / 1000; if (s < 60) return "just now"; if (s < 3600) return Math.round(s / 60) + "m ago"; if (s < 86400) return Math.round(s / 3600) + "h ago"; return Math.round(s / 86400) + "d ago"; }
  function fmtDate(ts) { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
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

  /* placed banner */
  if (placedId) {
    clearCartAfterStripeSuccess(placedId);
    var o = orders().find(function (x) { return x.id === placedId; });
    if (o) document.getElementById("placedBanner").innerHTML =
      '<div class="acct-placed"><i></i><span><strong>Order ' + o.id + ' placed.</strong> ' +
      (o.customer.email ? "A confirmation is on its way to " + esc(o.customer.email) + ". " : "") +
      (o.delivery.method === "pickup" ? "We’ll let you know when it’s ready for pickup." : "We’ll send tracking when it ships.") + '</span></div>';
  }

  /* tabs */
  function renderTabs() {
    document.querySelectorAll("[data-account-tab]").forEach(function (t) { t.setAttribute("aria-current", t.dataset.accountTab === activeTab ? "page" : "false"); });
    document.querySelectorAll("[data-account-panel]").forEach(function (p) { p.hidden = p.dataset.accountPanel !== activeTab; });
  }
  document.querySelectorAll("[data-account-tab]").forEach(function (t) {
    t.addEventListener("click", function () { activeTab = t.dataset.accountTab; var u = new URL(location.href); u.searchParams.set("tab", activeTab); history.replaceState({}, "", u); renderTabs(); });
  });

  function thumbs(items) {
    var ps = Object.keys(items || {}).map(function (id) { return productById(id); }).filter(Boolean).slice(0, 3);
    if (!ps.length) return '<span class="acct-thumbs"></span>';
    return '<span class="acct-thumbs">' + ps.map(function (p) { return '<span class="acct-thumb" style="background-image:url(\'' + window.lunde.thumb(p.mainImage) + '\')"></span>'; }).join("") + '</span>';
  }
  function itemSummary(items) {
    return Object.keys(items || {}).map(function (id) {
      var p = productById(id); if (!p) return ""; var e = items[id]; var parts = [];
      if (e.sqft > 0) parts.push(cartonsFor(p, e.sqft) + " ctn " + p.title);
      if (e.samples > 0) parts.push(e.samples + "× sample " + p.title);
      return parts.join(", ");
    }).filter(Boolean).join(" · ");
  }

  var serverOrders = null;
  function visibleOrders() {
    if (Array.isArray(serverOrders)) return serverOrders;
    var c = currentCustomer();
    if (!c) return [];
    var email = String(c.email || "").toLowerCase();
    return orders().filter(function (o) { return (o.checkout && o.checkout.customerId === c.id) || String(o.customer && o.customer.email || "").toLowerCase() === email; });
  }
  async function loadAccountOrders() {
    if (!currentCustomer() || !L.accountOrders) return;
    try { serverOrders = await L.accountOrders(); } catch (e) {}
    renderOrders();
  }
  function renderOrders() {
    var all = visibleOrders();
    document.getElementById("orderCount").textContent = all.length ? all.length + " order" + (all.length === 1 ? "" : "s") : "";
    document.getElementById("ordersTabCount").textContent = all.length ? "(" + all.length + ")" : "";
    document.getElementById("ordersList").innerHTML = all.length ? all.map(function (o) {
      var pct = o.status === "cancelled" ? 100 : Math.round(STATUSES.indexOf(o.status) / (STATUSES.length - 1) * 100);
      var delEvent = (o.history || []).find(function (h) { return h.status === "delivered"; });
      return '<a class="acct-order" href="./my-order.html?id=' + encodeURIComponent(o.id) + '" data-screen-label="Order ' + o.id + '">' +
        '<div class="acct-order-top"><div class="acct-order-lead">' + thumbs(o.items) + '<div><span class="acct-id">' + o.id + '</span><span class="acct-when">' + ago(o.createdAt) + '</span></div></div>' +
        '<span class="status-badge" data-status="' + o.status + '"><i></i>' + STATUS_LABELS[o.status] + '</span></div>' +
        '<span class="acct-items">' + itemSummary(o.items) + '</span>' +
        '<div class="acct-progress"><i style="width:' + pct + '%' + (o.status === "cancelled" ? ";background:#9a4a2e" : "") + '"></i></div>' +
        '<div class="acct-order-foot"><div class="acct-dates"><span><small>Ordered</small><b>' + fmtDate(o.createdAt) + '</b></span>' +
          (delEvent ? '<span><small>Delivered</small><b>' + fmtDate(delEvent.at) + '</b></span>' : '<span><small>Status</small><b>' + STATUS_LABELS[o.status] + '</b></span>') +
        '</div><strong class="acct-total">' + money(o.totals.total) + '</strong></div></a>';
    }).join("") : '<div class="acct-empty-state"><h3>No orders yet</h3><p>' + (currentCustomer() ? "Orders placed while signed in appear here." : "Guest orders placed in this browser appear here.") + '</p><a class="btn" href="./catalog.html">Browse floors</a></div>';
  }

  function renderFavorites() {
    var favs = favorites().map(function (id) { return productById(id); }).filter(Boolean);
    document.getElementById("favCount").textContent = favs.length ? favs.length + " saved" : "";
    document.getElementById("favoritesTabCount").textContent = favs.length ? "(" + favs.length + ")" : "";
    document.getElementById("favGrid").innerHTML = favs.length ? favs.map(function (p) {
      return '<a class="acct-fav" href="./product.html?slug=' + p.slug + '"><span class="swatch" style="background-image:url(\'' + window.lunde.img(p.mainImage) + '\')"></span><strong>' + p.title + '</strong><span>' + money(cartonPrice(p)) + ' / carton</span></a>';
    }).join("") : '<div class="acct-empty-state"><h3>Nothing saved yet</h3><p>Tap the heart on any floor to save it here.</p><a class="btn" href="./catalog.html">Browse floors</a></div>';
  }

  function visibleQuotes() {
    var c = currentCustomer(); var all = quotes ? quotes() : [];
    if (!c) return all.filter(function (q) { return !q.customerId; });
    var email = String(c.email || "").toLowerCase();
    return all.filter(function (q) { return q.customerId === c.id || String(q.customer && q.customer.email || "").toLowerCase() === email; });
  }
  function renderQuotes() {
    var all = visibleQuotes();
    document.getElementById("quoteCount").textContent = all.length ? all.length + " quote" + (all.length === 1 ? "" : "s") : "";
    document.getElementById("quotesTabCount").textContent = all.length ? "(" + all.length + ")" : "";
    document.getElementById("quotesList").innerHTML = all.length ? all.map(function (q, i) {
      var t = L.cartTotals(q.items || {});
      return '<details class="acct-quote"' + (i === 0 ? " open" : "") + '><summary><div class="acct-order-lead">' + thumbs(q.items) + '<div><span class="acct-id">' + (q.job || "Saved quote") + '</span><span class="acct-when">' + q.id + ' · ' + ago(q.updatedAt || q.createdAt) + '</span></div></div><strong class="acct-total">' + money(t.subtotal) + '</strong></summary>' +
        '<div class="acct-quote-body"><p class="acct-items" style="margin:14px 0">' + itemSummary(q.items) + '</p>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" type="button" data-quote-cart="' + q.id + '">Add to cart</button><button class="btn ghost" type="button" data-quote-del="' + q.id + '">Delete</button></div></div></details>';
    }).join("") : '<div class="acct-empty-state"><h3>No saved quotes yet</h3><p>Build a cart and save it as a quote to price a room and return later.</p><a class="btn" href="./catalog.html">Browse floors</a></div>';
  }
  document.getElementById("quotesList").addEventListener("click", function (e) {
    var c = e.target.closest("[data-quote-cart]");
    if (c && L.quoteToCart) { var n = L.quoteToCart(c.dataset.quoteCart); if (L.showToast) L.showToast(n ? "Quote added to cart" : "Items no longer available"); return; }
    var d = e.target.closest("[data-quote-del]");
    if (d && L.deleteQuote && confirm("Delete this quote?")) { L.deleteQuote(d.dataset.quoteDel); renderQuotes(); }
  });

  /* addresses */
  function renderAddresses() {
    var wrap = document.getElementById("myAddresses");
    var c = currentCustomer();
    var addBtn = document.getElementById("addAddressBtn");
    var countEl = document.getElementById("addressesTabCount");
    if (!c || !L.myAddresses) { addBtn.hidden = true; countEl.textContent = ""; wrap.innerHTML = '<div class="acct-empty-state" style="grid-column:1/-1"><h3>Sign in to manage addresses</h3><p>Saved addresses make checkout faster.</p></div>'; return; }
    addBtn.hidden = false;
    var list = L.myAddresses();
    countEl.textContent = list.length ? "(" + list.length + ")" : "";
    wrap.innerHTML = list.length ? list.map(function (a) {
      return '<div class="acct-addr' + (a.isDefault ? " is-default" : "") + '"><div class="acct-addr-top"><span class="acct-addr-label">' + esc(a.label) + '</span>' +
        (a.isDefault ? '<span class="acct-addr-default">Default</span>' : '<button class="acct-addr-setdef" type="button" data-set-default="' + a.id + '">Set default</button>') + '</div>' +
        '<p>' + esc(a.line1) + '<br>' + esc([a.city, a.state].filter(Boolean).join(", ")) + ' ' + esc(a.zip) + '</p>' +
        '<div class="acct-addr-actions"><button type="button" data-edit-addr="' + a.id + '">Edit</button>' + (a.isDefault ? "" : '<button type="button" data-del-addr="' + a.id + '">Delete</button>') + '</div></div>';
    }).join("") : '<div class="acct-empty-state" style="grid-column:1/-1"><h3>No saved addresses</h3><p>Add one for faster checkout.</p></div>';
  }
  function addrDialog(id) {
    var existing = id && L.myAddresses().find(function (a) { return a.id === id; });
    var d = document.getElementById("acctAddr");
    if (!d) { d = document.createElement("dialog"); d.id = "acctAddr"; d.className = "v6-compare-dialog"; d.style.maxWidth = "440px"; document.body.appendChild(d); d.addEventListener("click", function (e) { if (e.target === d) d.close(); }); }
    var opts = (L.ADDRESS_LABELS || ["Home", "Work", "Job site"]).map(function (l) { return '<option' + (existing && existing.label === l ? " selected" : "") + '>' + l + '</option>'; }).join("");
    d.innerHTML = '<div class="v6-compare-head"><h2>' + (existing ? "Edit address" : "Add address") + '</h2><button class="v6-compare-close" type="button" data-x>×</button></div>' +
      '<form class="v6-form" style="padding:24px 26px;gap:14px"><label class="v6-field"><span>Label</span><select name="label">' + opts + '</select></label>' +
      '<label class="v6-field"><span>Street</span><input name="line1" value="' + esc(existing ? existing.line1 : "") + '" required></label>' +
      '<div class="v6-field-row three"><label class="v6-field"><span>City</span><input name="city" value="' + esc(existing ? existing.city : "") + '"></label>' +
      '<label class="v6-field"><span>State</span><input name="state" value="' + esc(existing ? existing.state : "") + '"></label>' +
      '<label class="v6-field"><span>ZIP</span><input name="zip" value="' + esc(existing ? existing.zip : "") + '"></label></div>' +
      '<label class="v6-opt" style="margin-top:2px"><input type="checkbox" name="isDefault"' + (existing && existing.isDefault ? " checked" : "") + '><span class="v6-opt-t"><strong>Set as default</strong></span></label>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:6px"><button class="btn ghost" type="button" data-x>Cancel</button><button class="btn" type="submit">Save</button></div></form>';
    d.querySelectorAll("[data-x]").forEach(function (b) { b.addEventListener("click", function () { d.close(); }); });
    d.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault(); var fd = new FormData(e.target);
      var addr = { label: fd.get("label"), line1: fd.get("line1"), city: fd.get("city"), state: fd.get("state"), zip: fd.get("zip"), isDefault: e.target.elements.isDefault.checked };
      if (existing) L.updateMyAddress(id, addr); else L.addMyAddress(addr);
      d.close(); renderAddresses(); if (L.showToast) L.showToast(existing ? "Address updated" : "Address added");
    });
    d.showModal();
  }
  document.getElementById("addAddressBtn").addEventListener("click", function () { addrDialog(null); });
  document.getElementById("myAddresses").addEventListener("click", function (e) {
    var ed = e.target.closest("[data-edit-addr]"); if (ed) return addrDialog(ed.dataset.editAddr);
    var del = e.target.closest("[data-del-addr]"); if (del && confirm("Delete this address?")) { L.deleteMyAddress(del.dataset.delAddr); renderAddresses(); return; }
    var sd = e.target.closest("[data-set-default]"); if (sd) { L.setMyDefaultAddress(sd.dataset.setDefault); renderAddresses(); }
  });

  /* auth + profile */
  var profileForm = document.getElementById("profileForm");
  function renderAuth() {
    var c = currentCustomer();
    var block = document.getElementById("authBlock");
    if (!c) { block.innerHTML = ""; return; }
    block.innerHTML = '<div class="acct-signedin"><span>Signed in as <b>' + esc(c.email) + '</b></span><button class="btn ghost" type="button" id="signOut">Sign out</button></div>';
    document.getElementById("signOut").addEventListener("click", function () { L.signOutCustomer(); location.href = "/account/login"; });
  }
  function loadProfile() {
    var profile = {};
    if (L.customerDetails) { var d = L.customerDetails(currentCustomer()); for (var k in d) if (d[k]) profile[k] = d[k]; }
    profileForm.querySelectorAll("input").forEach(function (i) { i.value = profile[i.name] || ""; });
  }
  profileForm.addEventListener("submit", async function (e) {
    e.preventDefault(); var profile = {};
    profileForm.querySelectorAll("input").forEach(function (i) { profile[i.name] = i.value.trim(); });
    if (L.updateCurrentCustomer) L.updateCurrentCustomer({ name: profile.name, company: profile.company, phone: profile.phone });
    if (L.saveAccountProfile && currentCustomer()) {
      var r = await L.saveAccountProfile({ name: profile.name, company: profile.company, phone: profile.phone });
      if (L.showToast) L.showToast(r && r.ok ? "Details saved" : (r && r.error) || "Saved on this device");
    } else if (L.showToast) { L.showToast("Details saved"); }
  });

  var passwordForm = document.getElementById("passwordForm");
  passwordForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var status = document.getElementById("passwordStatus");
    status.textContent = ""; status.dataset.state = "";
    var currentPassword = String(passwordForm.elements.currentPassword.value || "");
    var newPassword = String(passwordForm.elements.newPassword.value || "");
    var confirmPassword = String(passwordForm.elements.confirmPassword.value || "");
    if (newPassword.length < 10) { status.textContent = "Password must be at least 10 characters."; status.dataset.state = "error"; return; }
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) { status.textContent = "Password must include uppercase, lowercase, and a number."; status.dataset.state = "error"; return; }
    if (newPassword !== confirmPassword) { status.textContent = "Passwords do not match."; status.dataset.state = "error"; return; }
    var r = await L.updateCustomerPassword(currentPassword, newPassword);
    if (r && r.ok) {
      passwordForm.reset();
      status.textContent = "Password updated.";
      status.dataset.state = "success";
    } else {
      status.textContent = (r && r.error) || "Could not update password.";
      status.dataset.state = "error";
    }
  });

  function renderAll() { renderOrders(); renderFavorites(); renderQuotes(); renderAddresses(); renderAuth(); loadProfile(); loadAccountOrders(); }
  /* The page is server-gated, but confirm the session client-side too: once the
     customer session resolves, render if signed in, otherwise go to the login screen. */
  window.addEventListener("lunde:customer", function () {
    if (currentCustomer()) renderAll();
    else location.replace("/account/login");
  });
  if (currentCustomer()) renderAll(); // instant paint from cache when available
  renderTabs();
})();
