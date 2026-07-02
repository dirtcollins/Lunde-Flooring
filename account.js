/* Lunde V6 — my account (v2 flagship hub) */
(function () {
  var L = window.lunde;
  var orders = L.orders, productById = L.productById, cartonsFor = L.cartonsFor,
      materialEstimate = L.materialEstimate, cartonPrice = L.cartonPrice, money = L.money,
      STATUSES = L.STATUSES, STATUS_LABELS = L.STATUS_LABELS, favorites = L.favorites,
      currentCustomer = L.currentCustomer, quotes = L.quotes;

  var params = new URLSearchParams(location.search);
  var placedId = params.get("placed");
  var CHECKOUT_PENDING_KEY = "lunde_pending_checkout_v1";

  /* ---------- sections ---------- */
  function ic(p) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>'; }
  var ICONS = {
    overview: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
    orders: '<path d="M6 4h12l1 16H5L6 4Z"/><path d="M9 8a3 3 0 0 0 6 0"/>',
    quotes: '<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5"/><path d="M8 13h8M8 17h6"/>',
    favorites: '<path d="M12 20s-7-4.5-9-9c-1.3-3 .8-6.5 4-6.5 2.2 0 3.8 1.3 5 3 1.2-1.7 2.8-3 5-3 3.2 0 5.3 3.5 4 6.5-2 4.5-9 9-9 9Z"/>',
    recent: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    addresses: '<path d="M12 21s7-5.8 7-11a7 7 0 0 0-14 0c0 5.2 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
    payments: '<rect x="3" y="5" width="18" height="14"/><path d="M3 10h18"/><path d="M7 15h4"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6.2 8-6.2S20 16 20 20"/>',
    security: '<path d="M12 3l7 3v6c0 4-3 6.5-7 9-4-2.5-7-5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    notifications: '<path d="M18 16H6l1.4-2.3c.4-.7.6-1.5.6-2.3V9a4 4 0 0 1 8 0v2.4c0 .8.2 1.6.6 2.3L18 16Z"/><path d="M10 19a2 2 0 0 0 4 0"/>'
  };
  var GROUPS = [
    { label: "Shop", items: [["overview", "Overview"], ["orders", "Orders"], ["quotes", "Quotes"], ["favorites", "Favorites"], ["recent", "Recently viewed"]] },
    { label: "Delivery & billing", items: [["addresses", "Addresses"], ["payments", "Payment methods"]] },
    { label: "Account", items: [["profile", "Personal info"], ["security", "Password & security"], ["notifications", "Notifications"]] }
  ];
  var TABS = GROUPS.reduce(function (acc, g) { return acc.concat(g.items.map(function (i) { return i[0]; })); }, []);
  var LEGACY = { settings: "profile" };
  var activeTab = params.get("tab") || "overview";
  if (LEGACY[activeTab]) activeTab = LEGACY[activeTab];
  if (TABS.indexOf(activeTab) < 0) activeTab = "overview";

  /* ---------- helpers ---------- */
  function ago(ts) { var s = (Date.now() - ts) / 1000; if (s < 60) return "just now"; if (s < 3600) return Math.round(s / 60) + "m ago"; if (s < 86400) return Math.round(s / 3600) + "h ago"; return Math.round(s / 86400) + "d ago"; }
  function fmtDate(ts) { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  function fmtMonthYear(ts) { return new Date(ts).toLocaleDateString("en-US", { month: "long", year: "numeric" }); }
  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function firstName(name) { var n = String(name || "").trim().split(/\s+/)[0]; return n || ""; }
  function initialsOf(name, email) {
    var src = String(name || "").trim() || String(email || "").trim();
    if (!src) return "LF";
    var parts = src.split(/\s+/);
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : src.slice(0, 2)).toUpperCase();
  }
  function emptyState(iconKey, title, copy, ctaHref, ctaLabel) {
    return '<div class="acct-empty-state"><span class="ic">' + ic(ICONS[iconKey] || ICONS.overview) + '</span><h3>' + title + '</h3><p>' + copy + '</p>' +
      (ctaHref ? '<a class="btn" href="' + ctaHref + '">' + ctaLabel + '</a>' : "") + '</div>';
  }
  function clearCartAfterStripeSuccess(orderId) {
    if (params.get("stripe") !== "success" || !params.get("session_id")) return;
    try {
      var pending = JSON.parse(localStorage.getItem(CHECKOUT_PENDING_KEY) || "{}");
      if (pending && pending.orderId === orderId) { L.clearCart(); localStorage.removeItem(CHECKOUT_PENDING_KEY); }
    } catch (err) {}
  }

  /* placed banner */
  if (placedId) {
    clearCartAfterStripeSuccess(placedId);
    var placed = orders().find(function (x) { return x.id === placedId; });
    if (placed) document.getElementById("placedBanner").innerHTML =
      '<div class="acct-placed"><i></i><span><strong>Order ' + placed.id + ' placed.</strong> ' +
      (placed.customer.email ? "A confirmation is on its way to " + esc(placed.customer.email) + ". " : "") +
      (placed.delivery.method === "pickup" ? "We’ll let you know when it’s ready for pickup." : "We’ll send tracking when it ships.") + '</span></div>';
  }

  /* ---------- nav ---------- */
  var navEl = document.getElementById("acctNav");
  function counts() {
    return {
      orders: visibleOrders().length,
      quotes: visibleQuotes().length,
      favorites: favorites().length,
      recent: (L.recentlyViewed ? L.recentlyViewed() : []).length,
      addresses: (currentCustomer() && L.myAddresses) ? L.myAddresses().length : 0
    };
  }
  function renderNav() {
    var c = counts();
    navEl.innerHTML = GROUPS.map(function (g) {
      return '<div class="acct-nav-group"><small>' + g.label + '</small>' + g.items.map(function (item) {
        var key = item[0], n = c[key];
        return '<a href="?tab=' + key + '" data-account-tab="' + key + '"' + (key === activeTab ? ' aria-current="page"' : '') + '>' +
          ic(ICONS[key]) + item[1] + (n ? '<span class="cnt">' + n + '</span>' : "") + '</a>';
      }).join("") + '</div>';
    }).join("") +
    '<div class="acct-nav-out"><button type="button" id="navSignout">' + ic('<path d="M9 4H5v16h4"/><path d="M14 8l4 4-4 4M18 12H9"/>') + 'Sign out</button></div>';
    var out = document.getElementById("navSignout");
    if (out) out.addEventListener("click", signOut);
  }
  navEl.addEventListener("click", function (e) {
    var a = e.target.closest("[data-account-tab]");
    if (!a) return;
    e.preventDefault();
    setTab(a.dataset.accountTab, true);
  });
  function setTab(tab, fromClick) {
    activeTab = tab;
    var u = new URL(location.href); u.searchParams.set("tab", tab); history.replaceState({}, "", u);
    document.querySelectorAll("[data-account-tab]").forEach(function (t) {
      if (t.dataset.accountTab === tab) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
    });
    document.querySelectorAll("[data-account-panel]").forEach(function (p) { p.hidden = p.dataset.accountPanel !== tab; });
    if (fromClick) {
      var pane = document.querySelector(".acct-layout");
      if (pane && window.matchMedia("(max-width: 940px)").matches) pane.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  function signOut() {
    L.signOutCustomer();
    location.href = "/account/login";
  }

  /* ---------- hero ---------- */
  function renderHero() {
    var c = currentCustomer(); if (!c) return;
    var name = firstName(c.name);
    document.getElementById("acctAvatar").textContent = initialsOf(c.name, c.email);
    document.getElementById("acctGreeting").textContent = name ? "Welcome back, " + name + "." : "Welcome back.";
    document.getElementById("acctMemberSince").textContent = c.createdAt ? "Member since " + fmtMonthYear(c.createdAt) + " · " + c.email : c.email || "";
  }

  /* ---------- shared renderers ---------- */
  function thumbs(items) {
    var ids = Object.keys(items || {});
    var ps = ids.map(function (id) { return productById(id); }).filter(Boolean);
    var shown = ps.slice(0, 3);
    var more = ps.length - shown.length;
    if (!ps.length) return '<span class="acct-thumbs"></span>';
    return '<span class="acct-thumbs">' + shown.map(function (p) {
      return '<span class="acct-thumb" style="background-image:url(\'' + L.thumb(p.mainImage) + '\')"></span>';
    }).join("") + (more > 0 ? '<span class="acct-thumb-more">+' + more + '</span>' : "") + '</span>';
  }
  function itemSummary(items) {
    return Object.keys(items || {}).map(function (id) {
      var p = productById(id); if (!p) return ""; var e = items[id]; var parts = [];
      if (e.sqft > 0) parts.push(cartonsFor(p, e.sqft) + " ctn " + p.title);
      if (e.samples > 0) parts.push(e.samples + "× sample " + p.title);
      return parts.join(", ");
    }).filter(Boolean).join(" · ");
  }
  function orderCard(o) {
    var pct = o.status === "cancelled" ? 100 : Math.round(STATUSES.indexOf(o.status) / (STATUSES.length - 1) * 100);
    var delEvent = (o.history || []).find(function (h) { return h.status === "delivered"; });
    return '<a class="acct-card acct-order" href="./my-order.html?id=' + encodeURIComponent(o.id) + '" data-screen-label="Order ' + o.id + '">' +
      '<div class="acct-order-top"><div class="acct-order-lead">' + thumbs(o.items) + '<div><span class="acct-id">' + o.id + '</span><span class="acct-when">' + ago(o.createdAt) + '</span></div></div>' +
      '<span class="status-badge" data-status="' + o.status + '"><i></i>' + STATUS_LABELS[o.status] + '</span></div>' +
      '<span class="acct-items">' + itemSummary(o.items) + '</span>' +
      '<div class="acct-progress"><i style="width:' + pct + '%' + (o.status === "cancelled" ? ";background:#9a4a2e" : "") + '"></i></div>' +
      '<div class="acct-order-foot"><div class="acct-dates"><span><small>Ordered</small><b>' + fmtDate(o.createdAt) + '</b></span>' +
        (delEvent ? '<span><small>Delivered</small><b>' + fmtDate(delEvent.at) + '</b></span>' : '<span><small>Status</small><b>' + STATUS_LABELS[o.status] + '</b></span>') +
      '</div><strong class="acct-total">' + money(o.totals.total) + '</strong></div></a>';
  }
  function productTile(p, removable, removeAttr) {
    return '<article class="acct-fav">' +
      '<a class="acct-fav-media" href="./product.html?slug=' + p.slug + '" aria-label="' + esc(p.title) + '"><span class="swatch" style="position:absolute;inset:0;background-image:url(\'' + L.img(p.mainImage) + '\')"></span></a>' +
      (removable ? '<button class="acct-fav-x" type="button" ' + removeAttr + '="' + p.id + '" aria-label="Remove ' + esc(p.title) + '">' + ic('<path d="M6 6l12 12M18 6L6 18"/>') + '</button>' : "") +
      '<a class="acct-fav-body" href="./product.html?slug=' + p.slug + '">' +
        '<span class="coll">' + esc(p.color || p.collection || "") + '</span>' +
        '<strong>' + esc(p.title) + '</strong>' +
        '<span class="price"><b>' + money(p.pricePerSqft) + '</b><span> / sq. ft. · ' + money(cartonPrice(p)) + ' / carton</span></span>' +
      '</a></article>';
  }
  function skeletonCards(n) {
    var card = '<div class="acct-skel-card"><div class="acct-skel-b w40"></div><div class="acct-skel-b w70"></div><div class="acct-skel-b"></div><div class="acct-skel-b w40"></div></div>';
    var out = ""; for (var i = 0; i < n; i += 1) out += card;
    return '<div class="acct-skel" aria-label="Loading" role="status">' + out + '</div>';
  }

  /* ---------- orders ---------- */
  var serverOrders = null;
  var ordersLoading = false;
  function visibleOrders() {
    if (Array.isArray(serverOrders)) return serverOrders;
    var c = currentCustomer();
    if (!c) return [];
    var email = String(c.email || "").toLowerCase();
    return orders().filter(function (o) { return (o.checkout && o.checkout.customerId === c.id) || String(o.customer && o.customer.email || "").toLowerCase() === email; });
  }
  async function loadAccountOrders() {
    if (!currentCustomer() || !L.accountOrders) return;
    ordersLoading = true;
    if (!visibleOrders().length) { renderOrders(); }
    try { serverOrders = await L.accountOrders(); } catch (e) {}
    ordersLoading = false;
    renderOrders(); renderOverview(); renderPayments(); renderNav();
  }
  function renderOrders() {
    var all = visibleOrders();
    var sub = document.getElementById("ordersSub");
    sub.textContent = all.length ? all.length + " order" + (all.length === 1 ? "" : "s") + " — every one backed by our 20-year residential warranty." : "Every order you’ve placed with us, with live delivery status.";
    var listEl = document.getElementById("ordersList");
    if (!all.length && ordersLoading) { listEl.innerHTML = skeletonCards(3); return; }
    listEl.innerHTML = all.length ? all.map(orderCard).join("")
      : emptyState("orders", "No orders yet", "When you place your first order, you’ll be able to track every step here — from our warehouse to your doorstep.", "./catalog.html", "Browse floors");
  }

  /* ---------- overview ---------- */
  function renderOverview() {
    var mount = document.getElementById("overviewMount");
    var c = counts();
    var all = visibleOrders();
    var latest = all.length ? all[0] : null;
    var recent = L.recentlyViewed ? L.recentlyViewed().slice(0, 4) : [];
    var stats =
      '<div class="acct-stats">' +
        '<a class="acct-stat" href="?tab=orders" data-account-tab="orders"><b>' + c.orders + '</b><span>Order' + (c.orders === 1 ? "" : "s") + '</span><small>' + (latest ? "Latest: " + STATUS_LABELS[latest.status] : "None yet") + '</small></a>' +
        '<a class="acct-stat" href="?tab=quotes" data-account-tab="quotes"><b>' + c.quotes + '</b><span>Saved quote' + (c.quotes === 1 ? "" : "s") + '</span><small>' + (c.quotes ? "Ready when you are" : "Price a room") + '</small></a>' +
        '<a class="acct-stat" href="?tab=favorites" data-account-tab="favorites"><b>' + c.favorites + '</b><span>Favorite' + (c.favorites === 1 ? "" : "s") + '</span><small>' + (c.favorites ? "Floors you love" : "Tap ♥ to save") + '</small></a>' +
        '<a class="acct-stat" href="?tab=addresses" data-account-tab="addresses"><b>' + c.addresses + '</b><span>Address' + (c.addresses === 1 ? "" : "es") + '</span><small>' + (c.addresses ? "Faster checkout" : "Add one") + '</small></a>' +
      '</div>';
    var latestCard;
    if (ordersLoading && !all.length) {
      latestCard = skeletonCards(1);
    } else if (latest) {
      var pct = latest.status === "cancelled" ? 100 : Math.round(STATUSES.indexOf(latest.status) / (STATUSES.length - 1) * 100);
      latestCard =
        '<div class="acct-card acct-ov-order">' +
          '<div class="k"><h3>Latest order</h3><span class="status-badge" data-status="' + latest.status + '"><i></i>' + STATUS_LABELS[latest.status] + '</span></div>' +
          '<div class="acct-order-lead" style="margin-bottom:14px">' + thumbs(latest.items) + '<div><span class="acct-id">' + latest.id + '</span><span class="acct-when">Placed ' + fmtDate(latest.createdAt) + '</span></div></div>' +
          '<span class="acct-items">' + itemSummary(latest.items) + '</span>' +
          '<div class="acct-progress"><i style="width:' + pct + '%' + (latest.status === "cancelled" ? ";background:#9a4a2e" : "") + '"></i></div>' +
          '<div class="acct-order-foot" style="margin-top:auto"><strong class="acct-total">' + money(latest.totals.total) + '</strong>' +
          '<a class="link-underline" href="./my-order.html?id=' + encodeURIComponent(latest.id) + '">Track order <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></a></div>' +
        '</div>';
    } else {
      latestCard =
        '<div class="acct-card acct-ov-order">' +
          '<div class="k"><h3>Latest order</h3></div>' +
          '<div style="margin:auto 0;display:grid;gap:10px;justify-items:start">' +
            '<strong style="font-family:var(--font-display);font-size:21px;font-weight:600">Your first floor is waiting.</strong>' +
            '<span style="font-size:14px;color:var(--muted);max-width:44ch">Order free samples, see them in your own light, then order by the carton — delivered free over $1,200 across Kern County.</span>' +
            '<a class="link-underline" href="./catalog.html" style="margin-top:6px">Start shopping <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></a>' +
          '</div>' +
        '</div>';
    }
    var ctas =
      '<div class="acct-ov-cta">' +
        '<a class="acct-card dark" href="./samples.html"><strong>Order free samples</strong><span>Any 4 floors, delivered to your door</span></a>' +
        '<a class="acct-card" href="./catalog.html"><strong>Shop all floors</strong><span>Waterproof LVP, priced by the carton</span></a>' +
      '</div>';
    var recentStrip = recent.length
      ? '<div class="acct-sec-h"><h3>Recently viewed</h3><a href="?tab=recent" data-account-tab="recent">View all</a></div>' +
        '<div class="acct-favs" style="grid-template-columns:repeat(4,1fr)" data-ov-recent>' + recent.map(function (p) { return productTile(p, false); }).join("") + '</div>'
      : "";
    mount.innerHTML = stats + '<div class="acct-ov-grid">' + latestCard + ctas + '</div>' + recentStrip;
    mount.querySelectorAll("[data-account-tab]").forEach(function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); setTab(a.dataset.accountTab, true); });
    });
  }

  /* ---------- favorites ---------- */
  function renderFavorites() {
    var favs = favorites().map(function (id) { return productById(id); }).filter(Boolean);
    document.getElementById("favSub").textContent = favs.length ? favs.length + " floor" + (favs.length === 1 ? "" : "s") + " saved. Tap a card to keep exploring." : "Floors you’ve saved while browsing.";
    document.getElementById("favGrid").innerHTML = favs.length
      ? favs.map(function (p) { return productTile(p, true, "data-unfav"); }).join("")
      : emptyState("favorites", "Nothing saved yet", "Tap the heart on any floor to build a shortlist you can compare and come back to anytime.", "./catalog.html", "Browse floors");
  }
  document.getElementById("favGrid").addEventListener("click", function (e) {
    var b = e.target.closest("[data-unfav]");
    if (!b) return;
    L.toggleFavorite(b.dataset.unfav);
    renderFavorites(); renderNav(); renderOverview();
    if (L.showToast) L.showToast("Removed from favorites");
  });

  /* ---------- recently viewed ---------- */
  function renderRecent() {
    var items = L.recentlyViewed ? L.recentlyViewed() : [];
    var clearBtn = document.getElementById("clearRecentBtn");
    clearBtn.hidden = !items.length;
    document.getElementById("recentGrid").innerHTML = items.length
      ? items.map(function (p) { return productTile(p, false); }).join("")
      : emptyState("recent", "Nothing viewed yet", "Floors you look at will appear here so you can easily find your way back to them.", "./catalog.html", "Start browsing");
  }
  document.getElementById("clearRecentBtn").addEventListener("click", function () {
    if (L.clearRecentlyViewed) L.clearRecentlyViewed();
    renderRecent(); renderNav(); renderOverview();
    if (L.showToast) L.showToast("Browsing history cleared");
  });

  /* ---------- quotes ---------- */
  function visibleQuotes() {
    var c = currentCustomer(); var all = quotes ? quotes() : [];
    if (!c) return all.filter(function (q) { return !q.customerId; });
    var email = String(c.email || "").toLowerCase();
    return all.filter(function (q) { return q.customerId === c.id || String(q.customer && q.customer.email || "").toLowerCase() === email; });
  }
  function quoteLines(q) {
    var t = L.cartTotals(q.items || {});
    var rows = Object.keys(q.items || {}).map(function (id) {
      var p = productById(id); if (!p) return ""; var e = q.items[id]; var out = "";
      if (e.sqft > 0) {
        out += '<div class="acct-quote-line"><a class="swatch" href="./product.html?slug=' + p.slug + '" style="background-image:url(\'' + L.thumb(p.mainImage) + '\')"></a>' +
          '<div><strong>' + esc(p.title) + '</strong><small>' + cartonsFor(p, e.sqft) + ' cartons · covers ' + e.sqft + ' sq. ft. · ' + money(cartonPrice(p)) + ' / carton</small></div>' +
          '<span class="amt">' + money(materialEstimate(p, e.sqft)) + '</span></div>';
      }
      if ((e.samples || 0) > 0) {
        out += '<div class="acct-quote-line"><a class="swatch" href="./product.html?slug=' + p.slug + '" style="background-image:url(\'' + L.thumb(p.mainImage) + '\')"></a>' +
          '<div><strong>' + esc(p.title) + ' — sample</strong><small>' + e.samples + ' × ' + money(p.samplePrice) + '</small></div>' +
          '<span class="amt">' + money(e.samples * p.samplePrice) + '</span></div>';
      }
      return out;
    }).join("");
    return '<div class="acct-quote-lines">' + rows + '</div>' +
      '<div class="acct-quote-total"><span>Estimated subtotal</span><b>' + money(t.subtotal) + '</b></div>' +
      '<p style="font-size:12.5px;color:var(--muted);margin-top:8px">Delivery and tax are calculated at checkout. Prices may change until the order is placed.</p>' +
      '<div class="acct-quote-actions">' +
        '<button class="btn" type="button" data-quote-cart="' + q.id + '">Add to cart</button>' +
        '<button class="btn ghost" type="button" data-quote-dup="' + q.id + '">Duplicate</button>' +
        '<button class="acct-btn-quiet" type="button" data-quote-rename="' + q.id + '">Rename</button>' +
        '<button class="acct-btn-quiet danger" type="button" data-quote-del="' + q.id + '">Delete</button>' +
      '</div>';
  }
  function renderQuotes() {
    var all = visibleQuotes();
    document.getElementById("quotesList").innerHTML = all.length ? all.map(function (q, i) {
      var t = L.cartTotals(q.items || {});
      return '<details class="acct-quote"' + (i === 0 && all.length === 1 ? " open" : "") + '><summary>' +
        '<div class="acct-order-lead">' + thumbs(q.items) + '<div><span class="acct-id">' + esc(q.job || "Saved quote") + '</span><span class="acct-when">' + q.id + ' · updated ' + ago(q.updatedAt || q.createdAt) + '</span></div></div>' +
        '<div class="acct-quote-sum"><strong class="acct-total">' + money(t.subtotal) + '</strong><span class="chev">' + ic('<path d="M6 9l6 6 6-6"/>') + '</span></div>' +
        '</summary><div class="acct-quote-body">' + quoteLines(q) + '</div></details>';
    }).join("") : emptyState("quotes", "No saved quotes yet", "Build a cart, save it as a quote, and we’ll hold the math — cartons, coverage, and pricing — for when you’re ready.", "./catalog.html", "Start a quote");
  }
  document.getElementById("quotesList").addEventListener("click", function (e) {
    var cartBtn = e.target.closest("[data-quote-cart]");
    if (cartBtn && L.quoteToCart) { var n = L.quoteToCart(cartBtn.dataset.quoteCart); if (L.showToast) L.showToast(n ? "Quote added to cart" : "Items no longer available", n ? "View cart" : null, n ? function () { location.href = "./cart.html"; } : null); return; }
    var dup = e.target.closest("[data-quote-dup]");
    if (dup && L.duplicateQuote) { L.duplicateQuote(dup.dataset.quoteDup); renderQuotes(); renderNav(); if (L.showToast) L.showToast("Quote duplicated"); return; }
    var ren = e.target.closest("[data-quote-rename]");
    if (ren && L.updateQuote) {
      var q = visibleQuotes().find(function (x) { return x.id === ren.dataset.quoteRename; });
      var name = prompt("Name this quote (e.g. “Living room + hallway”):", q && q.job ? q.job : "");
      if (name !== null) { L.updateQuote(ren.dataset.quoteRename, { job: String(name).trim() }); renderQuotes(); if (L.showToast) L.showToast("Quote renamed"); }
      return;
    }
    var del = e.target.closest("[data-quote-del]");
    if (del && L.deleteQuote && confirm("Delete this quote? This can’t be undone.")) { L.deleteQuote(del.dataset.quoteDel); renderQuotes(); renderNav(); renderOverview(); if (L.showToast) L.showToast("Quote deleted"); }
  });

  /* ---------- addresses ---------- */
  var ADDR_ICON = { Home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/>', Work: '<rect x="4" y="7" width="16" height="13"/><path d="M9 7V4h6v3"/>', "Job site": '<path d="M3 20h18"/><path d="M5 20V9l7-5 7 5v11"/><path d="M10 20v-5h4v5"/>' };
  function syncAddressesToServer() {
    if (L.saveAccountProfile && currentCustomer() && L.myAddresses) {
      L.saveAccountProfile({ addresses: L.myAddresses() }).catch(function () {});
    }
  }
  function renderAddresses() {
    var wrap = document.getElementById("myAddresses");
    var c = currentCustomer();
    if (!c || !L.myAddresses) { wrap.innerHTML = emptyState("addresses", "Sign in to manage addresses", "Saved addresses make checkout faster.", "/account/login", "Sign in"); return; }
    var list = L.myAddresses();
    wrap.innerHTML = list.map(function (a) {
      return '<div class="acct-card acct-addr' + (a.isDefault ? " is-default" : "") + '">' +
        '<div class="acct-addr-top">' + ic(ADDR_ICON[a.label] || ICONS.addresses) + '<span class="acct-addr-label">' + esc(a.label) + '</span>' +
        (a.isDefault ? '<span class="acct-addr-default">Default</span>' : "") + '</div>' +
        '<p>' + esc(a.line1) + '<br>' + esc([a.city, a.state].filter(Boolean).join(", ")) + ' ' + esc(a.zip) + '</p>' +
        '<div class="acct-addr-actions"><button type="button" data-edit-addr="' + a.id + '">Edit</button>' +
        (a.isDefault ? "" : '<button type="button" data-set-default="' + a.id + '">Set as default</button><button type="button" class="danger" data-del-addr="' + a.id + '">Delete</button>') +
        '</div></div>';
    }).join("") +
    '<button class="acct-addr-add" type="button" data-add-addr><i>+</i>Add a new address</button>';
  }
  function addrDialog(id) {
    var existing = id && L.myAddresses().find(function (a) { return a.id === id; });
    var d = document.getElementById("acctAddr");
    if (!d) { d = document.createElement("dialog"); d.id = "acctAddr"; d.className = "v6-compare-dialog"; d.style.maxWidth = "460px"; document.body.appendChild(d); d.addEventListener("click", function (e) { if (e.target === d) d.close(); }); }
    var opts = (L.ADDRESS_LABELS || ["Home", "Work", "Job site"]).map(function (l) { return '<option' + (existing && existing.label === l ? " selected" : "") + '>' + l + '</option>'; }).join("");
    d.innerHTML = '<div class="v6-compare-head"><h2>' + (existing ? "Edit address" : "Add address") + '</h2><button class="v6-compare-close" type="button" data-x aria-label="Close">×</button></div>' +
      '<form class="v6-form" style="padding:24px 26px;gap:14px"><label class="v6-field"><span>Label</span><select name="label">' + opts + '</select></label>' +
      '<label class="v6-field"><span>Street address</span><input name="line1" value="' + esc(existing ? existing.line1 : "") + '" autocomplete="address-line1" required></label>' +
      '<div class="v6-field-row three"><label class="v6-field"><span>City</span><input name="city" value="' + esc(existing ? existing.city : "") + '" autocomplete="address-level2"></label>' +
      '<label class="v6-field"><span>State</span><input name="state" value="' + esc(existing ? existing.state : "CA") + '" autocomplete="address-level1"></label>' +
      '<label class="v6-field"><span>ZIP</span><input name="zip" value="' + esc(existing ? existing.zip : "") + '" autocomplete="postal-code" inputmode="numeric"></label></div>' +
      '<label class="v6-opt" style="margin-top:2px"><input type="checkbox" name="isDefault"' + (existing && existing.isDefault ? " checked" : "") + '><span class="v6-opt-t"><strong>Set as default delivery address</strong><span>Used automatically at checkout</span></span></label>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:6px"><button class="btn ghost" type="button" data-x>Cancel</button><button class="btn" type="submit">' + (existing ? "Save changes" : "Add address") + '</button></div></form>';
    d.querySelectorAll("[data-x]").forEach(function (b) { b.addEventListener("click", function () { d.close(); }); });
    d.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault(); var fd = new FormData(e.target);
      var addr = { label: fd.get("label"), line1: fd.get("line1"), city: fd.get("city"), state: fd.get("state"), zip: fd.get("zip"), isDefault: e.target.elements.isDefault.checked };
      if (existing) L.updateMyAddress(id, addr); else L.addMyAddress(addr);
      syncAddressesToServer();
      d.close(); renderAddresses(); renderNav(); renderOverview();
      if (L.showToast) L.showToast(existing ? "Address updated" : "Address added");
    });
    d.showModal();
  }
  document.getElementById("addAddressBtn").addEventListener("click", function () { addrDialog(null); });
  document.getElementById("myAddresses").addEventListener("click", function (e) {
    if (e.target.closest("[data-add-addr]")) return addrDialog(null);
    var ed = e.target.closest("[data-edit-addr]"); if (ed) return addrDialog(ed.dataset.editAddr);
    var del = e.target.closest("[data-del-addr]");
    if (del && confirm("Delete this address?")) { L.deleteMyAddress(del.dataset.delAddr); syncAddressesToServer(); renderAddresses(); renderNav(); if (L.showToast) L.showToast("Address deleted"); return; }
    var sd = e.target.closest("[data-set-default]");
    if (sd) { L.setMyDefaultAddress(sd.dataset.setDefault); syncAddressesToServer(); renderAddresses(); if (L.showToast) L.showToast("Default address updated"); }
  });

  /* ---------- payment methods ---------- */
  function renderPayments() {
    var grid = document.getElementById("payGrid");
    var seen = {}, cards = [];
    visibleOrders().forEach(function (o) {
      var p = o.payment || {};
      var last4 = String(p.last4 || "").trim();
      if (!last4 || seen[last4]) return;
      seen[last4] = true;
      cards.push({ last4: last4, name: p.name || (o.customer && o.customer.name) || "", lastUsed: o.createdAt });
    });
    grid.innerHTML = cards.length ? cards.map(function (card) {
      return '<div class="acct-paycard">' +
        '<span class="brand">Card</span>' +
        '<span class="num">•••• &nbsp;•••• &nbsp;•••• &nbsp;' + esc(card.last4) + '</span>' +
        '<div class="meta"><span>Cardholder<b>' + esc(card.name || "—") + '</b></span><span>Last used<b>' + fmtDate(card.lastUsed) + '</b></span></div>' +
      '</div>';
    }).join("") : emptyState("payments", "No cards on file", "You haven’t paid by card yet. When you check out with Stripe, the card you use will appear here for reference.", "./catalog.html", "Shop floors");
  }

  /* ---------- profile ---------- */
  var profileForm = document.getElementById("profileForm");
  function loadProfile() {
    var c = currentCustomer();
    var profile = {};
    if (L.customerDetails) { var d = L.customerDetails(c); for (var k in d) if (d[k]) profile[k] = d[k]; }
    profileForm.querySelectorAll("input").forEach(function (i) { i.value = profile[i.name] || ""; });
    var chip = document.getElementById("emailVerifiedChip");
    chip.innerHTML = c && c.emailVerified ? '<span class="acct-chip">✓ Verified</span>' : "";
  }
  profileForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = document.getElementById("profileSaveBtn");
    var status = document.getElementById("profileStatus");
    status.textContent = ""; status.dataset.state = "";
    var profile = {};
    profileForm.querySelectorAll("input").forEach(function (i) { profile[i.name] = i.value.trim(); });
    if (L.updateCurrentCustomer) L.updateCurrentCustomer({ name: profile.name, company: profile.company, phone: profile.phone });
    btn.disabled = true; var prev = btn.textContent; btn.textContent = "Saving…";
    if (L.saveAccountProfile && currentCustomer()) {
      var r = await L.saveAccountProfile({ name: profile.name, company: profile.company, phone: profile.phone });
      status.textContent = r && r.ok ? "Your details are saved." : ((r && r.error) || "Saved on this device only — we couldn’t reach the server.");
      status.dataset.state = r && r.ok ? "success" : "error";
      if (r && r.ok) { renderHero(); }
    } else {
      status.textContent = "Details saved."; status.dataset.state = "success";
    }
    btn.disabled = false; btn.textContent = prev;
  });

  /* ---------- security ---------- */
  var passwordForm = document.getElementById("passwordForm");
  function pwScore(v) {
    var s = 0;
    if (v.length >= 10) s += 1;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) s += 1;
    if (/\d/.test(v)) s += 1;
    if (/[^A-Za-z0-9]/.test(v) || v.length >= 14) s += 1;
    return v.length ? Math.max(1, s) : 0;
  }
  var PW_LABELS = ["", "Too weak", "Almost there", "Good password", "Strong password"];
  passwordForm.elements.newPassword.addEventListener("input", function () {
    var v = passwordForm.elements.newPassword.value;
    var score = pwScore(v);
    document.getElementById("pwMeter").dataset.score = String(score);
    document.getElementById("pwMeterLab").textContent = v ? PW_LABELS[score] : "At least 10 characters with uppercase, lowercase, and a number.";
  });
  passwordForm.addEventListener("click", function (e) {
    var eye = e.target.closest("[data-eye]");
    if (!eye) return;
    var input = eye.parentElement.querySelector("input");
    var show = input.type === "password";
    input.type = show ? "text" : "password";
    eye.textContent = show ? "Hide" : "Show";
  });
  passwordForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = document.getElementById("passwordSaveBtn");
    var status = document.getElementById("passwordStatus");
    status.textContent = ""; status.dataset.state = "";
    var currentPassword = String(passwordForm.elements.currentPassword.value || "");
    var newPassword = String(passwordForm.elements.newPassword.value || "");
    var confirmPassword = String(passwordForm.elements.confirmPassword.value || "");
    if (newPassword.length < 10) { status.textContent = "Password must be at least 10 characters."; status.dataset.state = "error"; return; }
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) { status.textContent = "Password must include uppercase, lowercase, and a number."; status.dataset.state = "error"; return; }
    if (newPassword !== confirmPassword) { status.textContent = "Passwords do not match."; status.dataset.state = "error"; return; }
    btn.disabled = true; var prev = btn.textContent; btn.textContent = "Updating…";
    var r = await L.updateCustomerPassword(currentPassword, newPassword);
    btn.disabled = false; btn.textContent = prev;
    if (r && r.ok) {
      passwordForm.reset();
      document.getElementById("pwMeter").dataset.score = "0";
      document.getElementById("pwMeterLab").textContent = "At least 10 characters with uppercase, lowercase, and a number.";
      status.textContent = "Password updated. Use it the next time you sign in.";
      status.dataset.state = "success";
    } else {
      status.textContent = (r && r.error) || "Could not update password.";
      status.dataset.state = "error";
    }
  });
  function renderSecurityRows() {
    var c = currentCustomer(); if (!c) return;
    var rows = document.getElementById("securityRows");
    rows.innerHTML =
      '<div class="acct-row"><div class="acct-row-t"><strong>Signed in as</strong><span>' + esc(c.email) + '</span></div><button class="btn ghost" type="button" id="rowSignout" style="min-height:42px;padding-inline:18px">Sign out</button></div>' +
      '<div class="acct-row"><div class="acct-row-t"><strong>Forgot your password?</strong><span>We’ll email you a secure link to choose a new one.</span></div><button class="acct-btn-quiet" type="button" id="rowReset">Email reset link</button></div>';
    document.getElementById("rowSignout").addEventListener("click", signOut);
    document.getElementById("rowReset").addEventListener("click", async function () {
      var b = this; b.disabled = true; b.textContent = "Sending…";
      if (L.requestPasswordReset) await L.requestPasswordReset(c.email);
      b.textContent = "Sent — check your inbox";
      if (L.showToast) L.showToast("Reset link sent to " + c.email);
    });
  }

  /* ---------- notifications ---------- */
  var NOTIF_DEFS = [
    { key: "orderUpdates", label: "Order & delivery updates", copy: "Receipts, shipping and delivery notices for your orders.", locked: true },
    { key: "samplesFollowUp", label: "Sample follow-ups", copy: "A quick check-in after your free samples arrive.", def: true },
    { key: "newCollections", label: "New floors & collections", copy: "Be first to see new colors and collections we bring in.", def: true },
    { key: "promotions", label: "Sales & promotions", copy: "Occasional offers and seasonal savings. No spam — ever.", def: false }
  ];
  function notifPrefs() {
    var c = currentCustomer() || {};
    var stored = (c.notifications && typeof c.notifications === "object") ? c.notifications : {};
    var out = {};
    NOTIF_DEFS.forEach(function (def) { out[def.key] = def.locked ? true : (stored[def.key] !== undefined ? Boolean(stored[def.key]) : Boolean(def.def)); });
    return out;
  }
  function renderNotifications() {
    var prefs = notifPrefs();
    document.getElementById("notifRows").innerHTML = NOTIF_DEFS.map(function (def) {
      return '<label class="acct-row"><div class="acct-row-t"><strong>' + def.label + (def.locked ? '<span class="acct-chip">Always on</span>' : "") + '</strong><span>' + def.copy + '</span></div>' +
        '<span class="acct-switch"><input type="checkbox" data-notif="' + def.key + '"' + (prefs[def.key] ? " checked" : "") + (def.locked ? " disabled" : "") + '><i></i></span></label>';
    }).join("");
  }
  document.getElementById("notifRows").addEventListener("change", async function (e) {
    var input = e.target.closest("[data-notif]");
    if (!input) return;
    var prefs = notifPrefs();
    prefs[input.dataset.notif] = input.checked;
    delete prefs.orderUpdates;
    var status = document.getElementById("notifStatus");
    status.textContent = "Saving…"; status.dataset.state = "";
    if (L.saveAccountProfile && currentCustomer()) {
      var r = await L.saveAccountProfile({ notifications: prefs });
      status.textContent = r && r.ok ? "Preferences saved." : "Saved on this device — we couldn’t reach the server.";
      status.dataset.state = r && r.ok ? "success" : "error";
    } else {
      status.textContent = "Preferences saved."; status.dataset.state = "success";
    }
    setTimeout(function () { if (status.textContent.indexOf("Saving") < 0) { status.textContent = ""; } }, 2600);
  });

  /* ---------- boot ---------- */
  function renderAll() {
    renderHero(); renderNav(); renderOverview(); renderOrders(); renderFavorites(); renderRecent();
    renderQuotes(); renderAddresses(); renderPayments(); loadProfile(); renderSecurityRows(); renderNotifications();
    loadAccountOrders();
  }
  /* The page is server-gated, but confirm the session client-side too: once the
     customer session resolves, render if signed in, otherwise go to the login screen. */
  window.addEventListener("lunde:customer", function () {
    if (currentCustomer()) renderAll();
    else location.replace("/account/login");
  });
  if (currentCustomer()) renderAll(); // instant paint from cache when available
  setTab(activeTab, false);
})();
