/* Lunde V6/V7 — staff settings
   Server-backed via GET/PATCH /api/settings: delivery & pricing, business
   info, email notifications, plus a read-only integrations health panel. */
(function () {
  var L = window.lunde, money = L.money;
  var mount = document.getElementById("setMount");
  var session = window.lundeSession || {};
  var PROMOS = L.PROMO_CODES || {};
  var integrations = null, emailCfg = null;

  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function field(label, inner) { return '<label class="v6-field"><span>' + label + '</span>' + inner + '</label>'; }
  function statusBadge(ok, okText, badText) {
    return '<span class="status-badge" data-status="' + (ok ? "delivered" : "cancelled") + '"><i></i>' + (ok ? okText : badText) + '</span>';
  }

  var promoRows = Object.keys(PROMOS).map(function (k) {
    var pr = PROMOS[k];
    var val = pr.type === "percent" ? Math.round(pr.value * 100) + "% off" : money(pr.value) + " off";
    return '<div class="row" style="grid-template-columns:1fr auto auto;gap:14px"><span><span class="row-title">' + pr.code + '</span><span class="row-sub">Discount code</span></span><span class="status-badge" data-status="delivered"><i></i>Active</span><span class="row-strong">' + val + '</span></div>';
  }).join("");

  function render() {
    var s = L.siteSettings();
    var integrationRows = integrations ? (
      '<div class="row" style="grid-template-columns:1fr auto"><span><span class="row-title">Stripe payments</span><span class="row-sub">Card checkout' + (integrations.stripeWebhook ? " + webhook" : "") + '</span></span>' + statusBadge(integrations.stripe, "Connected", "Not configured") + '</div>' +
      '<div class="row" style="grid-template-columns:1fr auto"><span><span class="row-title">Resend email</span><span class="row-sub">' + esc(emailCfg && emailCfg.from || "Transactional email") + '</span></span>' + statusBadge(integrations.resend, "Connected", "Not configured") + '</div>' +
      '<div class="row" style="grid-template-columns:1fr auto"><span><span class="row-title">Supabase data store</span><span class="row-sub">' + (integrations.dataBackend === "supabase" ? "Cloud-persistent stores" : "Local file fallback") + '</span></span>' + statusBadge(integrations.supabase, "Connected", "Local files") + '</div>' +
      '<div class="row" style="grid-template-columns:1fr auto"><span><span class="row-title">Fulfillment notices</span><span class="row-sub">' + esc(emailCfg && emailCfg.fulfillmentRecipient || "No recipient") + '</span></span>' + statusBadge(Boolean(emailCfg && emailCfg.fulfillmentRecipientConfigured), "Set", "Missing") + '</div>'
    ) : '<div class="panel-pad"><p class="row-sub">Checking integration status…</p></div>';

    mount.innerHTML =
      '<div class="app-head"><div><p class="eyebrow">Configuration</p><h1>Settings</h1></div></div>' +
      '<div class="cols-2-even" style="align-items:start"><div style="display:grid;gap:18px">' +

        '<div class="panel"><div class="panel-head"><h2>Delivery &amp; pricing</h2><span class="cp-saved" id="savedPricing" hidden>Saved</span></div><div class="panel-pad v6-form">' +
          '<div class="v6-field-row">' +
            field('Flat delivery fee ($)', '<input id="setFreight" type="number" min="0" step="1" value="' + s.freightFlat + '">') +
            field('Free delivery over ($)', '<input id="setFreeOver" type="number" min="0" step="50" value="' + s.freeShipOver + '">') +
          '</div><div class="v6-field-row">' +
            field('Tax rate (%)', '<input id="setTax" type="number" min="0" max="25" step="0.05" value="' + (s.taxRate * 100).toFixed(2) + '">') +
            field('Garage placement ($/carton)', '<input id="setGarage" type="number" min="0" step="0.5" value="' + s.garagePerCarton + '">') +
          '</div>' +
          '<p class="row-sub">Used everywhere totals are shown — cart, checkout, Stripe, and staff orders. Update the advertised “free delivery over $1,200” copy if you change that threshold.</p>' +
          '<div><button class="btn" type="button" id="savePricing" style="min-height:42px">Save pricing</button></div>' +
        '</div></div>' +

        '<div class="panel"><div class="panel-head"><h2>Business info</h2><span class="cp-saved" id="savedBiz" hidden>Saved</span></div><div class="panel-pad v6-form">' +
          '<div class="v6-field-row">' +
            field('Business name', '<input id="setBizName" value="' + esc(s.businessName) + '">') +
            field('Phone', '<input id="setBizPhone" value="' + esc(s.businessPhone) + '">') +
          '</div><div class="v6-field-row">' +
            field('Email', '<input id="setBizEmail" type="email" value="' + esc(s.businessEmail) + '">') +
            field('Hours', '<input id="setBizHours" placeholder="e.g. Mon–Sat 8am–6pm" value="' + esc(s.businessHours) + '">') +
          '</div>' +
          field('Address', '<input id="setBizAddress" value="' + esc(s.businessAddress) + '">') +
          '<div><button class="btn" type="button" id="saveBiz" style="min-height:42px">Save business info</button></div>' +
        '</div></div>' +

        '<div class="panel"><div class="panel-head"><h2>Promo codes</h2></div><div class="rowlist">' + promoRows + '</div></div>' +

      '</div><div style="display:grid;gap:18px">' +

        '<div class="panel"><div class="panel-head"><h2>Email notifications</h2><span class="cp-saved" id="savedEmail" hidden>Saved</span></div><div class="panel-pad v6-form">' +
          '<label style="display:flex;gap:10px;align-items:center;font-size:14px;cursor:pointer"><input type="checkbox" id="setEmailConfirm"' + (s.emailOrderConfirmation ? ' checked' : '') + ' style="width:16px;height:16px;accent-color:var(--accent)"> Send order confirmation emails</label>' +
          '<label style="display:flex;gap:10px;align-items:center;font-size:14px;cursor:pointer"><input type="checkbox" id="setEmailDelivered"' + (s.emailDeliveryNotice ? ' checked' : '') + ' style="width:16px;height:16px;accent-color:var(--accent)"> Send “order delivered” emails</label>' +
          field('Reply-to address (optional)', '<input id="setReplyTo" type="email" placeholder="replies go to the sending address" value="' + esc(s.emailReplyTo) + '">') +
          '<div><button class="btn" type="button" id="saveEmail" style="min-height:42px">Save email settings</button></div>' +
        '</div></div>' +

        '<div class="panel"><div class="panel-head"><h2>Integrations</h2></div><div class="rowlist">' + integrationRows + '</div></div>' +

        '<div class="panel"><div class="panel-head"><h2>Your account</h2></div><div class="panel-pad">' +
          '<div class="app-user" style="padding:0 0 14px"><span class="av" style="background:var(--accent)">' + (session.initials || "U") + '</span><span class="app-user-info"><b style="color:var(--ink)">' + esc(session.name || "Staff") + '</b><span style="color:var(--muted)">' + esc(session.email || "") + ' · ' + esc(session.role || "Staff") + '</span></span></div>' +
          '<button class="btn ghost" type="button" id="setSignout">Sign out</button></div></div>' +

        '<div class="panel"><div class="panel-head"><h2>Data</h2></div><div class="panel-pad"><p class="row-sub" style="margin-bottom:14px">Reset demo data to its original seeded state, or reseed if empty.</p>' +
          '<button class="btn ghost" type="button" id="reseed" style="min-height:42px">Reseed demo data</button></div></div>' +

      '</div></div>';

    bind();
  }

  function flash(id) { var el = document.getElementById(id); if (!el) return; el.hidden = false; setTimeout(function () { el.hidden = true; }, 2200); }
  async function save(patch, savedId) {
    var r = await L.updateSettings(patch);
    if (r && r.ok) { flash(savedId); if (L.showToast) L.showToast("Settings saved"); }
    else if (L.showToast) L.showToast((r && r.error) || "Could not save settings");
  }

  function bind() {
    document.getElementById("savePricing").addEventListener("click", function () {
      save({
        freightFlat: Number(document.getElementById("setFreight").value),
        freeShipOver: Number(document.getElementById("setFreeOver").value),
        taxRate: Number(document.getElementById("setTax").value) / 100,
        garagePerCarton: Number(document.getElementById("setGarage").value)
      }, "savedPricing");
    });
    document.getElementById("saveBiz").addEventListener("click", function () {
      save({
        businessName: document.getElementById("setBizName").value,
        businessPhone: document.getElementById("setBizPhone").value,
        businessEmail: document.getElementById("setBizEmail").value,
        businessHours: document.getElementById("setBizHours").value,
        businessAddress: document.getElementById("setBizAddress").value
      }, "savedBiz");
    });
    document.getElementById("saveEmail").addEventListener("click", function () {
      save({
        emailOrderConfirmation: document.getElementById("setEmailConfirm").checked,
        emailDeliveryNotice: document.getElementById("setEmailDelivered").checked,
        emailReplyTo: document.getElementById("setReplyTo").value
      }, "savedEmail");
    });
    document.getElementById("setSignout").addEventListener("click", function () {
      localStorage.removeItem("lunde_staff_session_v1"); localStorage.setItem("lunde_staff_logged_out_v1", "1"); location.href = "./login.html";
    });
    document.getElementById("reseed").addEventListener("click", function () {
      if (L.seedDemoData && confirm("Reseed demo orders, inventory, and customers?")) { L.seedDemoData(true); if (L.showToast) L.showToast("Demo data reseeded"); }
    });
  }

  render();
  /* Refresh settings + integration health from the server, then re-render once. */
  fetch("/api/settings", { credentials: "same-origin", headers: { Accept: "application/json" } })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && d.ok) {
        integrations = d.integrations || null;
        emailCfg = d.email || null;
        if (d.settings) try { localStorage.setItem("lunde_settings_v1", JSON.stringify(d.settings)); } catch (e) {}
        render();
      }
    }).catch(function () {});
})();
