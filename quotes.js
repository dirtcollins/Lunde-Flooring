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

  /* ---------- quote builder ---------- */
  var qbPanel = document.getElementById("qbPanel");
  var qbBody = document.getElementById("qbBody");
  var qbLines = [];

  function products() { return window.LUNDE_PUBLIC_PRODUCTS || window.LUNDE_PRODUCTS || []; }
  function qbItems() {
    var items = {};
    qbLines.forEach(function (ln) {
      if (ln.productId && ln.sqft > 0) {
        items[ln.productId] = { sqft: (items[ln.productId] ? items[ln.productId].sqft : 0) + ln.sqft, samples: 0 };
      }
    });
    return items;
  }
  function qbLineCalc(ln) {
    var p = ln.productId && productById(ln.productId);
    if (!p || !(ln.sqft > 0)) return "—";
    return cartonsFor(p, ln.sqft) + " cartons · " + money(materialEstimate(p, ln.sqft));
  }
  function renderBuilder() {
    var custOptions = '<option value="">Guest / manual entry</option>' + (L.customers ? L.customers() : []).map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.name || c.email) + (c.company ? " — " + esc(c.company) : "") + '</option>';
    }).join("");
    var lines = qbLines.map(function (ln, i) {
      var opts = '<option value="">Choose a floor…</option>' + products().map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (p.id === ln.productId ? " selected" : "") + '>' + esc(p.title) + ' — ' + money(p.pricePerSqft) + '/sq ft</option>';
      }).join("");
      return '<div class="qb-line">' +
        '<label class="qb-field"><span>Floor</span><select data-qb-product="' + i + '">' + opts + '</select></label>' +
        '<label class="qb-field"><span>Sq. ft.</span><input type="number" min="0" step="1" value="' + (ln.sqft || "") + '" data-qb-sqft="' + i + '"></label>' +
        '<span class="calc">' + qbLineCalc(ln) + '</span>' +
        '<button class="rm" type="button" data-qb-rm="' + i + '">Remove</button></div>';
    }).join("");
    var t = L.cartTotals(qbItems());
    qbBody.innerHTML =
      '<div class="qb-grid2">' +
        '<label class="qb-field"><span>Customer</span><select id="qbCustomer">' + custOptions + '</select></label>' +
        '<label class="qb-field"><span>Job name</span><input id="qbJob" placeholder="e.g. Kitchen remodel" value="' + esc(qbJobVal) + '"></label>' +
      '</div>' +
      '<div class="qb-grid2" id="qbGuestRow"' + (qbCustomerVal ? ' hidden' : '') + '>' +
        '<label class="qb-field"><span>Customer name</span><input id="qbGuestName" value="' + esc(qbGuestName) + '"></label>' +
        '<label class="qb-field"><span>Customer email</span><input id="qbGuestEmail" type="email" value="' + esc(qbGuestEmail) + '"></label>' +
      '</div>' +
      lines +
      '<div><button class="btn ghost" type="button" id="qbAddLine" style="min-height:40px">+ Add floor</button></div>' +
      '<label class="qb-field"><span>Notes (shown on the quote)</span><textarea id="qbNotes">' + esc(qbNotesVal) + '</textarea></label>' +
      '<div class="qb-total"><span>Quote subtotal</span><span>' + money(t.subtotal) + '</span></div>' +
      '<div style="display:flex;gap:10px"><button class="btn" type="button" id="qbSave">Save quote</button><button class="btn ghost" type="button" id="qbCancel">Cancel</button></div>';
    document.getElementById("qbCustomer").value = qbCustomerVal;
  }
  var qbCustomerVal = "", qbJobVal = "", qbNotesVal = "", qbGuestName = "", qbGuestEmail = "";
  function qbSnapshot() {
    qbCustomerVal = document.getElementById("qbCustomer").value;
    qbJobVal = document.getElementById("qbJob").value;
    qbNotesVal = document.getElementById("qbNotes").value;
    qbGuestName = document.getElementById("qbGuestName").value;
    qbGuestEmail = document.getElementById("qbGuestEmail").value;
  }
  function qbReset() { qbLines = [{ productId: "", sqft: 0 }]; qbCustomerVal = qbJobVal = qbNotesVal = qbGuestName = qbGuestEmail = ""; }

  document.getElementById("qbToggle").addEventListener("click", function () {
    if (qbPanel.hidden) { qbReset(); renderBuilder(); }
    qbPanel.hidden = !qbPanel.hidden;
    this.textContent = qbPanel.hidden ? "New quote" : "Close builder";
  });

  qbBody.addEventListener("change", function (e) {
    qbSnapshot();
    var pSel = e.target.closest("[data-qb-product]");
    if (pSel) qbLines[Number(pSel.dataset.qbProduct)].productId = pSel.value;
    var sq = e.target.closest("[data-qb-sqft]");
    if (sq) qbLines[Number(sq.dataset.qbSqft)].sqft = Math.max(0, Number(sq.value) || 0);
    if (e.target.id === "qbCustomer") document.getElementById("qbGuestRow").hidden = !!e.target.value;
    if (pSel || sq) renderBuilder();
  });

  qbBody.addEventListener("click", function (e) {
    if (e.target.id === "qbAddLine") { qbSnapshot(); qbLines.push({ productId: "", sqft: 0 }); renderBuilder(); return; }
    if (e.target.id === "qbCancel") { qbPanel.hidden = true; document.getElementById("qbToggle").textContent = "New quote"; return; }
    var rm = e.target.closest("[data-qb-rm]");
    if (rm) { qbSnapshot(); qbLines.splice(Number(rm.dataset.qbRm), 1); if (!qbLines.length) qbLines.push({ productId: "", sqft: 0 }); renderBuilder(); return; }
    if (e.target.id === "qbSave") {
      qbSnapshot();
      var items = qbItems();
      if (!Object.keys(items).length) { if (L.showToast) L.showToast("Add at least one floor with square footage"); return; }
      var rec = qbCustomerVal && L.customerById ? L.customerById(qbCustomerVal) : null;
      var customer = rec
        ? { name: rec.name || "", company: rec.company || "", email: rec.email || "", phone: rec.phone || "" }
        : { name: qbGuestName.trim(), company: "", email: qbGuestEmail.trim(), phone: "" };
      var q = L.saveQuoteFromCart(qbJobVal.trim() || "Staff quote", { items: items, customer: customer, customerId: rec ? rec.id : "", notes: qbNotesVal.trim() });
      if (q) {
        if (L.showToast) L.showToast("Quote " + q.id + " saved");
        qbPanel.hidden = true; document.getElementById("qbToggle").textContent = "New quote";
        render();
      }
    }
  });

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
