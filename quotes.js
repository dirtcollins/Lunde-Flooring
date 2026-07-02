/* Lunde V6/V7 — staff quotes */
(function () {
  var L = window.lunde, money = L.money, productById = L.productById, cartonsFor = L.cartonsFor, materialEstimate = L.materialEstimate;
  var listEl = document.getElementById("quotesList");
  var chipsEl = document.getElementById("qChips");
  var searchEl = document.getElementById("qSearch");
  var state = { q: "", chip: "open" };
  var convertId = "";      /* quote id with the convert confirm panel open */
  var openIds = null;      /* which <details> are expanded; null = first render */

  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function ago(ts) { var s = (Date.now() - ts) / 1000; if (s < 86400) return Math.round(s / 3600) + "h ago"; return Math.round(s / 86400) + "d ago"; }
  function fmt(ts) { return ts ? new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""; }
  function ic(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' + p + '</svg>'; }

  function isExpired(q) { return !!q.expiresAt && q.expiresAt < Date.now() && q.status !== "won"; }
  function statusInfo(q) {
    if (q.status === "won") return { label: "Converted", ds: "delivered" };
    if (isExpired(q)) return { label: "Expired", ds: "cancelled" };
    if (q.status === "sent") return { label: "Sent" + (q.sentAt ? " " + fmt(q.sentAt) : ""), ds: "shipped" };
    return { label: "Saved", ds: "placed" };
  }

  function lineMarkup(q) {
    return Object.keys(q.items || {}).map(function (id) {
      var p = productById(id); if (!p) return ""; var e = q.items[id]; var out = "";
      if (e.sqft > 0) out += '<div class="row" style="grid-template-columns:40px 1fr auto"><span class="row-thumb" style="width:40px;height:40px;background-image:url(\'' + window.lunde.thumb(p.mainImage) + '\')"></span><span><span class="row-title">' + esc(p.title) + '</span><span class="row-sub">' + cartonsFor(p, e.sqft) + ' cartons · ' + e.sqft + ' sq. ft.</span></span><span class="row-strong">' + money(materialEstimate(p, e.sqft)) + '</span></div>';
      if ((e.samples || 0) > 0) out += '<div class="row" style="grid-template-columns:40px 1fr auto"><span class="row-thumb" style="width:40px;height:40px;background-image:url(\'' + window.lunde.thumb(p.mainImage) + '\')"></span><span><span class="row-title">' + esc(p.title) + ' sample</span><span class="row-sub">' + e.samples + ' × ' + money(p.samplePrice) + '</span></span><span class="row-strong">' + money(e.samples * p.samplePrice) + '</span></div>';
      return out;
    }).join("");
  }

  /* ---------- convert confirm panel ---------- */

  function quoteTerms(q) {
    var rec = q.customerId ? L.customerById(q.customerId) : null;
    return (rec && rec.profile && rec.profile.paymentTerms) || "";
  }
  function convertAddress(q) {
    if (q.customerId && L.customerAddresses) {
      var addrs = L.customerAddresses(q.customerId);
      var def = null;
      for (var i = 0; i < addrs.length; i++) { if (addrs[i].isDefault) { def = addrs[i]; break; } }
      if (!def && addrs.length) def = addrs[0];
      if (def) return L.formatAddress ? L.formatAddress(def) : [def.line1, def.city, def.state, def.zip].filter(Boolean).join(", ");
    }
    return (q.customer && q.customer.address) || "";
  }
  function convertMarkup(q) {
    var terms = quoteTerms(q);
    var note = terms ? "Invoice — " + terms : "Collect at pickup/delivery";
    return '<div class="qc-convert" data-convert-form="' + esc(q.id) + '"><h4>Convert ' + esc(q.id) + ' to an order</h4>' +
      '<div class="qb-grid2">' +
        '<label class="qb-field"><span>Fulfillment</span><select data-cv-method><option value="delivery">Delivery</option><option value="pickup">Store pickup</option></select></label>' +
        '<label class="qb-field"><span>Payment note</span><input data-cv-note value="' + esc(note) + '"></label>' +
      '</div>' +
      '<label class="qb-field" data-cv-addr-wrap><span>Delivery address</span><input data-cv-address placeholder="Street, city, state, ZIP" value="' + esc(convertAddress(q)) + '"></label>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" type="button" data-cv-confirm="' + esc(q.id) + '" style="min-height:42px">Create order</button><button class="btn ghost" type="button" data-cv-cancel style="min-height:42px">Cancel</button></div></div>';
  }

  /* ---------- list ---------- */

  var CHIPS = [["open", "Open"], ["sent", "Sent"], ["won", "Converted"], ["all", "All"]];
  function chipMatch(q, chip) {
    if (chip === "all") return true;
    if (chip === "won") return q.status === "won";
    if (chip === "sent") return q.status === "sent";
    return q.status !== "won"; /* open = anything still in the pipeline */
  }
  function haystack(q) {
    var c = q.customer || {};
    return (String(q.job || "") + " " + String(q.id || "") + " " + String(c.name || "") + " " + String(c.company || "") + " " + String(c.email || "")).toLowerCase();
  }

  function captureOpen() {
    openIds = {};
    var nodes = listEl.querySelectorAll("details[data-qid]");
    for (var i = 0; i < nodes.length; i++) { if (nodes[i].open) openIds[nodes[i].getAttribute("data-qid")] = true; }
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

    chipsEl.innerHTML = CHIPS.map(function (c) {
      var n = qs.filter(function (q) { return chipMatch(q, c[0]); }).length;
      return '<button class="chip" type="button" data-chip="' + c[0] + '" aria-pressed="' + (state.chip === c[0]) + '">' + c[1] + ' <b>' + n + '</b></button>';
    }).join("");

    var term = state.q.trim().toLowerCase();
    var shown = qs.filter(function (q) { return chipMatch(q, state.chip) && (!term || haystack(q).indexOf(term) > -1); });

    listEl.innerHTML = shown.length ? shown.map(function (q, i) {
      var t = L.cartTotals(q.items || {});
      var who = q.customer && (q.customer.company || q.customer.name) ? esc(q.customer.company || q.customer.name) : "No customer attached";
      var st = statusInfo(q);
      var isOpen = openIds ? !!openIds[q.id] : i === 0;
      var actions = '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
        (q.status === "won" ? '' : '<button class="btn" type="button" data-convert="' + esc(q.id) + '" style="min-height:42px">Convert to order</button>') +
        (q.status === "won" ? '' : '<button class="btn ghost" type="button" data-send="' + esc(q.id) + '" style="min-height:42px">Email to customer</button>') +
        (q.status === "won" ? '' : '<button class="btn ghost" type="button" data-edit="' + esc(q.id) + '" style="min-height:42px">Edit</button>') +
        '<button class="btn ghost" type="button" data-dup="' + esc(q.id) + '" style="min-height:42px">Duplicate</button>' +
        '<button class="btn ghost" type="button" data-del="' + esc(q.id) + '" style="min-height:42px">Delete</button></div>';
      return '<details class="acct-quote" data-qid="' + esc(q.id) + '"' + (isOpen ? ' open' : '') + ' data-screen-label="Quote ' + esc(q.id) + '"><summary><div class="acct-order-lead"><div><span class="acct-id">' + esc(q.job || "Saved quote") + '</span><span class="acct-when">' + esc(q.id) + ' · ' + who + ' · ' + ago(q.updatedAt || q.createdAt) + '</span></div></div>' +
        '<div style="display:flex;align-items:center;gap:14px"><span class="status-badge" data-status="' + st.ds + '"><i></i>' + st.label + '</span><strong class="acct-total">' + money(t.subtotal) + '</strong></div></summary>' +
        '<div class="acct-quote-body"><div class="rowlist" style="margin:6px 0 14px">' + lineMarkup(q) + '</div>' +
        (q.notes ? '<p class="row-sub" style="margin-bottom:14px">' + esc(q.notes) + '</p>' : '') +
        actions + (convertId === q.id ? convertMarkup(q) : '') + '</div></details>';
    }).join("") : '<div class="app-empty"><h3>' + (qs.length ? "No matching quotes" : "No quotes yet") + '</h3><p>' + (qs.length ? "Try a different search or filter." : "Saved quotes from the storefront appear here.") + '</p></div>';
  }

  /* ---------- list actions ---------- */

  listEl.addEventListener("click", function (e) {
    var conv = e.target.closest("[data-convert]");
    if (conv) {
      convertId = convertId === conv.dataset.convert ? "" : conv.dataset.convert;
      captureOpen(); if (convertId) openIds[convertId] = true;
      render(); return;
    }
    if (e.target.closest("[data-cv-cancel]")) { convertId = ""; captureOpen(); render(); return; }
    var cvOk = e.target.closest("[data-cv-confirm]");
    if (cvOk) { confirmConvert(cvOk.dataset.cvConfirm); return; }
    var send = e.target.closest("[data-send]");
    if (send) { sendQuote(send); return; }
    var dup = e.target.closest("[data-dup]");
    if (dup) {
      var copy = L.duplicateQuote(dup.dataset.dup);
      if (copy) {
        captureOpen(); openIds[copy.id] = true;
        if (L.showToast) L.showToast("Duplicated as " + copy.id);
        render();
      }
      return;
    }
    var ed = e.target.closest("[data-edit]");
    if (ed) { location.href = "./quote-builder.html?edit=" + encodeURIComponent(ed.dataset.edit); return; }
    var del = e.target.closest("[data-del]");
    if (del && confirm("Delete this quote?")) {
      if (convertId === del.dataset.del) convertId = "";
      L.deleteQuote(del.dataset.del); captureOpen(); render();
    }
  });

  /* pickup needs no address — hide the field when selected */
  listEl.addEventListener("change", function (e) {
    var sel = e.target.closest("[data-cv-method]"); if (!sel) return;
    var box = sel.closest(".qc-convert");
    var wrap = box && box.querySelector("[data-cv-addr-wrap]");
    if (wrap) wrap.style.display = sel.value === "pickup" ? "none" : "";
  });

  function sendQuote(btn) {
    var q = L.quoteById(btn.dataset.send); if (!q) return;
    if (!(q.customer && String(q.customer.email || "").trim())) {
      if (L.showToast) L.showToast("No customer email on this quote — add one via Edit first");
      return;
    }
    btn.disabled = true; btn.textContent = "Sending…";
    L.sendQuoteToCustomer(q.id).then(function (res) {
      if (res && res.ok) {
        if (L.showToast) L.showToast("Quote emailed to " + q.customer.email);
      } else {
        if (L.showToast) L.showToast((res && res.error) || "Could not send the quote");
      }
      captureOpen(); render();
    });
  }

  function confirmConvert(id) {
    var q = L.quoteById(id); if (!q || q.status === "won") return;
    var form = listEl.querySelector('[data-convert-form="' + id + '"]'); if (!form) return;
    var method = form.querySelector("[data-cv-method]").value === "pickup" ? "pickup" : "delivery";
    var address = form.querySelector("[data-cv-address]").value.trim();
    var note = form.querySelector("[data-cv-note]").value.trim();
    if (method === "delivery" && !address) { if (L.showToast) L.showToast("Enter a delivery address (or switch to pickup)"); return; }
    var terms = quoteTerms(q);
    var payment = terms ? { method: "invoice", terms: terms } : {};
    if (note) payment.note = note;
    var order = {
      id: L.newOrderId(), createdAt: Date.now(), status: "placed",
      history: [{ status: "placed", at: Date.now() }],
      items: q.items,
      totals: L.cartTotals(q.items || {}, method, "curb", ""),
      checkout: { mode: "staff", customerId: q.customerId || "" },
      delivery: { method: method, address: method === "pickup" ? "" : address },
      customer: q.customer || {},
      payment: payment
    };
    L.saveOrder(order);
    L.updateQuote(q.id, { status: "won" });
    convertId = "";
    if (L.showToast) L.showToast("Quote converted to order " + order.id);
    captureOpen(); render();
  }

  /* ---------- search / chips / fresh-data ---------- */

  searchEl.addEventListener("input", function () { state.q = this.value; captureOpen(); render(); });
  chipsEl.addEventListener("click", function (e) {
    var c = e.target.closest("[data-chip]"); if (!c) return;
    state.chip = c.dataset.chip; captureOpen(); render();
  });

  document.addEventListener("lunde:synced", function () {
    if (convertId) return; /* don't clobber an in-progress convert */
    captureOpen(); render();
  });

  render();

  /* legacy deep link: quotes.html?customer=… now goes to the builder page */
  var preCust = new URLSearchParams(location.search).get("customer");
  if (preCust) location.replace("./quote-builder.html?customer=" + encodeURIComponent(preCust));
})();
