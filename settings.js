/* Lunde V6/V7 — staff settings
   Server-backed via GET/PATCH /api/settings: delivery & pricing, business
   info, email notifications, plus a read-only integrations health panel. */
(function () {
  var L = window.lunde, money = L.money;
  var mount = document.getElementById("setMount");
  var session = window.lundeSession || {};
  var integrations = null, emailCfg = null;

  function promoCodes() {
    var s = L.siteSettings();
    return (s.promoCodes && typeof s.promoCodes === "object") ? s.promoCodes : (L.PROMO_CODES || {});
  }

  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function field(label, inner) { return '<label class="v6-field"><span>' + label + '</span>' + inner + '</label>'; }
  function statusBadge(ok, okText, badText) {
    return '<span class="status-badge" data-status="' + (ok ? "delivered" : "cancelled") + '"><i></i>' + (ok ? okText : badText) + '</span>';
  }

  function promoPanel() {
    var codes = promoCodes();
    var keys = Object.keys(codes);
    var rows = keys.map(function (k) {
      var pr = codes[k];
      var val = pr.type === "percent" ? Math.round(pr.value * 100) + "% off" : money(pr.value) + " off";
      return '<div class="row" style="grid-template-columns:1fr auto auto;gap:14px"><span><span class="row-title">' + esc(pr.code) + '</span><span class="row-sub">' + val + '</span></span>' +
        '<span class="status-badge" data-status="delivered"><i></i>Active</span>' +
        '<button class="chip" type="button" data-promo-del="' + esc(k) + '" style="height:34px;padding:0 12px">Delete</button></div>';
    }).join("") || '<div class="panel-pad"><p class="row-sub">No promo codes — add one below.</p></div>';
    return '<div class="panel"><div class="panel-head"><h2>Promo codes</h2><span class="cp-saved" id="savedPromos" hidden>Saved</span></div><div class="rowlist">' + rows + '</div>' +
      '<div class="panel-pad v6-form" style="border-top:1px solid var(--line)"><div class="v6-field-row">' +
        field('Code', '<input id="promoCode" placeholder="e.g. SPRING15" style="text-transform:uppercase">') +
        field('Type', '<select id="promoType"><option value="percent">% off subtotal</option><option value="fixed">$ off subtotal</option></select>') +
        field('Amount', '<input id="promoValue" type="number" min="0" step="1" placeholder="15">') +
      '</div><div><button class="btn" type="button" id="promoAdd" style="min-height:42px">Add code</button></div></div></div>';
  }

  // Eight product series from the SpecialFX sheet. Defaults render the fields
  // even before settings are pulled; the server holds the source of truth.
  var SERIES_UI = [
    { key: "s560",  name: "560 Series",   sub: "SPC 5.5mm · 12 mil · 551–554",         note: "4 products",      pay: 2.25, sell: 4.25 },
    { key: "s562",  name: "562 Series",   sub: "SPC 5.5mm · 20 mil · 561–566",         note: "1 of 6 loaded",   pay: 2.00, sell: 4.00 },
    { key: "hy",    name: "HY Series",    sub: "SPC 5.5mm 4+1.5 · 12 mil · HY001–008", note: "not on site yet", pay: 2.25, sell: 4.25 },
    { key: "g00",   name: "G00 Series",   sub: "SPC 6mm · 22 mil · G001–G006",         note: "6 products",      pay: 2.25, sell: 4.25 },
    { key: "y80",   name: "Y80 Series",   sub: "SPC 6.5mm · 20 mil · Y8001–Y8009",     note: "9 products",      pay: 2.50, sell: 4.50 },
    { key: "wy365", name: "WY365 Series", sub: "SPC 6.5mm · 20 mil · WY365-1–6",       note: "6 products",      pay: 2.50, sell: 4.50 },
    { key: "y90",   name: "Y90 Series",   sub: "SPC 6.5mm · 20 mil EIR · Y9001–Y9006", note: "6 products",      pay: 2.50, sell: 4.50 },
    { key: "ge",    name: "GE Series",    sub: "QPC 7mm · GE001–GE012",                note: "not on site yet", pay: 2.25, sell: 4.25 }
  ];
  function seriesPricingPanel(s) {
    var cfg = (s && s.priceSeries) || {};
    var rows = SERIES_UI.map(function (r) {
      var v = cfg[r.key] || {};
      var pay = v.pay != null ? v.pay : r.pay;
      var sell = v.sell != null ? v.sell : r.sell;
      var on = v.enabled !== false;
      return '<div class="v6-series-row' + (on ? "" : " off") + '" data-series="' + r.key + '" style="display:grid;grid-template-columns:minmax(0,1fr) auto 100px 100px;gap:12px;align-items:end;padding:12px 0;border-top:1px solid var(--line)">' +
          '<div><strong style="display:block">' + r.name + '</strong><span class="row-sub">' + r.sub + ' · ' + r.note + '</span></div>' +
          '<label class="v6-field" style="align-items:center;text-align:center"><span>Series&nbsp;price</span><span class="v6-switch"><input type="checkbox" id="setOn_' + r.key + '"' + (on ? " checked" : "") + '><span class="slider"></span></span></label>' +
          '<label class="v6-field v6-num"><span>Pay $/sqft</span><input id="setPay_' + r.key + '" type="number" min="0" step="0.01" value="' + pay + '"></label>' +
          '<label class="v6-field v6-num"><span>Sell $/sqft</span><input id="setSell_' + r.key + '" type="number" min="0" step="0.01" value="' + sell + '"></label>' +
        '</div>';
    }).join("");
    return '<div class="panel"><div class="panel-head"><h2>Series pricing</h2><span class="cp-saved" id="savedSeries" hidden>Saved</span></div><div class="panel-pad v6-form">' +
      '<p class="row-sub" style="margin:0"><b>Sell</b> is the retail $/sqft customers pay for that series — it drives catalog, quotes, cart, and checkout. <b>Pay</b> is your cost (used for margin). Flip <b>Series price</b> off to ignore that row and fall back to the default markup instead. A manual price edit on a product still wins.</p>' +
      '<div>' + rows + '</div>' +
      '<div style="margin-top:6px"><button class="btn" type="button" id="saveSeries" style="min-height:42px">Save series pricing</button></div>' +
    '</div></div>';
  }

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
          '</div><div class="v6-field-row">' +
            field('Default markup — other products (%)', '<input id="setMarkup" type="number" min="0" max="500" step="1" value="' + (s.priceMarkupPercent || 0) + '">') +
            '<div class="v6-field"><span>&nbsp;</span><p class="row-sub" style="margin:10px 0 0">Fallback for products <b>not</b> in a priced series below — their retail = cost + this markup. Series products use their Sell price instead.</p></div>' +
          '</div>' +
          '<p class="row-sub">Used everywhere totals are shown — cart, checkout, Stripe, and staff orders. Update the advertised “free delivery over $1,200” copy if you change that threshold.</p>' +
          '<div><button class="btn" type="button" id="savePricing" style="min-height:42px">Save pricing</button></div>' +
        '</div></div>' +

        seriesPricingPanel(s) +

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

        promoPanel() +

      '</div><div style="display:grid;gap:18px">' +

        '<div class="panel"><div class="panel-head"><h2>Email notifications</h2><span class="cp-saved" id="savedEmail" hidden>Saved</span></div><div class="panel-pad v6-form">' +
          '<label style="display:flex;gap:10px;align-items:center;font-size:14px;cursor:pointer"><input type="checkbox" id="setEmailConfirm"' + (s.emailOrderConfirmation ? ' checked' : '') + ' style="width:16px;height:16px;accent-color:var(--accent)"> Send order confirmation emails</label>' +
          '<label style="display:flex;gap:10px;align-items:center;font-size:14px;cursor:pointer"><input type="checkbox" id="setEmailDelivered"' + (s.emailDeliveryNotice ? ' checked' : '') + ' style="width:16px;height:16px;accent-color:var(--accent)"> Send “order delivered” emails</label>' +
          '<label style="display:flex;gap:10px;align-items:center;font-size:14px;cursor:pointer"><input type="checkbox" id="setEmailNewMsg"' + (s.emailNewMessageAlert !== false ? ' checked' : '') + ' style="width:16px;height:16px;accent-color:var(--accent)"> Email me when the contact form is submitted</label>' +
          field('Send contact-form alerts to', '<input id="setNotifyEmail" type="email" placeholder="dirtcollins@gmail.com" value="' + esc(s.notifyEmail || "") + '">') +
          field('Reply-to address (optional)', '<input id="setReplyTo" type="email" placeholder="replies go to the sending address" value="' + esc(s.emailReplyTo) + '">') +
          '<div><button class="btn" type="button" id="saveEmail" style="min-height:42px">Save email settings</button></div>' +
        '</div></div>' +

        '<div class="panel"><div class="panel-head"><h2>Integrations</h2></div><div class="rowlist">' + integrationRows + '</div></div>' +

        '<div class="panel"><div class="panel-head"><h2>Your account</h2></div><div class="panel-pad">' +
          '<div class="app-user" style="padding:0 0 14px">' +
            (session.avatar
              ? '<span class="av" style="background-color:var(--stone);background-image:url(' + esc(session.avatar) + ');background-size:cover;background-position:center"></span>'
              : '<span class="av" style="background:var(--accent)">' + (session.initials || "U") + '</span>') +
            '<span class="app-user-info"><b style="color:var(--ink)">' + esc(session.name || "Staff") + '</b><span style="color:var(--muted)">' + esc(session.email || "") + ' · ' + esc(session.role || "Staff") + '</span></span></div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;padding:0 0 14px">' +
            '<button class="btn ghost" type="button" id="setAvUpload" style="min-height:36px;padding:6px 12px">Upload photo</button>' +
            '<button class="btn ghost" type="button" id="setAvRemove" style="min-height:36px;padding:6px 12px"' + (session.avatar ? '' : ' disabled') + '>Remove photo</button>' +
            '<input type="file" id="setAvFile" accept="image/png,image/jpeg,image/webp" style="display:none">' +
          '</div>' +
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

  /* Center-crop + downscale a picked image to a 128x128 JPEG data URL. */
  function downscaleAvatar(file, cb) {
    var url;
    try { url = URL.createObjectURL(file); } catch (e) { cb(""); return; }
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      try {
        var size = 128;
        var c = document.createElement("canvas");
        c.width = size; c.height = size;
        var ctx = c.getContext("2d");
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        var sq = Math.min(w, h);
        if (!sq) { cb(""); return; }
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, (w - sq) / 2, (h - sq) / 2, sq, sq, 0, 0, size, size);
        var out = c.toDataURL("image/jpeg", 0.85);
        cb(out && out.indexOf("data:image/jpeg") === 0 ? out : "");
      } catch (e2) { cb(""); }
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(""); };
    img.src = url;
  }

  /* Save the signed-in user's avatar ("" removes), then sync the local
     session + sidebar so the change shows immediately. */
  function saveAvatar(val) {
    if (!session.id) { if (L.showToast) L.showToast("No signed-in account found"); return; }
    L.adminUserUpdate(session.id, { avatar: val }).then(function (res) {
      if (res && res.ok) {
        session.avatar = val;
        try {
          var raw = JSON.parse(localStorage.getItem("lunde_staff_session_v1") || "null");
          if (raw) { raw.avatar = val; localStorage.setItem("lunde_staff_session_v1", JSON.stringify(raw)); }
        } catch (e) {}
        var sideAv = document.querySelector(".app-side-foot .av");
        if (sideAv) {
          if (val) {
            sideAv.style.backgroundImage = "url(" + val + ")";
            sideAv.style.backgroundSize = "cover";
            sideAv.style.backgroundPosition = "center";
            sideAv.textContent = "";
          } else {
            sideAv.style.backgroundImage = "";
            sideAv.textContent = session.initials || (session.name || "U").split(" ").map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
          }
        }
        if (L.showToast) L.showToast(val ? "Profile photo updated" : "Profile photo removed");
        render();
      } else if (L.showToast) {
        L.showToast((res && res.error) || "Could not save photo");
      }
    });
  }

  function bind() {
    var avUpload = document.getElementById("setAvUpload");
    var avFile = document.getElementById("setAvFile");
    var avRemove = document.getElementById("setAvRemove");
    if (avUpload && avFile) {
      avUpload.addEventListener("click", function () { avFile.click(); });
      avFile.addEventListener("change", function () {
        var f = avFile.files && avFile.files[0];
        avFile.value = "";
        if (!f) return;
        downscaleAvatar(f, function (dataUrl) {
          if (!dataUrl) { if (L.showToast) L.showToast("Could not read that image"); return; }
          saveAvatar(dataUrl);
        });
      });
    }
    if (avRemove) avRemove.addEventListener("click", function () { saveAvatar(""); });

    document.getElementById("savePricing").addEventListener("click", function () {
      save({
        freightFlat: Number(document.getElementById("setFreight").value),
        freeShipOver: Number(document.getElementById("setFreeOver").value),
        taxRate: Number(document.getElementById("setTax").value) / 100,
        garagePerCarton: Number(document.getElementById("setGarage").value),
        priceMarkupPercent: Number(document.getElementById("setMarkup").value)
      }, "savedPricing");
    });
    SERIES_UI.forEach(function (r) {
      var toggle = document.getElementById("setOn_" + r.key);
      if (!toggle) return;
      toggle.addEventListener("change", function () {
        var row = document.querySelector('.v6-series-row[data-series="' + r.key + '"]');
        if (row) row.classList.toggle("off", !toggle.checked);
      });
    });
    document.getElementById("saveSeries").addEventListener("click", function () {
      var ps = {};
      SERIES_UI.forEach(function (r) {
        ps[r.key] = {
          pay: Number(document.getElementById("setPay_" + r.key).value),
          sell: Number(document.getElementById("setSell_" + r.key).value),
          enabled: document.getElementById("setOn_" + r.key).checked
        };
      });
      save({ priceSeries: ps }, "savedSeries");
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
        emailNewMessageAlert: document.getElementById("setEmailNewMsg").checked,
        notifyEmail: document.getElementById("setNotifyEmail").value.trim(),
        emailReplyTo: document.getElementById("setReplyTo").value
      }, "savedEmail");
    });
    document.getElementById("promoAdd").addEventListener("click", function () {
      var code = document.getElementById("promoCode").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      var type = document.getElementById("promoType").value;
      var raw = Number(document.getElementById("promoValue").value);
      if (!code) { if (L.showToast) L.showToast("Enter a code name"); return; }
      if (!isFinite(raw) || raw <= 0) { if (L.showToast) L.showToast("Enter a discount amount"); return; }
      if (type === "percent" && raw > 90) { if (L.showToast) L.showToast("Percent discounts max out at 90%"); return; }
      var next = {};
      var cur = promoCodes();
      Object.keys(cur).forEach(function (k) { next[k] = cur[k]; });
      next[code] = { code: code, label: code, type: type, value: type === "percent" ? raw / 100 : raw };
      save({ promoCodes: next }, "savedPromos").then(render);
    });
    mount.querySelectorAll("[data-promo-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-promo-del");
        if (!confirm("Delete promo code " + k + "? Customers can no longer apply it.")) return;
        var next = {};
        var cur = promoCodes();
        Object.keys(cur).forEach(function (key) { if (key !== k) next[key] = cur[key]; });
        save({ promoCodes: next }, "savedPromos").then(render);
      });
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
