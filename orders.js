/* Lunde V6/V7 — staff orders list */
(function () {
  var L = window.lunde, money = L.money, STATUS_LABELS = L.STATUS_LABELS, productById = L.productById;
  var state = { filter: "all", q: "" };
  var chipsEl = document.getElementById("orderChips");
  var tableEl = document.getElementById("orderTable");
  var FILTERS = ["all", "today", "placed", "processing", "shipped", "delivered", "cancelled"];

  var TRUCK_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 7h11v9H1zM12 10h4.5l3.5 3.5V16h-8"></path><circle cx="6" cy="18" r="1.7"></circle><circle cx="16.5" cy="18" r="1.7"></circle></svg>';
  var PICKUP_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9l2-5h12l2 5M4 9v11h16V9M9 20v-6h6v6"></path></svg>';

  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function ago(ts) { var s = (Date.now() - ts) / 1000; if (s < 3600) return Math.round(s / 60) + "m"; if (s < 86400) return Math.round(s / 3600) + "h"; return Math.round(s / 86400) + "d"; }
  function fmt(ts) { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  function thumb(o) { var p = Object.keys(o.items || {}).map(function (id) { return productById(id); }).filter(Boolean)[0]; return p ? window.lunde.thumb(p.mainImage) : ""; }
  function itemCount(o) { var n = Object.keys(o.items || {}).length; return n + " item" + (n === 1 ? "" : "s"); }
  function todayYmd() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function schedFmt(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || "");
    if (!m) return "";
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  function winLabel(w) { return w === "morning" ? "Morning" : w === "afternoon" ? "Afternoon" : ""; }

  function deliveryLine(o) {
    var d = o.delivery || {};
    var pickup = d.method === "pickup";
    var label;
    if (d.date && schedFmt(d.date)) {
      label = schedFmt(d.date);
      var w = winLabel(d.window);
      if (w) label += " · " + w;
    } else {
      label = pickup ? "Pickup" : "Delivery";
    }
    return '<span class="row-sub ord-del" title="' + (pickup ? "Warehouse pickup" : "Curbside delivery") + '">' +
      (pickup ? PICKUP_SVG : TRUCK_SVG) + '<span>' + esc(label) + '</span></span>';
  }

  function all() { return L.orders().slice().sort(function (a, b) { return b.createdAt - a.createdAt; }); }
  function haystack(o) {
    var s = o.id + " " + (o.customer && o.customer.name || "") + " " + (o.customer && o.customer.email || "") + " " + (o.customer && o.customer.company || "");
    Object.keys(o.items || {}).forEach(function (pid) {
      var p = productById(pid);
      if (p) s += " " + (p.title || "") + " " + (p.sku || "");
    });
    return s.toLowerCase();
  }
  function filtered() {
    var q = state.q.trim().toLowerCase();
    var today = todayYmd();
    return all().filter(function (o) {
      if (state.filter === "today") {
        if (!(o.delivery && o.delivery.date === today)) return false;
      } else if (state.filter !== "all" && o.status !== state.filter) {
        return false;
      }
      if (!q) return true;
      return haystack(o).indexOf(q) > -1;
    });
  }

  function renderChips() {
    var counts = {}, todayCount = 0, today = todayYmd();
    all().forEach(function (o) {
      counts[o.status] = (counts[o.status] || 0) + 1;
      if (o.delivery && o.delivery.date === today) todayCount += 1;
    });
    chipsEl.innerHTML = FILTERS.map(function (f) {
      var n = f === "all" ? all().length : f === "today" ? todayCount : (counts[f] || 0);
      var label = f === "all" ? "All" : f === "today" ? "Today's deliveries" : STATUS_LABELS[f];
      return '<button class="chip" type="button" data-filter="' + f + '" aria-pressed="' + (state.filter === f) + '">' + label + ' <b>' + n + '</b></button>';
    }).join("");
  }
  function render() {
    var items = filtered();
    tableEl.innerHTML =
      '<div class="tbl-head" style="grid-template-columns:44px 1.4fr 0.9fr 1fr 0.9fr 0.7fr">' +
        '<span></span><span>Order</span><span>Items</span><span>Date · Delivery</span><span>Status</span><span style="text-align:right">Total</span></div>' +
      (items.length ? items.map(function (o) {
        return '<a class="tbl-row ord-row" href="./order.html?id=' + encodeURIComponent(o.id) + '" style="grid-template-columns:44px 1.4fr 0.9fr 1fr 0.9fr 0.7fr">' +
          '<span class="row-thumb oc-thumb" style="background-image:url(\'' + thumb(o) + '\')"></span>' +
          '<span class="oc-main"><b>' + esc(o.id) + '</b><br><span class="row-sub">' + esc(o.customer && o.customer.name || "Guest") + '</span></span>' +
          '<span class="row-sub oc-items">' + itemCount(o) + '</span>' +
          '<span class="oc-date"><span class="row-sub">' + fmt(o.createdAt) + ' · ' + ago(o.createdAt) + ' ago</span><br>' + deliveryLine(o) + '</span>' +
          '<span class="oc-status"><span class="status-badge" data-status="' + esc(o.status) + '"><i></i>' + (STATUS_LABELS[o.status] || esc(o.status)) + '</span></span>' +
          '<span class="tabnum oc-total" style="text-align:right;font-weight:600">' + money(o.totals.total) + '</span></a>';
      }).join("") : '<div class="app-empty"><h3>No orders</h3><p>Nothing matches this filter.</p></div>');
  }
  chipsEl.addEventListener("click", function (e) { var b = e.target.closest("[data-filter]"); if (!b) return; state.filter = b.dataset.filter; renderChips(); render(); });
  document.getElementById("orderSearch").addEventListener("input", function () { state.q = this.value; render(); });
  /* Fresh-data contract: re-render on background sync, keeping scroll position.
     The search input lives outside the re-rendered region, so typed text and focus survive. */
  document.addEventListener("lunde:synced", function () {
    var sy = window.scrollY;
    renderChips(); render();
    window.scrollTo(0, sy);
  });
  renderChips(); render();
})();
