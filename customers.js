/* Lunde V6/V7 — staff customers list */
(function () {
  var L = window.lunde, money = L.money;
  var state = { q: "" };
  var newPanel = document.getElementById("custNewPanel");
  var newToggle = document.getElementById("custNewToggle");

  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }

  function keyOf(c) {
    var em = String(c.email || "").toLowerCase();
    return em || (c.id ? "id:" + c.id : "");
  }
  function buildList() {
    var map = {}, byId = {};
    L.customers().forEach(function (c) {
      var key = keyOf(c); if (!key) return;
      if (c.id) byId[c.id] = c;
      map[key] = { name: c.name || c.email || "Unnamed customer", company: c.company || "", email: c.email || "", phone: c.phone || "", id: c.id || "", account: true, orders: 0, ltv: 0, last: c.createdAt || 0 };
    });
    L.orders().forEach(function (o) {
      var cust = o.customer || {};
      var key = "";
      var cid = o.checkout && o.checkout.customerId;
      if (cid && byId[cid]) key = keyOf(byId[cid]);
      if (!key) key = String(cust.email || "").toLowerCase();
      if (!key) return;
      if (!map[key]) map[key] = { name: cust.name || cust.email || "Guest", company: cust.company || "", email: cust.email || "", phone: cust.phone || "", id: "", account: false, orders: 0, ltv: 0, last: 0 };
      var rec = map[key];
      rec.orders++;
      if (o.status !== "cancelled") rec.ltv += (o.totals && o.totals.total || 0);
      if (o.createdAt > rec.last) rec.last = o.createdAt;
      if (!rec.name && cust.name) rec.name = cust.name;
      if (!rec.phone && cust.phone) rec.phone = cust.phone;
    });
    return Object.values(map).sort(function (a, b) { return b.ltv - a.ltv; });
  }
  var list = buildList();

  function fmt(ts) { return ts ? new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"; }
  function initials(n) { return (n || "?").split(" ").map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase(); }
  function ic(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' + p + '</svg>'; }

  function renderKpis() {
    var totalLtv = list.reduce(function (s, c) { return s + c.ltv; }, 0);
    var totalOrders = list.reduce(function (s, c) { return s + c.orders; }, 0);
    document.getElementById("custKpis").innerHTML =
      '<div class="kpi"><span class="kpi-ic" data-tone="blue">' + ic('<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/>') + '</span><span class="kpi-num">' + list.length + '</span><span class="kpi-label">Customers</span></div>' +
      '<div class="kpi"><span class="kpi-ic" data-tone="green">' + ic('<path d="M4 20V4M4 20h16"/><path d="M7 14l4-4 3 3 5-6"/>') + '</span><span class="kpi-num">' + money(totalLtv) + '</span><span class="kpi-label">Lifetime value</span></div>' +
      '<div class="kpi"><span class="kpi-ic" data-tone="amber">' + ic('<path d="M6 4h12l1 16H5L6 4Z"/>') + '</span><span class="kpi-num">' + totalOrders + '</span><span class="kpi-label">Total orders</span></div>' +
      '<div class="kpi"><span class="kpi-ic" data-tone="violet">' + ic('<rect x="4" y="5" width="16" height="14"/><path d="M4 9h16"/>') + '</span><span class="kpi-num">' + list.filter(function (c) { return c.account; }).length + '</span><span class="kpi-label">Accounts</span></div>';
  }

  function render() {
    var q = state.q.trim().toLowerCase();
    var items = list.filter(function (c) { return !q || (c.name + " " + c.email + " " + c.company + " " + c.phone).toLowerCase().indexOf(q) > -1; });
    document.getElementById("custTable").innerHTML =
      '<div class="tbl-head" style="grid-template-columns:44px 1.6fr 0.7fr 0.9fr 0.9fr"><span></span><span>Customer</span><span>Orders</span><span>Last order</span><span style="text-align:right">Lifetime value</span></div>' +
      (items.length ? items.map(function (c) {
        var sub = [c.email, c.phone, c.company].filter(Boolean).map(esc).join(" · ");
        return '<a class="tbl-row" href="./customer-profile.html?id=' + encodeURIComponent(c.id || c.email) + '" style="grid-template-columns:44px 1.6fr 0.7fr 0.9fr 0.9fr">' +
          '<span class="app-user" style="padding:0"><span class="av" style="background:var(--accent)">' + esc(initials(c.name)) + '</span></span>' +
          '<span><b>' + esc(c.name) + '</b>' + (c.account ? ' <span class="status-badge" style="padding:2px 7px;font-size:9px">Account</span>' : '') + '<br><span class="row-sub">' + (sub || "No contact details") + '</span></span>' +
          '<span class="tabnum">' + c.orders + '</span>' +
          '<span class="row-sub">' + fmt(c.last) + '</span>' +
          '<span class="tabnum" style="text-align:right;font-weight:600">' + money(c.ltv) + '</span></a>';
      }).join("") : '<div class="app-empty"><h3>No customers</h3></div>');
  }

  /* new customer */
  newToggle.addEventListener("click", function () {
    newPanel.hidden = !newPanel.hidden;
    newToggle.textContent = newPanel.hidden ? "New customer" : "Close";
    if (!newPanel.hidden) document.getElementById("ncName").focus();
  });
  document.getElementById("ncCancel").addEventListener("click", function () {
    newPanel.hidden = true;
    newToggle.textContent = "New customer";
  });
  document.getElementById("ncSave").addEventListener("click", function () {
    var name = document.getElementById("ncName").value.trim();
    if (!name) { if (L.showToast) L.showToast("Name is required"); document.getElementById("ncName").focus(); return; }
    var rec = L.updateCustomerProfile("", {
      name: name,
      phone: document.getElementById("ncPhone").value.trim(),
      email: document.getElementById("ncEmail").value.trim(),
      company: document.getElementById("ncCompany").value.trim()
    });
    if (rec && rec.id) {
      if (L.showToast) L.showToast("Customer created");
      location.href = "./customer-profile.html?id=" + encodeURIComponent(rec.id);
    } else if (L.showToast) L.showToast("Could not create the customer");
  });

  document.getElementById("custSearch").addEventListener("input", function () { state.q = this.value; render(); });

  /* fresh data from the server: rebuild, but never while the form is open */
  document.addEventListener("lunde:synced", function () {
    if (!newPanel.hidden) return;
    list = buildList();
    renderKpis();
    render();
  });

  renderKpis();
  render();
})();
