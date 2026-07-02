/* Lunde V6/V7 — staff settings */
(function () {
  var L = window.lunde, money = L.money;
  var mount = document.getElementById("setMount");
  var session = window.lundeSession || {};
  var PROMOS = L.PROMO_CODES || {};

  function ic(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' + p + '</svg>'; }

  var promoRows = Object.keys(PROMOS).map(function (k) {
    var pr = PROMOS[k];
    var val = pr.type === "percent" ? Math.round(pr.value * 100) + "% off" : money(pr.value) + " off";
    return '<div class="row" style="grid-template-columns:1fr auto auto;gap:14px"><span><span class="row-title">' + pr.code + '</span><span class="row-sub">Discount code</span></span><span class="status-badge" data-status="delivered"><i></i>Active</span><span class="row-strong">' + val + '</span></div>';
  }).join("");

  mount.innerHTML =
    '<div class="app-head"><div><p class="eyebrow">Configuration</p><h1>Settings</h1></div></div>' +
    '<div class="cols-2-even" style="align-items:start"><div style="display:grid;gap:18px">' +
      '<div class="panel"><div class="panel-head"><h2>Promo codes</h2></div><div class="rowlist">' + promoRows + '</div></div>' +
      '<div class="panel"><div class="panel-head"><h2>Store</h2></div><div class="panel-pad v6-form"><div class="v6-field-row">' +
        '<label class="v6-field"><span>Flat freight</span><input value="' + money(L.FREIGHT_FLAT || 149) + '" readonly style="color:var(--muted);background:var(--canvas)"></label>' +
        '<label class="v6-field"><span>Tax rate</span><input value="' + ((L.TAX_RATE || 0.065) * 100).toFixed(1) + '%" readonly style="color:var(--muted);background:var(--canvas)"></label>' +
      '</div><div class="v6-field-row">' +
        '<label class="v6-field"><span>Free shipping over</span><input value="$1,200" readonly style="color:var(--muted);background:var(--canvas)"></label>' +
        '<label class="v6-field"><span>Garage placement</span><input value="$3 / carton" readonly style="color:var(--muted);background:var(--canvas)"></label>' +
      '</div><p class="row-sub" style="margin-top:4px">Store-wide values are configured in the data layer.</p></div></div>' +
    '</div><div style="display:grid;gap:18px">' +
      '<div class="panel"><div class="panel-head"><h2>Your account</h2></div><div class="panel-pad">' +
        '<div class="app-user" style="padding:0 0 14px"><span class="av" style="background:var(--accent)">' + (session.initials || "U") + '</span><span class="app-user-info"><b style="color:var(--ink)">' + (session.name || "Staff") + '</b><span style="color:var(--muted)">' + (session.email || "") + ' · ' + (session.role || "Staff") + '</span></span></div>' +
        '<button class="btn ghost" type="button" id="setSignout">Sign out</button></div></div>' +
      '<div class="panel"><div class="panel-head"><h2>Data</h2></div><div class="panel-pad"><p class="row-sub" style="margin-bottom:14px">Reset demo data to its original seeded state, or reseed if empty.</p>' +
        '<button class="btn ghost" type="button" id="reseed" style="min-height:42px">Reseed demo data</button></div></div>' +
    '</div></div>';

  document.getElementById("setSignout").addEventListener("click", function () {
    localStorage.removeItem("lunde_staff_session_v1"); localStorage.setItem("lunde_staff_logged_out_v1", "1"); location.href = "./login.html";
  });
  document.getElementById("reseed").addEventListener("click", function () {
    if (L.seedDemoData && confirm("Reseed demo orders, inventory, and customers?")) { L.seedDemoData(true); if (L.showToast) L.showToast("Demo data reseeded"); }
  });
})();
