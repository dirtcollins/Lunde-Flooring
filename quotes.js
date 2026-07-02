/* Lunde V6/V7 — staff quotes */
(function () {
  var L = window.lunde, money = L.money, productById = L.productById, cartonsFor = L.cartonsFor, cartonPrice = L.cartonPrice, materialEstimate = L.materialEstimate;
  var listEl = document.getElementById("quotesList");

  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function ago(ts) { var s = (Date.now() - ts) / 1000; if (s < 86400) return Math.round(s / 3600) + "h ago"; return Math.round(s / 86400) + "d ago"; }
  function ic(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' + p + '</svg>'; }

  function lineMarkup(q) {
    return Object.keys(q.items || {}).map(function (id) {
      var p = productById(id); if (!p) return ""; var e = q.items[id]; var out = "";
      if (e.sqft > 0) out += '<div class="row" style="grid-template-columns:40px 1fr auto"><span class="row-thumb" style="width:40px;height:40px;background-image:url(\'' + window.lunde.thumb(p.mainImage) + '\')"></span><span><span class="row-title">' + p.title + '</span><span class="row-sub">' + cartonsFor(p, e.sqft) + ' cartons · ' + e.sqft + ' sq. ft.</span></span><span class="row-strong">' + money(materialEstimate(p, e.sqft)) + '</span></div>';
      if ((e.samples || 0) > 0) out += '<div class="row" style="grid-template-columns:40px 1fr auto"><span class="row-thumb" style="width:40px;height:40px;background-image:url(\'' + window.lunde.thumb(p.mainImage) + '\')"></span><span><span class="row-title">' + p.title + ' sample</span><span class="row-sub">' + e.samples + ' × ' + money(p.samplePrice) + '</span></span><span class="row-strong">' + money(e.samples * p.samplePrice) + '</span></div>';
      return out;
    }).join("");
  }

  function render() {
    var qs = L.quotes().slice().sort(function (a, b) { return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt); });
    var openCount = qs.filter(function (q) { return q.status !== "won"; }).length;
    var openValue = qs.filter(function (q) { return q.status !== "won"; }).reduce(function (s, q) { return s + L.cartTotals(q.items || {}).subtotal; }, 0);
    document.getElementById("quoteKpis").innerHTML =
      '<div class="kpi"><span class="kpi-ic" data-tone="violet">' + ic('<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5"/>') + '</span><span class="kpi-num">' + qs.length + '</span><span class="kpi-label">Saved quotes</span></div>' +
      '<div class="kpi"><span class="kpi-ic" data-tone="amber">' + ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>') + '</span><span class="kpi-num">' + openCount + '</span><span class="kpi-label">Open</span></div>' +
      '<div class="kpi"><span class="kpi-ic" data-tone="green">' + ic('<path d="M4 20V4M4 20h16"/>') + '</span><span class="kpi-num">' + money(openValue) + '</span><span class="kpi-label">Pipeline value</span></div>' +
      '<div class="kpi"><span class="kpi-ic" data-tone="blue">' + ic('<path d="M5 13l4 4L19 7"/>') + '</span><span class="kpi-num">' + qs.filter(function (q) { return q.status === "won"; }).length + '</span><span class="kpi-label">Converted</span></div>';

    listEl.innerHTML = qs.length ? qs.map(function (q, i) {
      var t = L.cartTotals(q.items || {});
      var who = q.customer && (q.customer.company || q.customer.name) ? esc(q.customer.company || q.customer.name) : "No customer attached";
      return '<details class="acct-quote"' + (i === 0 ? ' open' : '') + ' data-screen-label="Quote ' + q.id + '"><summary><div class="acct-order-lead"><div><span class="acct-id">' + esc(q.job || "Saved quote") + '</span><span class="acct-when">' + q.id + ' · ' + who + ' · ' + ago(q.updatedAt || q.createdAt) + '</span></div></div>' +
        '<div style="display:flex;align-items:center;gap:14px"><span class="status-badge" data-status="' + (q.status === "won" ? "delivered" : "placed") + '"><i></i>' + (q.status === "won" ? "Converted" : "Saved") + '</span><strong class="acct-total">' + money(t.subtotal) + '</strong></div></summary>' +
        '<div class="acct-quote-body"><div class="rowlist" style="margin:6px 0 14px">' + lineMarkup(q) + '</div>' +
        (q.notes ? '<p class="row-sub" style="margin-bottom:14px">' + esc(q.notes) + '</p>' : '') +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' + (q.status === "won" ? '' : '<button class="btn" type="button" data-convert="' + q.id + '" style="min-height:42px">Convert to order</button>') + '<button class="btn ghost" type="button" data-del="' + q.id + '" style="min-height:42px">Delete</button></div></div></details>';
    }).join("") : '<div class="app-empty"><h3>No quotes yet</h3><p>Saved quotes from the storefront appear here.</p></div>';
  }

  listEl.addEventListener("click", function (e) {
    var conv = e.target.closest("[data-convert]");
    if (conv) {
      var q = L.quoteById(conv.dataset.convert); if (!q) return;
      var order = { id: L.newOrderId(), createdAt: Date.now(), status: "placed", history: [{ status: "placed", at: Date.now() }], items: q.items, totals: L.cartTotals(q.items || {}, "delivery", "curb", ""), checkout: { mode: "staff", customerId: q.customerId || "" }, delivery: { method: "delivery", address: q.customer && q.customer.address || "" }, customer: q.customer || {}, payment: {} };
      L.saveOrder(order); L.updateQuote(q.id, { status: "won" });
      if (L.showToast) L.showToast("Quote converted to order " + order.id);
      render(); return;
    }
    var del = e.target.closest("[data-del]");
    if (del && confirm("Delete this quote?")) { L.deleteQuote(del.dataset.del); render(); }
  });
  render();
})();
