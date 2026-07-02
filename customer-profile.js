/* Lunde V6/V7 — staff customer profile */
(function () {
  var L = window.lunde, money = L.money, STATUS_LABELS = L.STATUS_LABELS;
  var mount = document.getElementById("cpMount");
  var param = new URLSearchParams(location.search).get("id");
  var session = window.lundeSession || {};

  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function fmt(ts) { return ts ? new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"; }
  function ago(ts) { var s = (Date.now() - ts) / 1000; if (s < 86400) return Math.round(s / 3600) + "h ago"; return Math.round(s / 86400) + "d ago"; }
  function initials(n) { return (n || "?").split(" ").map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase(); }

  function render() {
    var c = L.customerProfile(param);
    if (!c) { mount.innerHTML = '<div class="app-head"><h1>Customer not found</h1></div><a class="btn ghost" href="./customers.html">Back</a>'; return; }
    var st = c.stats;
    var orderThumb = function (o) { var k = Object.keys(o.items || {})[0]; var p = k && L.productById(k); return p ? L.thumb(p.mainImage) : ""; };
    var orderRows = c.orders.length ? c.orders.map(function (o) {
      return '<a class="row" href="./order.html?id=' + encodeURIComponent(o.id) + '" style="grid-template-columns:44px 1fr auto auto;gap:14px">' +
        '<span class="row-thumb" style="background-image:url(\'' + orderThumb(o) + '\')"></span>' +
        '<span><span class="row-title">' + o.id + '</span><span class="row-sub">' + fmt(o.createdAt) + ' · ' + Object.keys(o.items).length + ' items</span></span>' +
        '<span class="status-badge" data-status="' + o.status + '"><i></i>' + STATUS_LABELS[o.status] + '</span>' +
        '<span class="row-strong">' + money(o.totals.total) + '</span></a>';
    }).join("") : '<div class="app-empty"><p>No orders yet.</p></div>';

    var notes = (c.notes || []).map(function (n) {
      return '<div class="mo-tl" style="align-items:flex-start"><span>' + esc(n.text) + '<br><span class="row-sub">' + esc(n.author) + '</span></span><span class="when">' + ago(n.at) + '</span></div>';
    }).join("") || '<p class="row-sub">No notes yet.</p>';

    var addrs = (c.addresses || []).map(function (a) {
      return '<div class="mo-info-card"><h4>' + esc(a.label || "Address") + (a.isDefault ? ' · Default' : '') + '</h4><p>' + esc(a.line1) + '<br>' + esc([a.city, a.state].filter(Boolean).join(", ")) + ' ' + esc(a.zip || "") + '</p></div>';
    }).join("") || '<p class="row-sub">No saved addresses.</p>';

    mount.innerHTML =
      '<a class="mo-back" href="./customers.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M19 12H5M11 6l-6 6 6 6"></path></svg>All customers</a>' +
      '<div class="app-head"><div style="display:flex;align-items:center;gap:16px"><span class="av" style="width:54px;height:54px;font-size:18px;background:var(--accent);color:#fff;display:grid;place-items:center;border-radius:999px">' + initials(c.name) + '</span><div><p class="eyebrow">' + (c.synthesized ? "Guest customer" : "Account") + '</p><h1>' + esc(c.name || c.email) + '</h1><p>' + esc(c.email) + (c.company ? ' · ' + esc(c.company) : '') + '</p></div></div></div>' +
      '<div class="kpis">' +
        '<div class="kpi"><span class="kpi-label">Lifetime value</span><span class="kpi-num">' + money(st.ltv) + '</span></div>' +
        '<div class="kpi"><span class="kpi-label">Orders</span><span class="kpi-num">' + st.totalOrders + '</span></div>' +
        '<div class="kpi"><span class="kpi-label">Avg order</span><span class="kpi-num">' + money(st.avgOrder) + '</span></div>' +
        '<div class="kpi"><span class="kpi-label">Last order</span><span class="kpi-num" style="font-size:20px">' + fmt(st.lastOrder) + '</span></div>' +
      '</div>' +
      '<div class="cols-2"><div class="panel"><div class="panel-head"><h2>Order history</h2></div><div class="rowlist">' + orderRows + '</div></div>' +
      '<div style="display:grid;gap:18px">' +
        '<div class="panel"><div class="panel-head"><h2>Notes</h2></div><div class="panel-pad">' +
          '<div style="display:flex;gap:8px;margin-bottom:14px"><input id="noteInput" placeholder="Add an internal note…" style="flex:1;height:42px;border:1px solid var(--line-2);padding:0 12px;font:inherit;outline:none;background:var(--panel)"><button class="btn" type="button" id="addNote" style="min-height:42px">Add</button></div>' +
          '<div class="mo-timeline">' + notes + '</div></div></div>' +
        '<div class="panel"><div class="panel-head"><h2>Addresses</h2></div><div class="panel-pad mo-info">' + addrs + '</div></div>' +
      '</div></div>';

    var add = document.getElementById("addNote");
    if (add) add.addEventListener("click", function () {
      var v = document.getElementById("noteInput").value.trim(); if (!v) return;
      L.addCustomerNote(c.id || c.email, v, session.name || "Staff"); render();
    });
  }
  render();
})();
