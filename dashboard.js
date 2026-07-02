/* Lunde V6 — staff dashboard */
(function () {
  var L = window.lunde;
  var money = L.money, STATUS_LABELS = L.STATUS_LABELS;
  var orders = L.orders(), products = L.products();
  var quotes = L.quotes ? L.quotes() : [];
  var customers = L.customers ? L.customers() : [];
  var feedback = L.feedbackItems ? L.feedbackItems() : [];
  var session = window.lundeSession || {};
  var mount = document.getElementById("dash");

  function ago(ts) { var s = (Date.now() - ts) / 1000; if (s < 3600) return Math.round(s / 60) + "m ago"; if (s < 86400) return Math.round(s / 3600) + "h ago"; return Math.round(s / 86400) + "d ago"; }

  var openOrders = orders.filter(function (o) { return o.status !== "delivered" && o.status !== "cancelled"; });
  var revenue = orders.filter(function (o) { return o.status !== "cancelled"; }).reduce(function (s, o) { return s + (o.totals && o.totals.total || 0); }, 0);
  var lowStock = products.filter(function (p) { var i = L.stockInfo(p.id); return i.level === "low" || i.level === "out"; });
  var openQuotes = quotes.filter(function (q) { return q.status !== "won" && q.status !== "expired"; });
  var openMsgs = feedback.filter(function (f) { return f.status !== "resolved"; });

  function ic(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' + p + '</svg>'; }
  function kpi(href, tone, icon, num, label, sub) {
    return '<a class="kpi" href="' + href + '"><span class="kpi-ic" data-tone="' + tone + '">' + ic(icon) + '</span><span class="kpi-num">' + num + '</span><span class="kpi-label">' + label + '</span><span class="kpi-sub">' + sub + '</span></a>';
  }

  var firstName = (session.name || "there").split(" ")[0];
  var recent = orders.slice().sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 7);

  function thumbBg(o) {
    var ids = Object.keys(o.items || {});
    var p = ids.map(function (id) { return L.productById(id); }).filter(Boolean)[0];
    return p ? L.thumb(p.mainImage) : "";
  }
  function orderItemsLabel(o) {
    var n = Object.keys(o.items || {}).length;
    return n + " item" + (n === 1 ? "" : "s");
  }

  mount.innerHTML =
    '<div class="app-head"><div><p class="eyebrow">Overview</p><h1>Good to see you, ' + firstName + '.</h1><p>Here\'s what\'s moving across the store today.</p></div></div>' +
    '<div class="kpis">' +
      kpi("./orders.html", "amber", '<path d="M6 4h12l1 16H5L6 4Z"/><path d="M9 8h6"/>', openOrders.length, "Open orders", "Awaiting fulfillment") +
      kpi("./reports.html", "green", '<path d="M4 20V4M4 20h16"/><path d="M7 14l4-4 3 3 5-6"/>', money(revenue), "Revenue", "All orders, lifetime") +
      kpi("./inventory.html", lowStock.length ? "amber" : "blue", '<path d="M3 7l9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7"/>', lowStock.length, "Low / out of stock", lowStock.length ? "Needs restock" : "All healthy") +
      kpi("./quotes.html", "violet", '<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5"/>', openQuotes.length, "Open quotes", "Not yet converted") +
    '</div>' +
    '<div class="cols-2">' +
      '<div class="panel"><div class="panel-head"><h2>Recent orders</h2><a href="./orders.html">View all</a></div>' +
        '<div class="rowlist">' + (recent.length ? recent.map(function (o) {
          return '<a class="row" href="./order.html?id=' + encodeURIComponent(o.id) + '" style="grid-template-columns:44px 1fr auto auto">' +
            '<span class="row-thumb" style="background-image:url(\'' + thumbBg(o) + '\')"></span>' +
            '<span><span class="row-title">' + o.id + '</span><span class="row-sub">' + (o.customer && o.customer.name || "Guest") + ' · ' + orderItemsLabel(o) + ' · ' + ago(o.createdAt) + '</span></span>' +
            '<span class="status-badge" data-status="' + o.status + '"><i></i>' + STATUS_LABELS[o.status] + '</span>' +
            '<span class="row-strong">' + money(o.totals.total) + '</span></a>';
        }).join("") : '<div class="app-empty"><p>No orders yet.</p></div>') + '</div></div>' +
      '<div style="display:grid;gap:18px">' +
        '<div class="panel"><div class="panel-head"><h2>Low stock</h2><a href="./inventory.html">Manage</a></div>' +
          '<div class="rowlist">' + (lowStock.length ? lowStock.slice(0, 5).map(function (p) {
            var i = L.stockInfo(p.id);
            return '<a class="row" href="./inventory.html" style="grid-template-columns:44px 1fr auto"><span class="row-thumb" style="background-image:url(\'' + L.thumb(p.mainImage) + '\')"></span>' +
              '<span><span class="row-title">' + p.title + '</span><span class="row-sub">' + p.collection.replace("AdoFloor ", "") + '</span></span>' +
              '<span class="status-badge" data-status="' + (i.level === "out" ? "cancelled" : "shipped") + '"><i></i>' + (i.level === "out" ? "Out" : i.cartons + " left") + '</span></a>';
          }).join("") : '<div class="app-empty"><p>Everything is well stocked.</p></div>') + '</div></div>' +
        '<div class="panel"><div class="panel-head"><h2>Inbox</h2><a href="./messages.html">Open</a></div>' +
          '<div class="panel-pad"><p style="color:var(--muted);font-size:14.5px">' + (openMsgs.length ? '<b style="font-family:var(--font-display);font-size:30px;font-weight:600;color:var(--ink);display:block;line-height:1">' + openMsgs.length + '</b> open message' + (openMsgs.length === 1 ? "" : "s") + ' from customers awaiting a reply.' : 'No open messages — you\'re all caught up.') + '</p></div></div>' +
      '</div>' +
    '</div>';
})();
