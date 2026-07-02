/* Lunde V6/V7 — staff quote builder (dedicated page)
   Create or edit a quote: pick/create the customer, add floors from a visual
   picker with photos, live carton math + totals, save or save-and-email.
   URL: quote-builder.html            → new quote
        quote-builder.html?customer=… → new quote, customer preselected
        quote-builder.html?edit=LQ-…  → edit an existing quote */
(function () {
  var L = window.lunde, money = L.money, productById = L.productById,
      cartonsFor = L.cartonsFor, materialEstimate = L.materialEstimate, sqftPerCarton = L.sqftPerCarton;
  var mount = document.getElementById("qpMount");
  var picker = document.getElementById("qpPicker");
  var pickerGrid = document.getElementById("qpPickerGrid");
  var pickerSearch = document.getElementById("qpPickerSearch");
  var params = new URLSearchParams(location.search);

  var state = {
    editId: "",
    customerId: "",
    guest: { name: "", company: "", email: "", phone: "" },
    newCustOpen: false,
    lines: [],                 // [{productId, sqft}]
    job: "",
    notes: "",
    expiresAt: defaultExpiry()
  };

  function defaultExpiry() { return new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10); }
  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function initialsOf(n, e) { return ((n || e || "?").split(" ").map(function (w) { return w[0]; }).join("")).slice(0, 2).toUpperCase(); }
  function products() { return window.LUNDE_PUBLIC_PRODUCTS || window.LUNDE_PRODUCTS || []; }
  function customerRec() { return state.customerId && L.customerById ? L.customerById(state.customerId) : null; }

  function items() {
    var map = {};
    state.lines.forEach(function (ln) {
      if (ln.productId && ln.sqft > 0) {
        map[ln.productId] = { sqft: (map[ln.productId] ? map[ln.productId].sqft : 0) + ln.sqft, samples: 0 };
      }
    });
    return map;
  }
  function quoteCustomer() {
    var rec = customerRec();
    return rec
      ? { name: rec.name || "", company: rec.company || "", email: rec.email || "", phone: rec.phone || "" }
      : { name: state.guest.name.trim(), company: state.guest.company.trim(), email: state.guest.email.trim(), phone: state.guest.phone.trim() };
  }
  function customerEmail() { return String(quoteCustomer().email || "").trim(); }

  /* ---------- load (edit / preselect) ---------- */
  (function init() {
    var editId = params.get("edit");
    if (editId) {
      var q = L.quoteById(editId);
      if (q) {
        state.editId = q.id;
        state.lines = Object.keys(q.items || {}).map(function (pid) {
          return { productId: pid, sqft: (q.items[pid] && q.items[pid].sqft) || 0 };
        }).filter(function (ln) { return productById(ln.productId); });
        state.customerId = (q.customerId && L.customerById(q.customerId)) ? q.customerId : "";
        if (!state.customerId && q.customer) {
          state.guest = { name: q.customer.name || "", company: q.customer.company || "", email: q.customer.email || "", phone: q.customer.phone || "" };
        }
        state.job = q.job || "";
        state.notes = q.notes || "";
        if (q.expiresAt) state.expiresAt = new Date(q.expiresAt).toISOString().slice(0, 10);
      }
    }
    var pre = params.get("customer");
    if (pre && !state.editId && L.customerById(pre)) state.customerId = pre;
  })();

  /* ---------- customer panel ---------- */
  function avatarStyle(rec) {
    return rec && rec.avatar ? ' style="background-image:url(&quot;' + rec.avatar + '&quot;)"' : '';
  }
  function customerPanel() {
    var rec = customerRec();
    var body;
    if (rec) {
      var meta = [rec.email, rec.phone, rec.profile && rec.profile.paymentTerms].filter(Boolean).join(" · ");
      body = '<div class="qp-cust-card">' +
        '<span class="qp-av"' + avatarStyle(rec) + '>' + (rec.avatar ? '' : esc(initialsOf(rec.name, rec.email))) + '</span>' +
        '<span class="info"><b>' + esc(rec.name || rec.email) + (rec.company ? ' — ' + esc(rec.company) : '') + '</b><span>' + esc(meta) + '</span></span>' +
        '<button class="qp-link" type="button" id="qpChangeCust">Change</button></div>';
    } else if (state.newCustOpen) {
      body = '<div style="display:grid;gap:14px">' +
        '<div class="qp-grid2">' +
          fld('Name', inp('qpNewName', state.guest.name, 'e.g. Dana Whitfield')) +
          fld('Company (optional)', inp('qpNewCompany', state.guest.company)) + '</div>' +
        '<div class="qp-grid2">' +
          fld('Email', inp('qpNewEmail', state.guest.email, 'needed to email the quote', 'email')) +
          fld('Phone', inp('qpNewPhone', state.guest.phone, '', 'tel')) + '</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          '<button class="btn" type="button" id="qpCreateCust" style="min-height:42px">Add customer</button>' +
          '<button class="btn ghost" type="button" id="qpGuestOnly" style="min-height:42px">Use without saving</button>' +
          '<button class="qp-link" type="button" id="qpBackToSearch">Back to search</button></div>' +
        '<p class="row-sub" style="margin:0">“Add customer” saves them to your customer list; “use without saving” keeps this a one-off quote.</p></div>';
    } else if (state.guest.name || state.guest.email) {
      body = '<div class="qp-cust-card">' +
        '<span class="qp-av">' + esc(initialsOf(state.guest.name, state.guest.email)) + '</span>' +
        '<span class="info"><b>' + esc(state.guest.name || state.guest.email) + '</b><span>' + esc([state.guest.email, state.guest.phone].filter(Boolean).join(" · ") || "One-off quote (not saved to customers)") + '</span></span>' +
        '<button class="qp-link" type="button" id="qpChangeCust">Change</button></div>';
    } else {
      body = '<div class="qp-cust-search">' +
        '<label class="qp-field"><span>Find a customer</span><input id="qpCustSearch" placeholder="Search by name, company, email, or phone…" autocomplete="off"></label>' +
        '<div class="qp-cust-results" id="qpCustResults" hidden></div></div>' +
        '<div style="margin-top:12px"><button class="btn ghost" type="button" id="qpNewCust" style="min-height:42px">+ New customer</button></div>';
    }
    return panel("Customer", "", '<div class="panel-pad">' + body + '</div>');
  }
  function custResults(q) {
    var term = q.trim().toLowerCase();
    var list = (L.customers ? L.customers() : []).filter(function (c) {
      if (!term) return true;
      return [c.name, c.company, c.email, c.phone].some(function (v) { return String(v || "").toLowerCase().indexOf(term) > -1; });
    }).slice(0, 8);
    if (!list.length) return '<button type="button" disabled style="color:var(--muted)">No matches — try “+ New customer”</button>';
    return list.map(function (c) {
      return '<button type="button" data-pick-cust="' + esc(c.id) + '">' +
        '<span class="qp-av"' + avatarStyle(c) + '>' + (c.avatar ? '' : esc(initialsOf(c.name, c.email))) + '</span>' +
        '<span style="min-width:0"><b style="display:block;font-size:14px">' + esc(c.name || c.email) + (c.company ? ' — ' + esc(c.company) : '') + '</b>' +
        '<span style="font-size:12px;color:var(--muted)">' + esc([c.email, c.phone].filter(Boolean).join(" · ")) + '</span></span></button>';
    }).join("");
  }

  /* ---------- floors panel ---------- */
  function linesPanel() {
    var rows = state.lines.map(function (ln, i) {
      var p = productById(ln.productId);
      if (!p) return "";
      return '<div class="qp-line" data-line="' + i + '">' +
        '<span class="th" style="background-image:url(\'' + L.thumb(p.mainImage) + '\')"></span>' +
        '<span style="min-width:0"><span class="nm">' + esc(p.title) + '</span>' +
        '<span class="sub">' + esc(p.sku || "") + ' · ' + money(p.pricePerSqft) + '/sq ft · ' + sqftPerCarton(p) + ' sq ft/carton</span></span>' +
        '<label class="qp-field sqft"><span>Sq. ft.</span><input type="number" min="0" step="1" inputmode="numeric" value="' + (ln.sqft || "") + '" data-sqft="' + i + '">' +
        '<button class="qp-waste" type="button" data-waste="' + i + '" title="Add 10% for cuts and waste">+10% waste</button></label>' +
        '<span class="calc" data-calc="' + i + '">' + lineCalc(ln) + '</span>' +
        '<button class="rm" type="button" data-rm="' + i + '" aria-label="Remove ' + esc(p.title) + '">Remove</button></div>';
    }).join("");
    var body = state.lines.length
      ? '<div>' + rows + '</div>'
      : '<div class="qp-empty">No floors yet — add the floors this quote covers.</div>';
    return panel("Floors", '<button class="btn" type="button" id="qpAddFloors" style="min-height:40px;padding:0 18px">+ Add floors</button>',
      '<div class="panel-pad">' + body + '</div>');
  }
  function lineCalc(ln) {
    var p = productById(ln.productId);
    if (!p || !(ln.sqft > 0)) return '<b>—</b>Enter square feet';
    var cartons = cartonsFor(p, ln.sqft);
    var covers = Math.round(cartons * sqftPerCarton(p));
    return '<b>' + money(materialEstimate(p, ln.sqft)) + '</b>' + cartons + ' carton' + (cartons === 1 ? '' : 's') + ' · covers ' + covers + ' sq ft';
  }

  /* ---------- details + summary ---------- */
  function detailsPanel() {
    return panel("Details", "", '<div class="panel-pad" style="display:grid;gap:14px">' +
      '<div class="qp-grid2">' +
        fld('Job name', inp('qpJob', state.job, 'e.g. Henderson kitchen remodel')) +
        fld('Quote valid until', '<input id="qpExpires" type="date" value="' + esc(state.expiresAt) + '">') + '</div>' +
      fld('Notes (shown on the quote & email)', '<textarea id="qpNotes" placeholder="Measurements, install considerations, what’s included…">' + esc(state.notes) + '</textarea>') +
    '</div>');
  }
  function summaryPanel() {
    var t = L.cartTotals(items(), "delivery", "curb", "");
    var cust = quoteCustomer();
    var minis = state.lines.filter(function (ln) { return productById(ln.productId); }).map(function (ln) {
      var p = productById(ln.productId);
      return '<div class="qp-mini"><span class="th" style="background-image:url(\'' + L.thumb(p.mainImage) + '\')"></span>' +
        '<span class="t">' + esc(p.title) + '<br><span style="color:var(--muted)">' + (ln.sqft || 0) + ' sq ft · ' + (ln.sqft > 0 ? cartonsFor(p, ln.sqft) : 0) + ' cartons</span></span>' +
        '<span class="v">' + (ln.sqft > 0 ? money(materialEstimate(p, ln.sqft)) : "—") + '</span></div>';
    }).join("");
    var emailBtnLabel = state.editId ? "Save & email to customer" : "Save & email to customer";
    return '<div class="panel qp-summary"><div class="panel-head"><h2>' + (state.editId ? "Quote " + esc(state.editId) : "Quote summary") + '</h2></div><div class="panel-pad">' +
      '<p class="row-sub" style="margin:0 0 10px">' + (cust.name || cust.email ? "For " + esc(cust.company || cust.name || cust.email) : "No customer selected yet") + '</p>' +
      (minis || '<p class="row-sub" style="margin:0">Nothing added yet.</p>') +
      '<div style="margin-top:14px">' +
        '<div class="qp-sumline"><span>Material</span><span data-sum="material">' + money(t.material) + '</span></div>' +
        '<div class="qp-sumline muted"><span>Cartons</span><span data-sum="cartons">' + t.cartons + '</span></div>' +
        '<div class="qp-sumline muted"><span>Delivery (estimated)</span><span data-sum="freight">' + (t.freight ? money(t.freight) : "Free") + '</span></div>' +
        '<div class="qp-sumline muted"><span>Tax (estimated)</span><span data-sum="tax">' + money(t.tax) + '</span></div>' +
        '<div class="qp-sumtotal"><span>Estimated total</span><span data-sum="total">' + money(t.total) + '</span></div>' +
        '<p class="row-sub" style="margin:8px 0 0">Final delivery and tax are set at checkout. The emailed quote shows the material subtotal.</p>' +
      '</div>' +
      '<div class="qp-actions">' +
        '<button class="btn" type="button" id="qpSave">' + (state.editId ? "Save changes" : "Save quote") + '</button>' +
        '<button class="btn ghost" type="button" id="qpSaveEmail"' + (customerEmail() ? '' : ' disabled title="Add a customer email first"') + '>' + emailBtnLabel + '</button>' +
        '<a class="btn ghost" href="./quotes.html" style="text-align:center">Cancel</a>' +
      '</div>' +
    '</div></div>';
  }

  function panel(title, headExtra, body) {
    return '<div class="panel"><div class="panel-head"><h2>' + title + '</h2>' + (headExtra || "") + '</div>' + body + '</div>';
  }
  function fld(label, inner) { return '<label class="qp-field"><span>' + label + '</span>' + inner + '</label>'; }
  function inp(id, value, ph, type) {
    return '<input id="' + id + '" type="' + (type || "text") + '" value="' + esc(value) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' autocomplete="off">';
  }

  /* ---------- render ---------- */
  function render() {
    mount.innerHTML =
      '<a class="mo-back" href="./quotes.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M19 12H5M11 6l-6 6 6 6"></path></svg>All quotes</a>' +
      '<div class="app-head"><div><p class="eyebrow">Pipeline</p><h1>' + (state.editId ? "Edit quote" : "New quote") + '</h1>' +
        (state.editId ? '<p>Editing ' + esc(state.editId) + ' — changes save over the original.</p>' : '<p>Build it, save it, email it — carton math is automatic.</p>') + '</div></div>' +
      '<div class="qp-layout"><div style="display:grid;gap:18px">' +
        customerPanel() + linesPanel() + detailsPanel() +
      '</div>' + summaryPanel() + '</div>';
    bind();
  }

  /* update calcs + summary in place (keeps focus while typing) */
  function updateCalcs() {
    state.lines.forEach(function (ln, i) {
      var el = mount.querySelector('[data-calc="' + i + '"]');
      if (el) el.innerHTML = lineCalc(ln);
    });
    var t = L.cartTotals(items(), "delivery", "curb", "");
    var set = function (k, v) { var el = mount.querySelector('[data-sum="' + k + '"]'); if (el) el.textContent = v; };
    set("material", money(t.material));
    set("cartons", String(t.cartons));
    set("freight", t.freight ? money(t.freight) : "Free");
    set("tax", money(t.tax));
    set("total", money(t.total));
  }

  function snapshotInputs() {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : null; };
    if (g("qpJob") != null) state.job = g("qpJob");
    if (g("qpNotes") != null) state.notes = g("qpNotes");
    if (g("qpExpires") != null) state.expiresAt = g("qpExpires");
    if (g("qpNewName") != null) state.guest.name = g("qpNewName");
    if (g("qpNewCompany") != null) state.guest.company = g("qpNewCompany");
    if (g("qpNewEmail") != null) state.guest.email = g("qpNewEmail");
    if (g("qpNewPhone") != null) state.guest.phone = g("qpNewPhone");
  }

  function bind() {
    /* customer search */
    var cs = document.getElementById("qpCustSearch");
    if (cs) {
      var results = document.getElementById("qpCustResults");
      var show = function () { results.innerHTML = custResults(cs.value); results.hidden = false; };
      cs.addEventListener("input", show);
      cs.addEventListener("focus", show);
      cs.addEventListener("blur", function () { setTimeout(function () { results.hidden = true; }, 180); });
      results.addEventListener("mousedown", function (e) {
        var b = e.target.closest("[data-pick-cust]");
        if (b) { state.customerId = b.getAttribute("data-pick-cust"); state.newCustOpen = false; render(); }
      });
    }
    var on = function (id, fn) { var el = document.getElementById(id); if (el) el.addEventListener("click", fn); };
    on("qpNewCust", function () { snapshotInputs(); state.newCustOpen = true; render(); });
    on("qpBackToSearch", function () { snapshotInputs(); state.newCustOpen = false; state.guest = { name: "", company: "", email: "", phone: "" }; render(); });
    on("qpChangeCust", function () { state.customerId = ""; state.guest = { name: "", company: "", email: "", phone: "" }; state.newCustOpen = false; render(); });
    on("qpCreateCust", function () {
      snapshotInputs();
      if (!state.guest.name.trim() && !state.guest.email.trim()) { if (L.showToast) L.showToast("Add at least a name or email"); return; }
      var rec = L.updateCustomerProfile("", {
        name: state.guest.name.trim(), company: state.guest.company.trim(),
        email: state.guest.email.trim(), phone: state.guest.phone.trim()
      });
      if (rec && rec.id) { state.customerId = rec.id; state.newCustOpen = false; if (L.showToast) L.showToast("Customer added"); }
      render();
    });
    on("qpGuestOnly", function () { snapshotInputs(); state.newCustOpen = false; render(); });

    /* floors */
    on("qpAddFloors", function () { snapshotInputs(); openPicker(); });
    mount.addEventListener("input", onLineInput);
    mount.addEventListener("click", onLineClick);

    /* details */
    ["qpJob", "qpNotes", "qpExpires"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("input", snapshotInputs);
    });

    /* save */
    on("qpSave", function () { saveQuote(false); });
    on("qpSaveEmail", function () { saveQuote(true); });
  }
  function onLineInput(e) {
    var sq = e.target.closest("[data-sqft]");
    if (sq) { state.lines[Number(sq.getAttribute("data-sqft"))].sqft = Math.max(0, Number(sq.value) || 0); updateCalcs(); }
  }
  function onLineClick(e) {
    var w = e.target.closest("[data-waste]");
    if (w) {
      var i = Number(w.getAttribute("data-waste"));
      var ln = state.lines[i];
      if (ln.sqft > 0) {
        ln.sqft = Math.ceil(ln.sqft * 1.1);
        var input = mount.querySelector('[data-sqft="' + i + '"]');
        if (input) input.value = ln.sqft;
        updateCalcs();
      }
      return;
    }
    var rm = e.target.closest("[data-rm]");
    if (rm) { snapshotInputs(); state.lines.splice(Number(rm.getAttribute("data-rm")), 1); render(); }
  }

  /* ---------- floor picker ---------- */
  function openPicker() {
    picker.classList.add("open");
    picker.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    pickerSearch.value = "";
    renderPicker();
    pickerSearch.focus();
  }
  function closePicker() {
    picker.classList.remove("open");
    picker.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    render();
  }
  function renderPicker() {
    var term = pickerSearch.value.trim().toLowerCase();
    var inQuote = {};
    state.lines.forEach(function (ln) { inQuote[ln.productId] = true; });
    var list = products().filter(function (p) {
      if (!term) return true;
      return [p.title, p.sku, p.color, p.collection].some(function (v) { return String(v || "").toLowerCase().indexOf(term) > -1; });
    });
    pickerGrid.innerHTML = list.map(function (p) {
      return '<button class="qp-card' + (inQuote[p.id] ? ' in' : '') + '" type="button" data-toggle-floor="' + esc(p.id) + '">' +
        '<span class="im" style="background-image:url(\'' + L.thumb(p.mainImage) + '\')"></span>' +
        '<span class="bd"><span class="t">' + esc(p.title) + '</span><span class="p">' + money(p.pricePerSqft) + '/sq ft · ' + esc(p.color || p.collection || "") + '</span></span></button>';
    }).join("") || '<p class="row-sub" style="padding:20px">No floors match that search.</p>';
  }
  pickerSearch.addEventListener("input", renderPicker);
  pickerGrid.addEventListener("click", function (e) {
    var b = e.target.closest("[data-toggle-floor]");
    if (!b) return;
    var id = b.getAttribute("data-toggle-floor");
    var idx = -1;
    state.lines.forEach(function (ln, i) { if (ln.productId === id) idx = i; });
    if (idx > -1) state.lines.splice(idx, 1);
    else state.lines.push({ productId: id, sqft: 0 });
    renderPicker();
  });
  picker.addEventListener("click", function (e) { if (e.target.closest("[data-picker-close]")) closePicker(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && picker.classList.contains("open")) closePicker();
  });

  /* ---------- save ---------- */
  function saveQuote(andEmail) {
    snapshotInputs();
    var map = items();
    if (!Object.keys(map).length) { if (L.showToast) L.showToast("Add at least one floor with square footage"); return; }
    var cust = quoteCustomer();
    if (andEmail && !customerEmail()) { if (L.showToast) L.showToast("Add a customer email to send the quote"); return; }
    var expiresAt = state.expiresAt ? new Date(state.expiresAt + "T23:59:59").getTime() : 0;
    var t = L.cartTotals(map);
    var id;
    if (state.editId) {
      L.updateQuote(state.editId, {
        items: map,
        totals: { material: t.material, samples: t.samples, cartons: t.cartons, subtotal: t.subtotal, total: t.total },
        job: state.job.trim() || "Saved quote",
        notes: state.notes.trim(),
        customer: cust,
        customerId: state.customerId || "",
        expiresAt: expiresAt || undefined
      });
      id = state.editId;
    } else {
      var q = L.saveQuoteFromCart(state.job.trim() || "Staff quote", {
        items: map, customer: cust, customerId: state.customerId || "", notes: state.notes.trim()
      });
      if (!q) { if (L.showToast) L.showToast("Could not save the quote"); return; }
      id = q.id;
      if (expiresAt) L.updateQuote(id, { expiresAt: expiresAt });
    }
    if (!andEmail) {
      if (L.showToast) L.showToast("Quote " + id + " saved");
      location.href = "./quotes.html";
      return;
    }
    var btn = document.getElementById("qpSaveEmail");
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    L.sendQuoteToCustomer(id).then(function (res) {
      if (res && res.ok) { if (L.showToast) L.showToast("Quote " + id + " emailed to " + customerEmail()); }
      else if (L.showToast) L.showToast("Saved, but the email failed: " + ((res && res.error) || "server unreachable"));
      location.href = "./quotes.html";
    });
  }

  render();
})();
