/* Lunde V6/V7 — staff order detail */
(function () {
  var L = window.lunde, money = L.money, productById = L.productById, cartonsFor = L.cartonsFor,
      materialEstimate = L.materialEstimate, cartonPrice = L.cartonPrice, STATUSES = L.STATUSES, STATUS_LABELS = L.STATUS_LABELS;
  var mount = document.getElementById("orderDetail");
  var id = new URLSearchParams(location.search).get("id");

  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function fmt(ts) { return new Date(ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); }
  function time(ts) { return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }

  function notesLog(raw) {
    var notes = L.coerceStaffNotes ? L.coerceStaffNotes(raw) : (Array.isArray(raw) ? raw : (raw ? [{ text: String(raw) }] : []));
    if (!notes.length) return '<p class="mo-note-empty">No internal notes yet.</p>';
    return notes.map(function (n) {
      var meta = [n.author, n.at ? time(n.at) : ""].filter(Boolean).join(" · ");
      return '<div class="mo-note"><p class="mo-note-text">' + esc(n.text || "") + '</p>' +
        (meta ? '<span class="mo-note-meta">' + esc(meta) + '</span>' : '') + '</div>';
    }).join("");
  }

  function render() {
    var o = id ? L.orderById(id) : null;
    if (!o) { mount.innerHTML = '<div class="app-head"><h1>Order not found</h1></div><a class="btn ghost" href="./orders.html">Back to orders</a>'; return; }

    var lines = "";
    Object.keys(o.items).forEach(function (pid) {
      var p = productById(pid); if (!p) return; var e = o.items[pid];
      if (e.sqft > 0) lines += '<div class="row" style="grid-template-columns:48px 1fr auto"><span class="row-thumb" style="width:48px;height:48px;background-image:url(\'' + window.lunde.thumb(p.mainImage) + '\')"></span><span><span class="row-title">' + p.title + '</span><span class="row-sub">' + cartonsFor(p, e.sqft) + ' cartons · ' + e.sqft + ' sq. ft. · ' + p.sku + '</span></span><span class="row-strong">' + money(materialEstimate(p, e.sqft)) + '</span></div>';
      if ((e.samples || 0) > 0) lines += '<div class="row" style="grid-template-columns:48px 1fr auto"><span class="row-thumb" style="width:48px;height:48px;background-image:url(\'' + window.lunde.thumb(p.mainImage) + '\')"></span><span><span class="row-title">' + p.title + ' — sample</span><span class="row-sub">' + e.samples + ' × ' + money(p.samplePrice) + '</span></span><span class="row-strong">' + money(e.samples * p.samplePrice) + '</span></div>';
    });

    var t = o.totals, d = o.delivery || {}, c = o.customer || {};
    var activeIdx = STATUSES.indexOf(o.status);
    var checkSvg = '<svg viewBox="0 0 14 14" fill="none"><path d="m3 7 2.5 2.5L11 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
    var stepper = o.status === "cancelled"
      ? '<div class="od-status-row"><span class="od-status-label">Order status</span><span class="status-badge" data-status="cancelled"><i></i>Cancelled</span></div><div class="od-cancelled-note">This order was cancelled.</div>'
      : '<ol class="od-stepper">' + STATUSES.map(function (s, i) {
          var cls = i < activeIdx ? "done" : i === activeIdx ? "current" : "";
          return '<li class="' + cls + '" data-set-status="' + s + '" title="Set status to ' + STATUS_LABELS[s] + '">' +
            '<span class="od-step-dot">' + (i < activeIdx ? checkSvg : "") + '</span>' +
            '<span class="od-step-name">' + STATUS_LABELS[s] + '</span></li>';
        }).join("") + '</ol>';

    var timeline = (o.history || []).slice().reverse().map(function (h) {
      return '<div class="mo-tl"><span><b>' + STATUS_LABELS[h.status] + '</b></span><span class="when">' + time(h.at) + '</span></div>';
    }).join("");

    var pay = o.payment || {};
    var acct = (o.checkout && o.checkout.customerId) ? L.customerById(o.checkout.customerId) : null;
    var terms = acct && acct.profile && acct.profile.paymentTerms;
    var netMatch = /net\s*(\d+)/i.exec(terms || "");
    var isInvoice = pay.method === "invoice" || !!netMatch;
    var netDays = netMatch ? parseInt(netMatch[1], 10) : 30;
    /* deterministic, stable fallbacks so older demo orders still read richly */
    var seedN = String(o.id).split("").reduce(function (a, ch) { return a + ch.charCodeAt(0); }, 0);
    var brands = ["Visa", "Mastercard", "American Express", "Discover"];
    var payBrand = pay.brand || brands[seedN % brands.length];
    var payLast4 = pay.last4 || String(1000 + (seedN % 9000));
    var payExp = pay.exp || ("0" + ((seedN % 9) + 1) + "/2" + (7 + (seedN % 2)));
    var payTxn = pay.txnId || ("ch_" + Math.abs((seedN * 2654435761) % 1e12).toString(36));
    var issuedAt = pay.paidAt || (o.history && o.history[0] && o.history[0].at) || o.createdAt;
    var dueAt = issuedAt + netDays * 86400000;
    var refunded = o.status === "cancelled" || !!pay.refundedAt;
    var invoicePaid = !!pay.paidAt || o.status === "delivered";
    var payState = refunded ? "refunded" : (isInvoice && !invoicePaid ? "awaiting" : "paid");
    var payBadge = payState === "refunded" ? "cancelled" : payState === "awaiting" ? "shipped" : "delivered";
    var payBadgeText = payState === "refunded" ? "Refunded" : payState === "awaiting" ? "Awaiting payment" : "Paid";
    var payMethod = isInvoice ? ("Invoice \u2014 " + (terms || ("Net " + netDays))) : (payBrand + " \u2022\u2022\u2022\u2022 " + payLast4);
    var invNo = "INV-" + (String(o.id).replace(/[^0-9]/g, "").slice(-6) || "000000");
    var payBilling = pay.billing || ((c.company ? c.company + " \u00b7 " : "") + (c.name || "Guest"));
    var payDetail = isInvoice
      ? '<div class="v6-sumrow"><span>Invoice #</span><b>' + invNo + '</b></div>' +
        '<div class="v6-sumrow"><span>Issued</span><b>' + fmt(issuedAt) + '</b></div>' +
        (payState === "awaiting"
          ? '<div class="v6-sumrow"><span>Due</span><b>' + fmt(dueAt) + '</b></div>'
          : '<div class="v6-sumrow"><span>' + (refunded ? "Refunded" : "Paid") + '</span><b>' + time(refunded ? (pay.refundedAt || issuedAt) : (pay.paidAt || issuedAt)) + '</b></div>')
      : '<div class="v6-sumrow"><span>Card expiry</span><b>' + payExp + '</b></div>' +
        '<div class="v6-sumrow"><span>' + (refunded ? "Refunded" : "Date paid") + '</span><b>' + time(refunded ? (pay.refundedAt || issuedAt) : issuedAt) + '</b></div>' +
        '<div class="v6-sumrow"><span>Transaction</span><b style="font-variant-numeric:normal;font-size:12.5px">' + payTxn + '</b></div>';
    var payActions = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">' +
      (payState === "awaiting" ? '<button class="btn" type="button" id="payMarkPaid" style="min-height:40px;padding:0 16px">Mark as paid</button>' : '') +
      (payState === "paid" ? '<button class="btn ghost" type="button" id="payRefund" style="min-height:40px;padding:0 16px">Record refund</button>' : '') +
      '<button class="btn ghost" type="button" id="payReceipt" style="min-height:40px;padding:0 16px">Resend receipt</button>' +
      '</div>';

    mount.innerHTML =
      '<a class="mo-back" href="./orders.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M19 12H5M11 6l-6 6 6 6"></path></svg>All orders</a>' +
      '<div class="app-head"><div><p class="eyebrow">Order ' + o.id + '</p><h1>' + (c.name || "Guest order") + '</h1><p>Placed ' + fmt(o.createdAt) + (c.project ? ' · ' + esc(c.project) : '') + '</p></div>' +
        '<span class="status-badge" data-status="' + o.status + '"><i></i>' + STATUS_LABELS[o.status] + '</span></div>' +

      '<div class="cols-2"><div style="display:grid;gap:18px">' +
        '<div class="panel"><div class="panel-head"><h2>Update status</h2></div><div class="panel-pad" id="statusChips">' + stepper +
          (o.status !== "cancelled" ? '<button class="btn ghost" type="button" id="cancelOrder" style="margin-top:18px;min-height:42px">Cancel order</button>' : '') + '</div></div>' +
        '<div class="panel"><div class="panel-head"><h2>Items</h2></div><div class="rowlist">' + lines + '</div></div>' +
        '<div class="panel"><div class="panel-head"><h2>Internal notes</h2></div><div class="panel-pad">' +
          '<div class="mo-notes">' + notesLog(o.staffNotes) + '</div>' +
          '<textarea id="staffNotes" rows="3" style="width:100%;border:1px solid var(--line-2);padding:12px;font:inherit;font-size:14px;outline:none;background:var(--panel)" placeholder="Add a note for the fulfillment team…"></textarea>' +
          '<button class="btn" type="button" id="saveNotes" style="margin-top:12px;min-height:42px">Add note</button></div></div>' +
      '</div><div style="display:grid;gap:18px">' +
        '<div class="panel"><div class="panel-head"><h2>Summary</h2></div><div class="panel-pad">' +
          '<div class="v6-sumrow"><span>Material</span><b>' + money(t.material) + '</b></div>' +
          '<div class="v6-sumrow"><span>Samples</span><b>' + money(t.samples) + '</b></div>' +
          (t.discount ? '<div class="v6-sumrow"><span>Discount</span><b>−' + money(t.discount) + '</b></div>' : '') +
          '<div class="v6-sumrow"><span>Freight</span><b>' + (t.freight ? money(t.freight) : "Free") + '</b></div>' +
          '<div class="v6-sumrow"><span>Tax</span><b>' + money(t.tax) + '</b></div>' +
          '<div class="v6-sumtotal"><span>Total</span><b>' + money(t.total) + '</b></div></div></div>' +
        '<div class="panel"><div class="panel-head"><h2>Payment</h2><span class="status-badge" data-status="' + payBadge + '"><i></i>' + payBadgeText + '</span></div><div class="panel-pad">' +
          '<div class="v6-sumrow"><span>Method</span><b>' + payMethod + '</b></div>' +
          payDetail +
          '<div class="v6-sumrow"><span>' + (refunded ? "Amount refunded" : "Amount") + '</span><b>' + money(t.total) + '</b></div>' +
          '<div class="v6-sumrow" style="align-items:flex-start"><span>Billing</span><b style="font-weight:600;text-align:right;max-width:62%">' + esc(payBilling) + '</b></div>' +
          payActions +
        '</div></div>' +
        '<div class="panel"><div class="panel-head"><h2>Delivery</h2></div><div class="panel-pad"><p style="font-size:14.5px;line-height:1.55">' +
          (d.method === "pickup" ? '<b>Warehouse pickup</b><br>Lunde warehouse, Bakersfield, CA' : '<b>Curbside delivery</b><br>' + esc(d.address || "") + (d.window ? '<br>Window: ' + d.window : "") + (d.placement ? '<br>' + d.placement : "") + (d.notes ? '<br>Notes: ' + esc(d.notes) : "")) + '</p></div></div>' +
        '<div class="panel"><div class="panel-head"><h2>Customer</h2><a href="./customer-profile.html?id=' + encodeURIComponent(c.email || "") + '">Profile</a></div><div class="panel-pad"><p style="font-size:14.5px;line-height:1.55"><b>' + esc(c.name || "Guest") + '</b>' + (c.company ? '<br>' + esc(c.company) : "") + (c.email ? '<br>' + esc(c.email) : "") + (c.phone ? '<br>' + esc(c.phone) : "") + '</p></div></div>' +
        '<div class="panel"><div class="panel-head"><h2>Timeline</h2></div><div class="panel-pad"><div class="mo-timeline">' + timeline + '</div></div></div>' +
      '</div></div>';

    document.getElementById("statusChips").addEventListener("click", function (e) {
      var b = e.target.closest("[data-set-status]"); if (!b) return;
      L.updateOrder(o.id, { status: b.dataset.setStatus });
      if (L.showToast) L.showToast("Status updated to " + STATUS_LABELS[b.dataset.setStatus]);
      render();
    });
    var cancel = document.getElementById("cancelOrder");
    if (cancel) cancel.addEventListener("click", function () { if (confirm("Cancel this order?")) { L.updateOrder(o.id, { status: "cancelled" }); render(); } });
    document.getElementById("saveNotes").addEventListener("click", function () {
      var text = document.getElementById("staffNotes").value.trim();
      if (!text) return;
      L.updateOrder(o.id, { staffNotes: text });
      if (L.showToast) L.showToast("Note added");
      render();
    });
    var markPaid = document.getElementById("payMarkPaid");
    if (markPaid) markPaid.addEventListener("click", function () {
      var np = Object.assign({}, o.payment || {}, { method: "invoice", paidAt: Date.now() });
      L.updateOrder(o.id, { payment: np });
      if (L.showToast) L.showToast("Invoice marked as paid");
      render();
    });
    var refund = document.getElementById("payRefund");
    if (refund) refund.addEventListener("click", function () {
      if (!confirm("Record a refund of " + money(t.total) + " for this order?")) return;
      var np = Object.assign({}, o.payment || {}, { refundedAt: Date.now() });
      L.updateOrder(o.id, { payment: np });
      if (L.showToast) L.showToast("Refund recorded");
      render();
    });
    var receipt = document.getElementById("payReceipt");
    if (receipt) receipt.addEventListener("click", function () {
      if (L.showToast) L.showToast("Receipt sent to " + (c.email || "the customer"));
    });
  }
  render();
})();
