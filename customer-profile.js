/* Lunde V6/V7 — staff customer profile
   Tabs: Overview · Contact · Addresses · Orders · Quotes · Favorites · Payments · Notes
   All reads/writes go through window.lunde (store.js): customerProfile,
   updateCustomerProfile, address CRUD, addCustomerNote, quotes(), productById. */
(function () {
  var L = window.lunde, money = L.money, STATUS_LABELS = L.STATUS_LABELS;
  var mount = document.getElementById("cpMount");
  var params = new URLSearchParams(location.search);
  var param = params.get("id");
  var session = window.lundeSession || {};
  var TABS = [
    ["overview", "Overview"], ["contact", "Contact"], ["addresses", "Addresses"],
    ["orders", "Orders"], ["quotes", "Quotes"], ["favorites", "Favorites"],
    ["payments", "Payments"], ["notes", "Notes"]
  ];
  var tab = (function (t) { return TABS.some(function (x) { return x[0] === t; }) ? t : "overview"; })(params.get("tab"));
  var PAYMENT_TERMS = ["Due on receipt", "Net 30", "Net 45", "Net 60"];
  var CONTACT_PREFS = ["Email", "Phone", "Text"];

  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function fmt(ts) { return ts ? new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"; }
  function ago(ts) { var s = (Date.now() - ts) / 1000; if (s < 3600) return Math.max(1, Math.round(s / 60)) + "m ago"; if (s < 86400) return Math.round(s / 3600) + "h ago"; return Math.round(s / 86400) + "d ago"; }
  function initials(n) { return (n || "?").split(" ").map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase(); }
  function cid(c) { return c.id || c.email; }
  function field(label, inner) { return '<label class="cp-field"><span>' + label + '</span>' + inner + '</label>'; }
  function input(id, value, type, placeholder) { return '<input id="' + id + '" type="' + (type || "text") + '" value="' + esc(value) + '"' + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '>'; }
  function select(id, options, current) {
    return '<select id="' + id + '">' + options.map(function (o) {
      return '<option value="' + esc(o) + '"' + (o === current ? " selected" : "") + '>' + esc(o) + '</option>';
    }).join("") + '</select>';
  }
  function panel(title, headExtra, body) {
    return '<div class="panel"><div class="panel-head"><h2>' + title + '</h2>' + (headExtra || "") + '</div>' + body + '</div>';
  }
  function empty(title, sub) { return '<div class="app-empty"><h3>' + title + '</h3><p>' + sub + '</p></div>'; }

  function customerQuotes(c) {
    var em = String(c.email || "").toLowerCase();
    return (L.quotes() || []).filter(function (q) {
      return (c.id && q.customerId === c.id) || (em && String(q.customer && q.customer.email || "").toLowerCase() === em);
    }).sort(function (a, b) { return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt); });
  }
  function customerFavorites(c) {
    return (Array.isArray(c.favorites) ? c.favorites : []).map(function (id) { return L.productById(id); }).filter(Boolean);
  }
  function orderThumb(o) { var k = Object.keys(o.items || {})[0]; var p = k && L.productById(k); return p ? L.thumb(p.mainImage) : ""; }

  function orderRow(o) {
    return '<a class="row" href="./order.html?id=' + encodeURIComponent(o.id) + '" style="grid-template-columns:44px 1fr auto auto;gap:14px">' +
      '<span class="row-thumb" style="background-image:url(\'' + orderThumb(o) + '\')"></span>' +
      '<span><span class="row-title">' + esc(o.id) + '</span><span class="row-sub" style="display:block">' + fmt(o.createdAt) + ' · ' + Object.keys(o.items || {}).length + ' item' + (Object.keys(o.items || {}).length === 1 ? "" : "s") + '</span></span>' +
      '<span class="status-badge" data-status="' + esc(o.status) + '"><i></i>' + (STATUS_LABELS[o.status] || o.status) + '</span>' +
      '<span class="row-strong">' + money(o.totals && o.totals.total || 0) + '</span></a>';
  }

  function paymentStatus(p) {
    if (!p) return ["—", ""];
    if (p.refundedAt) return ["Refunded " + fmt(p.refundedAt), "cancelled"];
    if (p.paidAt) return ["Paid " + fmt(p.paidAt), "delivered"];
    return [p.method === "invoice" ? "Invoice open" : "Pending", "placed"];
  }

  /* ---------- tab bodies ---------- */

  function tabOverview(c) {
    var st = c.stats, pr = c.profile;
    var recent = c.orders.slice(0, 3).map(orderRow).join("") || '<div class="panel-pad"><p class="row-sub">No orders yet.</p></div>';
    var lastNote = (c.notes || [])[0];
    return '<div class="kpis">' +
      '<div class="kpi"><span class="kpi-label">Lifetime value</span><span class="kpi-num">' + money(st.ltv) + '</span></div>' +
      '<div class="kpi"><span class="kpi-label">Orders</span><span class="kpi-num">' + st.totalOrders + '</span></div>' +
      '<div class="kpi"><span class="kpi-label">Avg order</span><span class="kpi-num">' + money(st.avgOrder) + '</span></div>' +
      '<div class="kpi"><span class="kpi-label">Open value</span><span class="kpi-num">' + money(st.openValue) + '</span></div>' +
    '</div>' +
    '<div class="cols-2">' +
      '<div style="display:grid;gap:18px">' +
        panel('Recent orders', '<a href="#" data-tab-link="orders">View all (' + c.orders.length + ')</a>', '<div class="rowlist">' + recent + '</div>') +
        panel('Latest note', '<a href="#" data-tab-link="notes">All notes (' + (c.notes || []).length + ')</a>',
          '<div class="panel-pad">' + (lastNote
            ? '<p style="margin:0 0 4px">' + esc(lastNote.text) + '</p><p class="row-sub">' + esc(lastNote.author) + ' · ' + ago(lastNote.at) + '</p>'
            : '<p class="row-sub">No notes yet.</p>') + '</div>') +
      '</div>' +
      '<div style="display:grid;gap:18px">' +
        panel('Account snapshot', '<a href="#" data-tab-link="payments">Payments</a>', '<div class="panel-pad mo-info">' +
          '<div class="mo-info-card"><h4>Terms</h4><p>' + esc(pr.paymentTerms) + (pr.taxExempt ? ' · Tax exempt' : '') + '</p></div>' +
          '<div class="mo-info-card"><h4>Credit</h4><p>' + money(pr.availableCredit) + ' available of ' + money(pr.creditLimit) + '</p></div>' +
          '<div class="mo-info-card"><h4>Preferred contact</h4><p>' + esc(pr.preferredContact) + (pr.marketingEmails ? ' · Marketing emails on' : ' · No marketing emails') + '</p></div>' +
          '<div class="mo-info-card"><h4>Customer since</h4><p>' + fmt(c.createdAt) + (c.synthesized ? ' · Guest checkout (no account)' : '') + '</p></div>' +
        '</div>') +
        (pr.summaryNotes ? panel('Summary', '<a href="#" data-tab-link="notes">Edit</a>', '<div class="panel-pad"><p style="margin:0;color:var(--ink-soft)">' + esc(pr.summaryNotes) + '</p></div>') : '') +
      '</div>' +
    '</div>';
  }

  function tabContact(c) {
    var pr = c.profile;
    return panel('Contact details', '', '<div class="panel-pad"><div class="cp-form">' +
      '<div class="cp-grid2">' + field('Full name', input('cpName', c.name)) + field('Company', input('cpCompany', c.company)) + '</div>' +
      '<div class="cp-grid2">' + field('Email', input('cpEmail', c.email, 'email')) + field('Phone', input('cpPhone', c.phone, 'tel')) + '</div>' +
      '<div class="cp-grid2">' + field('Preferred contact', select('cpPref', CONTACT_PREFS, pr.preferredContact)) +
        '<label class="cp-check" style="align-self:end;padding-bottom:10px"><input type="checkbox" id="cpMarketing"' + (pr.marketingEmails ? ' checked' : '') + '> Send marketing emails</label></div>' +
      '<div class="cp-actions"><button class="btn" type="button" id="cpSaveContact">Save contact</button><span class="cp-saved" id="cpContactSaved" hidden>Saved</span></div>' +
    '</div></div>') +
    '<div style="display:flex;gap:10px;margin-top:14px">' +
      (c.email ? '<a class="btn ghost" href="mailto:' + esc(c.email) + '">Email ' + esc((c.name || "").split(" ")[0] || "customer") + '</a>' : '') +
      (c.phone ? '<a class="btn ghost" href="tel:' + esc(c.phone) + '">Call ' + esc(c.phone) + '</a>' : '') +
    '</div>';
  }

  function addrForm(prefix, a) {
    a = a || {};
    return '<div class="cp-form" style="margin-top:10px">' +
      '<div class="cp-grid2">' + field('Label', select(prefix + 'Label', L.ADDRESS_LABELS, a.label || "Home")) + field('Street address', input(prefix + 'Line1', a.line1)) + '</div>' +
      '<div class="cp-grid2">' + field('City', input(prefix + 'City', a.city)) +
      '<div class="cp-grid2">' + field('State', input(prefix + 'State', a.state || "CA")) + field('ZIP', input(prefix + 'Zip', a.zip)) + '</div></div>' +
    '</div>';
  }
  function readAddrForm(prefix) {
    function v(id) { var el = document.getElementById(prefix + id); return el ? el.value.trim() : ""; }
    return { label: v('Label'), line1: v('Line1'), city: v('City'), state: v('State'), zip: v('Zip') };
  }
  /* address autocomplete on a rendered addrForm — call right after it hits the DOM */
  function attachAddrAutocomplete(prefix) {
    var street = document.getElementById(prefix + "Line1");
    if (!street || !window.lundeAddressAutocomplete) return;
    window.lundeAddressAutocomplete(street, { onSelect: function (parts) {
      street.value = parts.line1;
      function fill(id, val) { var el = document.getElementById(prefix + id); if (el && val) el.value = val; }
      fill("City", parts.city); fill("State", parts.state); fill("Zip", parts.zip);
    } });
  }

  function tabAddresses(c) {
    var cards = (c.addresses || []).map(function (a) {
      return '<div class="cp-addr" data-addr="' + esc(a.id) + '">' +
        '<h4>' + esc(a.label || "Address") + (a.isDefault ? '<span class="tag">Default</span>' : '') + '</h4>' +
        '<p>' + esc(a.line1) + '<br>' + esc([a.city, a.state].filter(Boolean).join(", ")) + ' ' + esc(a.zip || "") + '</p>' +
        '<div class="cp-addr-actions">' +
          (a.isDefault ? '' : '<button type="button" data-addr-default="' + esc(a.id) + '">Make default</button>') +
          '<button type="button" data-addr-edit="' + esc(a.id) + '">Edit</button>' +
          '<button type="button" class="danger" data-addr-delete="' + esc(a.id) + '">Delete</button>' +
        '</div><div data-addr-editslot="' + esc(a.id) + '"></div></div>';
    }).join("");
    return panel('Saved addresses (' + (c.addresses || []).length + ')', '', '<div class="panel-pad">' +
      ((c.addresses || []).length ? '<div class="cp-addr-grid">' + cards + '</div>' : '<p class="row-sub" style="margin:0 0 6px">No saved addresses yet.</p>') +
    '</div>') +
    panel('Add address', '', '<div class="panel-pad">' + addrForm('cpNew') +
      '<div class="cp-actions" style="margin-top:14px"><button class="btn" type="button" id="cpAddAddr">Add address</button></div></div>');
  }

  function tabOrders(c) {
    return panel('Order history (' + c.orders.length + ')', '', c.orders.length
      ? '<div class="rowlist">' + c.orders.map(orderRow).join("") + '</div>'
      : empty("No orders yet", "Orders placed with this email will appear here."));
  }

  function tabQuotes(c) {
    var qs = customerQuotes(c);
    var rows = qs.map(function (q) {
      var n = Object.keys(q.items || {}).length;
      return '<div class="row" style="grid-template-columns:1fr auto auto;gap:14px">' +
        '<span><span class="row-title">' + esc(q.job || "Saved quote") + '</span><span class="row-sub" style="display:block">' + esc(q.id) + ' · ' + fmt(q.createdAt) + ' · ' + n + ' item' + (n === 1 ? "" : "s") + '</span></span>' +
        '<span class="status-badge" data-status="placed"><i></i>' + esc((q.status || "saved").replace(/^\w/, function (m) { return m.toUpperCase(); })) + '</span>' +
        '<span class="row-strong">' + money(q.totals && q.totals.total || 0) + '</span></div>';
    }).join("");
    return panel('Quotes (' + qs.length + ')', '<a href="./quotes.html">Quotes board</a>', qs.length
      ? '<div class="rowlist">' + rows + '</div>'
      : empty("No quotes yet", "Quotes this customer saves (or staff save for them) will appear here."));
  }

  function tabFavorites(c) {
    var favs = customerFavorites(c);
    var tiles = favs.map(function (p) {
      return '<a class="cp-fav" href="./product.html?slug=' + encodeURIComponent(p.slug) + '" target="_blank" rel="noopener">' +
        '<span class="im" style="background-image:url(\'' + L.thumb(p.mainImage) + '\')"></span>' +
        '<span class="bd"><span class="nm">' + esc(p.title) + '</span><span class="pr">' + money(p.pricePerSqft) + ' / sq ft · ' + esc(p.color || p.collection || "") + '</span></span></a>';
    }).join("");
    return panel('Favorites (' + favs.length + ')', '', favs.length
      ? '<div class="panel-pad"><div class="cp-fav-grid">' + tiles + '</div></div>'
      : empty("No favorites saved", c.synthesized
        ? "Guest customers don't have favorites. Favorites sync when a customer uses their account."
        : "When this customer taps the heart on a floor while signed in, it shows up here."));
  }

  function tabPayments(c) {
    var pr = c.profile;
    var payRows = c.orders.filter(function (o) { return o.payment; }).map(function (o) {
      var p = o.payment, st = paymentStatus(p);
      var method = p.method === "invoice"
        ? 'Invoice · ' + esc(p.terms || pr.paymentTerms)
        : esc(p.brand || "Card") + ' ····' + esc(p.last4 || "");
      return '<a class="row" href="./order.html?id=' + encodeURIComponent(o.id) + '" style="grid-template-columns:1fr auto auto;gap:14px">' +
        '<span><span class="row-title">' + method + '</span><span class="row-sub" style="display:block">' + esc(o.id) + (p.txnId ? ' · ' + esc(p.txnId) : '') + '</span></span>' +
        '<span class="status-badge" data-status="' + st[1] + '"><i></i>' + st[0] + '</span>' +
        '<span class="row-strong">' + money(o.totals && o.totals.total || 0) + '</span></a>';
    }).join("");
    return '<div class="cols-2-even">' +
      panel('Terms & credit', '', '<div class="panel-pad"><div class="cp-form">' +
        field('Payment terms', select('cpTerms', PAYMENT_TERMS, pr.paymentTerms)) +
        field('Credit limit (USD)', input('cpCredit', pr.creditLimit, 'number')) +
        '<label class="cp-check"><input type="checkbox" id="cpTaxExempt"' + (pr.taxExempt ? ' checked' : '') + '> Tax exempt (resale certificate on file)</label>' +
        '<div class="cp-actions"><button class="btn" type="button" id="cpSaveTerms">Save terms</button><span class="cp-saved" id="cpTermsSaved" hidden>Saved</span></div>' +
      '</div></div>') +
      panel('Credit position', '', '<div class="panel-pad mo-info">' +
        '<div class="mo-info-card"><h4>Available credit</h4><p>' + money(pr.availableCredit) + ' of ' + money(pr.creditLimit) + '</p></div>' +
        '<div class="mo-info-card"><h4>Open (unfulfilled) value</h4><p>' + money(c.stats.openValue) + '</p></div>' +
      '</div>') +
    '</div>' +
    '<div style="margin-top:18px">' + panel('Payment history', '', payRows
      ? '<div class="rowlist">' + payRows + '</div>'
      : empty("No payments recorded", "Payments appear here as this customer's orders are placed.")) + '</div>';
  }

  function tabNotes(c) {
    var notes = (c.notes || []).map(function (n) {
      return '<div class="mo-tl" style="align-items:flex-start"><span>' + esc(n.text) + '<br><span class="row-sub">' + esc(n.author) + '</span></span><span class="when">' + ago(n.at) + '</span></div>';
    }).join("") || '<p class="row-sub">No notes yet.</p>';
    return '<div class="cols-2">' +
      panel('Internal notes (' + (c.notes || []).length + ')', '', '<div class="panel-pad">' +
        '<div style="display:flex;gap:8px;margin-bottom:14px"><input id="noteInput" placeholder="Add an internal note…" style="flex:1;height:42px;border:1px solid var(--line-2);padding:0 12px;font:inherit;outline:none;background:var(--panel)"><button class="btn" type="button" id="addNote" style="min-height:42px">Add</button></div>' +
        '<div class="mo-timeline">' + notes + '</div></div>') +
      panel('Account summary', '', '<div class="panel-pad"><div class="cp-form">' +
        field('Shown on the overview tab', '<textarea id="cpSummary" placeholder="Short standing summary — terms quirks, delivery preferences, who to call…">' + esc(c.profile.summaryNotes) + '</textarea>') +
        '<div class="cp-actions"><button class="btn" type="button" id="cpSaveSummary">Save summary</button><span class="cp-saved" id="cpSummarySaved" hidden>Saved</span></div>' +
      '</div></div>') +
    '</div>';
  }

  /* ---------- shell ---------- */

  function setTab(next) {
    tab = next;
    var url = new URL(location.href);
    url.searchParams.set("tab", tab);
    history.replaceState(null, "", url);
    render();
  }

  function flash(id) { var el = document.getElementById(id); if (!el) return; el.hidden = false; setTimeout(function () { el.hidden = true; }, 2000); }

  function render() {
    var c = L.customerProfile(param);
    if (!c) {
      mount.innerHTML = '<div class="app-head"><h1>Customer not found</h1></div><a class="btn ghost" href="./customers.html">Back to customers</a>';
      return;
    }
    var counts = {
      orders: c.orders.length, quotes: customerQuotes(c).length,
      favorites: customerFavorites(c).length, addresses: (c.addresses || []).length, notes: (c.notes || []).length
    };
    var chips = TABS.map(function (t) {
      var n = counts[t[0]];
      return '<button class="chip" type="button" data-tab="' + t[0] + '" aria-pressed="' + (tab === t[0]) + '">' + t[1] + (n != null ? ' <b>' + n + '</b>' : '') + '</button>';
    }).join("");
    var bodies = {
      overview: tabOverview, contact: tabContact, addresses: tabAddresses, orders: tabOrders,
      quotes: tabQuotes, favorites: tabFavorites, payments: tabPayments, notes: tabNotes
    };

    mount.innerHTML =
      '<a class="mo-back" href="./customers.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M19 12H5M11 6l-6 6 6 6"></path></svg>All customers</a>' +
      '<div class="app-head"><div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">' +
        '<span class="av" style="width:54px;height:54px;font-size:18px;color:#fff;display:grid;place-items:center;border-radius:999px;' + (c.avatar ? 'background-image:url(' + esc(c.avatar) + ');background-size:cover;background-position:center;background-color:var(--stone)' : 'background:var(--accent)') + '">' + (c.avatar ? '' : initials(c.name)) + '</span>' +
        '<div><p class="eyebrow">' + (c.synthesized ? "Guest customer" : "Account customer") + '</p>' +
        '<h1>' + esc(c.name || c.email) + '</h1>' +
        '<p>' + esc(c.email) + (c.phone ? ' · ' + esc(c.phone) : '') + (c.company ? ' · ' + esc(c.company) : '') + '</p></div>' +
      '</div>' +
      (c.id ? '<a class="btn" href="./quote-builder.html?customer=' + encodeURIComponent(c.id) + '">New quote</a>' : '') +
      '</div>' +
      '<div class="chips" role="tablist">' + chips + '</div>' +
      '<div id="cpBody">' + bodies[tab](c) + '</div>';

    /* tab switching (chips + overview "view all" links) */
    mount.querySelectorAll("[data-tab]").forEach(function (b) {
      b.addEventListener("click", function () { setTab(b.getAttribute("data-tab")); });
    });
    mount.querySelectorAll("[data-tab-link]").forEach(function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); setTab(a.getAttribute("data-tab-link")); });
    });

    /* contact */
    var saveContact = document.getElementById("cpSaveContact");
    if (saveContact) saveContact.addEventListener("click", function () {
      L.updateCustomerProfile(cid(c), {
        name: document.getElementById("cpName").value.trim(),
        company: document.getElementById("cpCompany").value.trim(),
        email: document.getElementById("cpEmail").value.trim(),
        phone: document.getElementById("cpPhone").value.trim(),
        profile: {
          preferredContact: document.getElementById("cpPref").value,
          marketingEmails: document.getElementById("cpMarketing").checked
        }
      });
      render(); flash("cpContactSaved");
    });

    /* addresses */
    var addAddr = document.getElementById("cpAddAddr");
    if (addAddr) addAddr.addEventListener("click", function () {
      var a = readAddrForm("cpNew");
      if (!a.line1 && !a.city) { if (L.showToast) L.showToast("Enter at least a street or city"); return; }
      L.addCustomerAddress(cid(c), a);
      render();
    });
    attachAddrAutocomplete("cpNew");
    mount.querySelectorAll("[data-addr-default]").forEach(function (b) {
      b.addEventListener("click", function () { L.setDefaultAddress(cid(c), b.getAttribute("data-addr-default")); render(); });
    });
    mount.querySelectorAll("[data-addr-delete]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!confirm("Delete this address?")) return;
        L.deleteCustomerAddress(cid(c), b.getAttribute("data-addr-delete")); render();
      });
    });
    mount.querySelectorAll("[data-addr-edit]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-addr-edit");
        var slot = mount.querySelector('[data-addr-editslot="' + id + '"]');
        if (slot.childElementCount) { slot.innerHTML = ""; return; }
        var a = (c.addresses || []).find(function (x) { return x.id === id; }) || {};
        slot.innerHTML = addrForm("cpEd", a) + '<div class="cp-actions" style="margin-top:10px"><button class="btn" type="button" data-addr-save="' + esc(id) + '" style="min-height:38px">Save</button></div>';
        attachAddrAutocomplete("cpEd");
        slot.querySelector("[data-addr-save]").addEventListener("click", function () {
          L.updateCustomerAddress(cid(c), id, readAddrForm("cpEd")); render();
        });
      });
    });

    /* payments */
    var saveTerms = document.getElementById("cpSaveTerms");
    if (saveTerms) saveTerms.addEventListener("click", function () {
      var limit = Number(document.getElementById("cpCredit").value);
      L.updateCustomerProfile(cid(c), { profile: {
        paymentTerms: document.getElementById("cpTerms").value,
        creditLimit: isFinite(limit) && limit >= 0 ? limit : c.profile.creditLimit,
        taxExempt: document.getElementById("cpTaxExempt").checked,
        availableCredit: null // recomputed from open orders against the new limit
      } });
      render(); flash("cpTermsSaved");
    });

    /* notes */
    var add = document.getElementById("addNote");
    if (add) add.addEventListener("click", function () {
      var v = document.getElementById("noteInput").value.trim(); if (!v) return;
      L.addCustomerNote(cid(c), v, session.name || "Staff"); render();
    });
    var noteInput = document.getElementById("noteInput");
    if (noteInput) noteInput.addEventListener("keydown", function (e) { if (e.key === "Enter") add.click(); });
    var saveSummary = document.getElementById("cpSaveSummary");
    if (saveSummary) saveSummary.addEventListener("click", function () {
      L.updateCustomerProfile(cid(c), { profile: { summaryNotes: document.getElementById("cpSummary").value.trim() } });
      render(); flash("cpSummarySaved");
    });
  }

  render();
})();
