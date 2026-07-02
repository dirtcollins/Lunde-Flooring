/* Lunde V6/V7 — staff customers list */
(function () {
  var L = window.lunde, money = L.money;
  var state = { q: "" };

  function buildList() {
    var byEmail = {};
    L.customers().forEach(function (c) {
      var em = String(c.email || "").toLowerCase(); if (!em) return;
      byEmail[em] = { name: c.name || em, company: c.company || "", email: c.email, id: c.id, account: true, orders: 0, ltv: 0, last: c.createdAt || 0 };
    });
    L.orders().forEach(function (o) {
      var em = String(o.customer && o.customer.email || "").toLowerCase(); if (!em) return;
      if (!byEmail[em]) byEmail[em] = { name: o.customer.name || em, company: o.customer.company || "", email: o.customer.email, id: "", account: false, orders: 0, ltv: 0, last: 0 };
      byEmail[em].orders++;
      if (o.status !== "cancelled") byEmail[em].ltv += (o.totals.total || 0);
      if (o.createdAt > byEmail[em].last) byEmail[em].last = o.createdAt;
      if (!byEmail[em].name && o.customer.name) byEmail[em].name = o.customer.name;
    });
    return Object.values(byEmail).sort(function (a, b) { return b.ltv - a.ltv; });
  }
  var list = buildList();

  function fmt(ts) { return ts ? new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"; }
  function initials(n) { return (n || "?").split(" ").map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase(); }
  function ic(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' + p + '</svg>'; }

  var totalLtv = list.reduce(function (s, c) { return s + c.ltv; }, 0);
  var totalOrders = list.reduce(function (s, c) { return s + c.orders; }, 0);
  document.getElementById("custKpis").innerHTML =
    '<div class="kpi"><span class="kpi-ic" data-tone="blue">' + ic('<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/>') + '</span><span class="kpi-num">' + list.length + '</span><span class="kpi-label">Customers</span></div>' +
    '<div class="kpi"><span class="kpi-ic" data-tone="green">' + ic('<path d="M4 20V4M4 20h16"/><path d="M7 14l4-4 3 3 5-6"/>') + '</span><span class="kpi-num">' + money(totalLtv) + '</span><span class="kpi-label">Lifetime value</span></div>' +
    '<div class="kpi"><span class="kpi-ic" data-tone="amber">' + ic('<path d="M6 4h12l1 16H5L6 4Z"/>') + '</span><span class="kpi-num">' + totalOrders + '</span><span class="kpi-label">Total orders</span></div>' +
    '<div class="kpi"><span class="kpi-ic" data-tone="violet">' + ic('<rect x="4" y="5" width="16" height="14"/><path d="M4 9h16"/>') + '</span><span class="kpi-num">' + list.filter(function (c) { return c.account; }).length + '</span><span class="kpi-label">Accounts</span></div>';

  function render() {
    var q = state.q.trim().toLowerCase();
    var items = list.filter(function (c) { return !q || (c.name + " " + c.email + " " + c.company).toLowerCase().indexOf(q) > -1; });
    document.getElementById("custTable").innerHTML =
      '<div class="tbl-head" style="grid-template-columns:44px 1.6fr 0.7fr 0.9fr 0.9fr"><span></span><span>Customer</span><span>Orders</span><span>Last order</span><span style="text-align:right">Lifetime value</span></div>' +
      (items.length ? items.map(function (c) {
        return '<a class="tbl-row" href="./customer-profile.html?id=' + encodeURIComponent(c.email) + '" style="grid-template-columns:44px 1.6fr 0.7fr 0.9fr 0.9fr">' +
          '<span class="app-user" style="padding:0"><span class="av" style="background:var(--accent)">' + initials(c.name) + '</span></span>' +
          '<span><b>' + c.name + '</b>' + (c.account ? ' <span class="status-badge" style="padding:2px 7px;font-size:9px">Account</span>' : '') + '<br><span class="row-sub">' + c.email + (c.company ? ' · ' + c.company : '') + '</span></span>' +
          '<span class="tabnum">' + c.orders + '</span>' +
          '<span class="row-sub">' + fmt(c.last) + '</span>' +
          '<span class="tabnum" style="text-align:right;font-weight:600">' + money(c.ltv) + '</span></a>';
      }).join("") : '<div class="app-empty"><h3>No customers</h3></div>');
  }
  document.getElementById("custSearch").addEventListener("input", function () { state.q = this.value; render(); });
  render();
})();
