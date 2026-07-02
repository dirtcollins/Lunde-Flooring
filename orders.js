/* Lunde V6/V7 — staff orders list */
(function () {
  var L = window.lunde, money = L.money, STATUS_LABELS = L.STATUS_LABELS, productById = L.productById;
  var state = { filter: "all", q: "" };
  var chipsEl = document.getElementById("orderChips");
  var tableEl = document.getElementById("orderTable");
  var FILTERS = ["all", "placed", "processing", "shipped", "delivered", "cancelled"];

  function ago(ts) { var s = (Date.now() - ts) / 1000; if (s < 3600) return Math.round(s / 60) + "m"; if (s < 86400) return Math.round(s / 3600) + "h"; return Math.round(s / 86400) + "d"; }
  function fmt(ts) { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  function thumb(o) { var p = Object.keys(o.items || {}).map(function (id) { return productById(id); }).filter(Boolean)[0]; return p ? window.lunde.thumb(p.mainImage) : ""; }
  function itemCount(o) { var n = Object.keys(o.items || {}).length; return n + " item" + (n === 1 ? "" : "s"); }

  function all() { return L.orders().slice().sort(function (a, b) { return b.createdAt - a.createdAt; }); }
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return all().filter(function (o) {
      if (state.filter !== "all" && o.status !== state.filter) return false;
      if (!q) return true;
      return (o.id + " " + (o.customer && o.customer.name || "") + " " + (o.customer && o.customer.email || "") + " " + (o.customer && o.customer.company || "")).toLowerCase().indexOf(q) > -1;
    });
  }

  function renderChips() {
    var counts = {}; all().forEach(function (o) { counts[o.status] = (counts[o.status] || 0) + 1; });
    chipsEl.innerHTML = FILTERS.map(function (f) {
      var n = f === "all" ? all().length : (counts[f] || 0);
      var label = f === "all" ? "All" : STATUS_LABELS[f];
      return '<button class="chip" type="button" data-filter="' + f + '" aria-pressed="' + (state.filter === f) + '">' + label + ' <b>' + n + '</b></button>';
    }).join("");
  }
  function render() {
    var items = filtered();
    tableEl.innerHTML =
      '<div class="tbl-head" style="grid-template-columns:44px 1.4fr 1fr 0.7fr 0.9fr 0.7fr">' +
        '<span></span><span>Order</span><span>Items</span><span>Date</span><span>Status</span><span style="text-align:right">Total</span></div>' +
      (items.length ? items.map(function (o) {
        return '<a class="tbl-row" href="./order.html?id=' + encodeURIComponent(o.id) + '" style="grid-template-columns:44px 1.4fr 1fr 0.7fr 0.9fr 0.7fr">' +
          '<span class="row-thumb" style="background-image:url(\'' + thumb(o) + '\')"></span>' +
          '<span><b>' + o.id + '</b><br><span class="row-sub">' + (o.customer && o.customer.name || "Guest") + '</span></span>' +
          '<span class="row-sub">' + itemCount(o) + '</span>' +
          '<span class="row-sub">' + fmt(o.createdAt) + ' · ' + ago(o.createdAt) + ' ago</span>' +
          '<span><span class="status-badge" data-status="' + o.status + '"><i></i>' + STATUS_LABELS[o.status] + '</span></span>' +
          '<span class="tabnum" style="text-align:right;font-weight:600">' + money(o.totals.total) + '</span></a>';
      }).join("") : '<div class="app-empty"><h3>No orders</h3><p>Nothing matches this filter.</p></div>');
  }
  chipsEl.addEventListener("click", function (e) { var b = e.target.closest("[data-filter]"); if (!b) return; state.filter = b.dataset.filter; renderChips(); render(); });
  document.getElementById("orderSearch").addEventListener("input", function () { state.q = this.value; render(); });
  renderChips(); render();
})();
