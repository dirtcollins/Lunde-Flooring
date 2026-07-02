/* Lunde V6/V7 — staff order detail */
(function () {
  var L = window.lunde, money = L.money, productById = L.productById, cartonsFor = L.cartonsFor,
      materialEstimate = L.materialEstimate, cartonPrice = L.cartonPrice, STATUSES = L.STATUSES, STATUS_LABELS = L.STATUS_LABELS;
  var mount = document.getElementById("orderDetail");
  var id = new URLSearchParams(location.search).get("id");
  var deliveryOpen = false; /* persists across re-renders */

  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function fmt(ts) { return new Date(ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); }
  function time(ts) { return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  function schedFmt(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || "");
    if (!m) return "";
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  function winLabel(w) { return w === "morning" ? "Morning" : w === "afternoon" ? "Afternoon" : ""; }

  function notesLog(raw) {
    var notes = L.coerceStaffNotes ? L.coerceStaffNotes(raw) : (Array.isArray(raw) ? raw : (raw ? [{ text: String(raw) }] : []));
    if (!notes.length) return '<p class="mo-note-empty">No internal notes yet.</p>';
    return notes.map(function (n) {
      var meta = [n.author, n.at ? time(n.at) : ""].filter(Boolean).join(" · ");
      return '<div class="mo-note"><p class="mo-note-text">' + esc(n.text || "") + '</p>' +
        (meta ? '<span class="mo-note-meta">' + esc(meta) + '</span>' : '') + '</div>';
    }).join("");
  }

  /* Payment panel — shows only real payment data; no invented card details. */
  function paymentPanel(o) {
    var pay = o.payment || {};
    var t = o.totals;
    var refunded = !!pay.refundedAt || pay.status === "refunded";
    var paid = !refunded && (!!pay.paidAt || pay.status === "paid");
    var isInvoice = pay.method === "invoice";
    var terms = pay.terms || "";
    if (isInvoice && !terms) {
      var acct = (o.checkout && o.checkout.customerId) ? L.customerById(o.checkout.customerId) : null;
      terms = (acct && acct.profile && acct.profile.paymentTerms) || "";
    }
    var hasPayment = !!(pay.method || pay.brand || pay.last4 || pay.paidAt || pay.refundedAt || pay.txnId || pay.status);

    var methodText;
    if (isInvoice) methodText = "Invoice" + (terms ? " — " + esc(terms) : "");
    else if (pay.brand || pay.last4) methodText = esc(pay.brand || "Card") + (pay.last4 ? " •••• " + esc(pay.last4) : "");
    else if (pay.method === "card") methodText = "Card";
    else methodText = "No payment on file";

    var badge, badgeText;
    if (refunded) { badge = "cancelled"; badgeText = "Refunded"; }
    else if (paid) { badge = "delivered"; badgeText = "Paid"; }
    else if (hasPayment) { badge = "shipped"; badgeText = "Awaiting payment"; }
    else { badge = "placed"; badgeText = "No payment"; }

    var rows = '<div class="v6-sumrow"><span>Method</span><b>' + methodText + '</b></div>';
    if (pay.exp) rows += '<div class="v6-sumrow"><span>Card expiry</span><b>' + esc(pay.exp) + '</b></div>';
    if (pay.paidAt) rows += '<div class="v6-sumrow"><span>Paid</span><b>' + time(pay.paidAt) + '</b></div>';
    if (pay.refundedAt) rows += '<div class="v6-sumrow"><span>Refunded</span><b>' + time(pay.refundedAt) + '</b></div>';
    if (isInvoice && !paid && !refunded) {
      var netMatch = /net\s*(\d+)/i.exec(terms || "");
      if (netMatch) rows += '<div class="v6-sumrow"><span>Due</span><b>' + fmt(o.createdAt + parseInt(netMatch[1], 10) * 86400000) + '</b></div>';
    }
    if (pay.txnId) rows += '<div class="v6-sumrow"><span>Transaction</span><b style="font-variant-numeric:normal;font-size:12.5px">' + esc(pay.txnId) + '</b></div>';
    rows += '<div class="v6-sumrow"><span>' + (refunded ? "Amount refunded" : "Amount") + '</span><b>' + money(t.total) + '</b></div>';
    if (pay.billing) rows += '<div class="v6-sumrow" style="align-items:flex-start"><span>Billing</span><b style="font-weight:600;text-align:right;max-width:62%">' + esc(pay.billing) + '</b></div>';

    var actions = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">' +
      (!paid && !refunded ? '<button class="btn" type="button" id="payMarkPaid" style="min-height:40px;padding:0 16px">Mark as paid</button>' : '') +
      (paid ? '<button class="btn ghost" type="button" id="payRefund" style="min-height:40px;padding:0 16px">Record refund</button>' : '') +
      '<button class="btn ghost" type="button" id="payReceipt" style="min-height:40px;padding:0 16px">Resend receipt</button>' +
      '</div>';

    return '<div class="panel"><div class="panel-head"><h2>Payment</h2><span class="status-badge" data-status="' + badge + '"><i></i>' + badgeText + '</span></div><div class="panel-pad">' +
      rows + actions + '</div></div>';
  }

  /* Delivery panel — read view with prominent schedule, plus an inline edit form. */
  function deliveryPanel(o) {
    var d = o.delivery || {};
    var pickup = d.method === "pickup";
    var body;
    if (deliveryOpen) {
      body =
        '<div class="od-form">' +
          '<label>Method<select id="delMethod">' +
            '<option value="delivery"' + (pickup ? '' : ' selected') + '>Delivery</option>' +
            '<option value="pickup"' + (pickup ? ' selected' : '') + '>Pickup</option>' +
          '</select></label>' +
          '<label>Address<input id="delAddress" type="text" value="' + esc(d.address || "") + '" placeholder="Street, city, state ZIP"></label>' +
          '<label>Date<input id="delDate" type="date" value="' + esc(d.date || "") + '"></label>' +
          '<label>Window<select id="delWindow">' +
            '<option value=""' + (d.window ? '' : ' selected') + '>No preference</option>' +
            '<option value="morning"' + (d.window === "morning" ? ' selected' : '') + '>Morning</option>' +
            '<option value="afternoon"' + (d.window === "afternoon" ? ' selected' : '') + '>Afternoon</option>' +
          '</select></label>' +
          '<label>Notes<textarea id="delNotes" rows="2" placeholder="Gate codes, call-ahead, placement…">' + esc(d.notes || "") + '</textarea></label>' +
          '<div class="od-form-actions">' +
            '<button class="btn" type="button" id="delSave">Save delivery</button>' +
            '<button class="btn ghost" type="button" id="delCancel">Cancel</button>' +
          '</div>' +
        '</div>';
    } else {
      var sched = d.date && schedFmt(d.date)
        ? 'Scheduled: ' + schedFmt(d.date) + (winLabel(d.window) ? ' — ' + winLabel(d.window) : '')
        : '';
      body =
        (sched
          ? '<div class="od-sched">' + sched + '</div>'
          : '<div class="od-sched none">Not scheduled yet</div>') +
        '<p style="font-size:14.5px;line-height:1.55;margin:0">' +
        (pickup
          ? '<b>Warehouse pickup</b><br>Lunde warehouse, Bakersfield, CA'
          : '<b>Curbside delivery</b>' + (d.address ? '<br>' + esc(d.address) : '')) +
        (!d.date && winLabel(d.window) ? '<br>Window: ' + winLabel(d.window) : '') +
        (d.placement ? '<br>Placement: ' + esc(d.placement) : '') +
        (d.notes ? '<br>Notes: ' + esc(d.notes) : '') +
        '</p>';
    }
    return '<div class="panel"><div class="panel-head"><h2>Delivery</h2>' +
      '<button class="btn ghost" type="button" id="deliveryToggle" style="min-height:34px;padding:0 14px;font-size:12.5px">' + (deliveryOpen ? 'Close' : 'Edit') + '</button>' +
      '</div><div class="panel-pad">' + body + '</div></div>';
  }

  function render() {
    var scrollYBefore = window.scrollY;
    var noteField = document.getElementById("staffNotes");
    var noteDraft = noteField ? noteField.value : "";

    var o = id ? L.orderById(id) : null;
    if (!o) { mount.innerHTML = '<div class="app-head"><h1>Order not found</h1></div><a class="btn ghost" href="./orders.html">Back to orders</a>'; return; }

    var lines = "";
    Object.keys(o.items).forEach(function (pid) {
      var p = productById(pid); if (!p) return; var e = o.items[pid];
      if (e.sqft > 0) lines += '<div class="row" style="grid-template-columns:48px 1fr auto"><span class="row-thumb" style="width:48px;height:48px;background-image:url(\'' + window.lunde.thumb(p.mainImage) + '\')"></span><span><span class="row-title">' + esc(p.title) + '</span><span class="row-sub">' + cartonsFor(p, e.sqft) + ' cartons · ' + e.sqft + ' sq. ft. · ' + esc(p.sku) + '</span></span><span class="row-strong">' + money(materialEstimate(p, e.sqft)) + '</span></div>';
      if ((e.samples || 0) > 0) lines += '<div class="row" style="grid-template-columns:48px 1fr auto"><span class="row-thumb" style="width:48px;height:48px;background-image:url(\'' + window.lunde.thumb(p.mainImage) + '\')"></span><span><span class="row-title">' + esc(p.title) + ' — sample</span><span class="row-sub">' + e.samples + ' × ' + money(p.samplePrice) + '</span></span><span class="row-strong">' + money(e.samples * p.samplePrice) + '</span></div>';
    });

    var t = o.totals, c = o.customer || {};
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
      return '<div class="mo-tl"><span><b>' + (STATUS_LABELS[h.status] || esc(h.status)) + '</b></span><span class="when">' + time(h.at) + '</span></div>';
    }).join("");

    mount.innerHTML =
      '<a class="mo-back" href="./orders.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M19 12H5M11 6l-6 6 6 6"></path></svg>All orders</a>' +
      '<div class="app-head"><div><p class="eyebrow">Order ' + esc(o.id) + '</p><h1>' + esc(c.name || "Guest order") + '</h1><p>Placed ' + fmt(o.createdAt) + (c.project ? ' · ' + esc(c.project) : '') + '</p></div>' +
        '<span class="status-badge" data-status="' + esc(o.status) + '"><i></i>' + (STATUS_LABELS[o.status] || esc(o.status)) + '</span></div>' +

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
        paymentPanel(o) +
        deliveryPanel(o) +
        '<div class="panel"><div class="panel-head"><h2>Customer</h2><a href="./customer-profile.html?id=' + encodeURIComponent(c.email || "") + '">Profile</a></div><div class="panel-pad"><p style="font-size:14.5px;line-height:1.55"><b>' + esc(c.name || "Guest") + '</b>' + (c.company ? '<br>' + esc(c.company) : "") + (c.email ? '<br>' + esc(c.email) : "") + (c.phone ? '<br>' + esc(c.phone) : "") + '</p></div></div>' +
        '<div class="panel"><div class="panel-head"><h2>Timeline</h2></div><div class="panel-pad"><div class="mo-timeline">' + timeline + '</div></div></div>' +
      '</div></div>';

    /* restore in-progress UI state */
    var newNoteField = document.getElementById("staffNotes");
    if (newNoteField && noteDraft) newNoteField.value = noteDraft;
    window.scrollTo(0, scrollYBefore);

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

    /* payment actions */
    var markPaid = document.getElementById("payMarkPaid");
    if (markPaid) markPaid.addEventListener("click", function () {
      var np = Object.assign({}, o.payment || {}, { status: "paid", paidAt: Date.now() });
      L.updateOrder(o.id, { payment: np });
      if (L.showToast) L.showToast("Payment marked as paid");
      render();
    });
    var refundBtn = document.getElementById("payRefund");
    if (refundBtn) refundBtn.addEventListener("click", function () {
      if (!confirm("Record a refund of " + money(t.total) + " for this order?")) return;
      var np = Object.assign({}, o.payment || {}, { status: "refunded", refundedAt: Date.now() });
      L.updateOrder(o.id, { payment: np });
      if (L.showToast) L.showToast("Refund recorded");
      render();
    });
    var receipt = document.getElementById("payReceipt");
    if (receipt) receipt.addEventListener("click", function () {
      receipt.disabled = true;
      L.resendOrderReceipt(o.id).then(function (res) {
        receipt.disabled = false;
        if (!L.showToast) return;
        if (res && res.ok) L.showToast("Receipt sent" + (c.email ? " to " + c.email : ""));
        else L.showToast((res && res.error) || "Could not send the receipt.");
      });
    });

    /* delivery scheduling */
    var delToggle = document.getElementById("deliveryToggle");
    if (delToggle) delToggle.addEventListener("click", function () { deliveryOpen = !deliveryOpen; render(); });
    var delCancel = document.getElementById("delCancel");
    if (delCancel) delCancel.addEventListener("click", function () { deliveryOpen = false; render(); });
    var delSave = document.getElementById("delSave");
    if (delSave) delSave.addEventListener("click", function () {
      var nd = Object.assign({}, o.delivery || {}, {
        method: document.getElementById("delMethod").value === "pickup" ? "pickup" : "delivery",
        address: document.getElementById("delAddress").value.trim(),
        date: document.getElementById("delDate").value || "",
        window: document.getElementById("delWindow").value || "",
        notes: document.getElementById("delNotes").value.trim()
      });
      L.updateOrder(o.id, { delivery: nd });
      deliveryOpen = false;
      if (L.showToast) L.showToast("Delivery updated");
      render();
    });
    /* address autocomplete on the single-line delivery address (edit mode only) */
    var delAddress = document.getElementById("delAddress");
    if (delAddress && window.lundeAddressAutocomplete) window.lundeAddressAutocomplete(delAddress);
  }

  /* Fresh-data contract: re-render on background sync, but never clobber in-progress edits. */
  document.addEventListener("lunde:synced", function () {
    if (deliveryOpen) return;
    var ae = document.activeElement;
    if (ae && (ae.tagName === "TEXTAREA" || ae.tagName === "INPUT" || ae.tagName === "SELECT")) return;
    render();
  });
  render();
})();
