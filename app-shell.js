/* Lunde V6 — staff app shell (auth guard + sidebar + topbar). Load at END of body. */
(function () {
  var SESSION_KEY = "lunde_staff_session_v1";
  var session = null;
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) {}
  var here = (location.pathname.split("/").pop() || "dashboard.html");
  if (!session) { location.href = "./login.html?next=" + encodeURIComponent(here); return; }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var active = document.body.getAttribute("data-staff") || "";
  function ic(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' + p + '</svg>'; }
  var SEARCH_IC = '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>';
  var NAV = [
    ["dashboard", "Dashboard", "dashboard.html", '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>'],
    ["orders", "Orders", "orders.html", '<path d="M6 4h12l1 16H5L6 4Z"/><path d="M9 8h6"/>'],
    ["inventory", "Inventory", "inventory.html", '<path d="M3 7l9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>'],
    ["products", "Products", "products.html", '<rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/>'],
    ["customers", "Customers", "customers.html", '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 5a3 3 0 0 1 0 6M18 20c0-2.5-1-4-2.5-5"/>'],
    ["quotes", "Quotes", "quotes.html", '<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5"/><path d="M8 13h8M8 17h6"/>'],
    ["reports", "Reports", "reports.html", '<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>'],
    ["messages", "Messages", "messages.html", '<path d="M4 5h16v11H9l-4 4V5Z"/>'],
    ["settings", "Settings", "settings.html", '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>']
  ];
  // Owners can manage staff accounts; hidden for everyone else (server also enforces).
  if (session.role === "Owner" || session.canManageAdmins) {
    NAV.push(["staff-users", "Staff", "staff-users.html", '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2"/><path d="M16 5.2a3 3 0 0 1 0 5.8M17.5 20c0-2.4-1-3.9-2.4-4.8"/>']);
  }
  var initials = session.initials || (session.name || "U").split(" ").map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
  var dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // Small count badges on Orders / Messages (kept in sync after "lunde:synced").
  var BADGE_KEYS = { orders: 1, messages: 1 };
  function badgeHtml(key) {
    return BADGE_KEYS[key] ? '<span class="nav-badge" data-badge="' + key + '" hidden></span>' : "";
  }

  var side =
    '<aside class="app-side">' +
      '<a class="app-brand" href="./dashboard.html">Lunde<small>Staff Console</small></a>' +
      '<nav class="app-nav">' + NAV.map(function (n) {
        return '<a href="./' + n[2] + '"' + (n[0] === active ? ' aria-current="page"' : '') + '>' + ic(n[3]) + n[1] + badgeHtml(n[0]) + '</a>';
      }).join("") + '</nav>' +
      '<div class="app-side-foot"><div class="app-user">' +
      (session.avatar
        ? '<span class="av" style="background-image:url(' + esc(session.avatar) + ');background-size:cover;background-position:center"></span>'
        : '<span class="av">' + esc(initials) + '</span>') +
      '<span class="app-user-info"><b>' + esc(session.name || "Staff") + '</b><span>' + esc(session.role || "Staff") + '</span></span></div>' +
      '<button class="app-signout" type="button" id="appSignout">Sign out</button></div>' +
    '</aside><div class="app-scrim" id="appScrim"></div>';

  var isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || "");
  var topbar =
    '<header class="app-top"><button class="app-burger" type="button" id="appBurger">' + ic('<path d="M3 7h18M3 12h18M3 17h18"/>') + '</button>' +
    '<button class="gs-open" type="button" id="gsOpen" aria-label="Search (' + (isMac ? "Cmd" : "Ctrl") + '+K)">' + ic(SEARCH_IC) +
      '<span class="gs-open-label">Search</span><kbd class="gs-open-kbd">' + (isMac ? "⌘K" : "Ctrl K") + '</kbd></button>' +
    '<div class="app-top-spacer"></div><span class="app-top-date">' + dateStr + '</span>' +
    '<a class="app-top-date" href="./index.html" style="text-decoration:underline;text-underline-offset:3px">View store ↗</a></header>';

  // App-style bottom tab bar for phones: the four everyday destinations plus
  // "More", which opens the full sidebar menu (same as the burger).
  var TAB_KEYS = ["dashboard", "orders", "customers", "quotes"];
  var tabbar = '<nav class="app-tabbar" aria-label="Console navigation">' +
    NAV.filter(function (n) { return TAB_KEYS.indexOf(n[0]) > -1; }).map(function (n) {
      return '<a href="./' + n[2] + '"' + (n[0] === active ? ' aria-current="page"' : '') + '>' + ic(n[3]) + '<span>' + n[1] + '</span>' + badgeHtml(n[0]) + '</a>';
    }).join("") +
    '<button type="button" id="appMoreTab"' + (TAB_KEYS.indexOf(active) === -1 ? ' class="on"' : '') + '>' + ic('<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>') + '<span>More</span></button></nav>';

  var main = document.querySelector("main");
  var content = main ? main.innerHTML : "";
  var app = document.createElement("div");
  app.className = "app"; app.id = "app";
  app.innerHTML = side + '<div class="app-main">' + topbar + '<div class="app-content">' + content + '</div></div>' + tabbar;
  if (main) main.remove();
  document.body.insertBefore(app, document.body.firstChild);

  document.getElementById("appSignout").addEventListener("click", function () {
    localStorage.removeItem(SESSION_KEY);
    localStorage.setItem("lunde_staff_logged_out_v1", "1");
    var go = function () { location.href = "./login.html"; };
    // clear the server-side staff cookie before leaving, then redirect
    if (window.lunde && window.lunde.staffLogout) window.lunde.staffLogout().then(go, go);
    else go();
  });
  var burger = document.getElementById("appBurger"), scrim = document.getElementById("appScrim");
  function toggle() { app.classList.toggle("nav-open"); }
  burger.addEventListener("click", toggle);
  scrim.addEventListener("click", toggle);
  var moreTab = document.getElementById("appMoreTab");
  if (moreTab) moreTab.addEventListener("click", toggle);

  /* ---------- session validation ----------
     Ask the server whether the cookie is still good. Only sign out on an
     explicit rejection ({ok:false} response body); staffMe() returns null on
     network failures, and we never sign out for those. */
  if (window.lunde && typeof window.lunde.staffMe === "function") {
    window.lunde.staffMe().then(function (res) {
      if (res && typeof res === "object" && res.ok === false) {
        try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
        location.href = "./login.html?next=" + encodeURIComponent(here);
      }
    }, function () { /* network error — keep the session */ });
  }

  /* ---------- nav count badges (open messages / open orders) ---------- */
  function setBadge(key, n) {
    var els = document.querySelectorAll('[data-badge="' + key + '"]');
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = n > 99 ? "99+" : String(n);
      if (n > 0) els[i].removeAttribute("hidden");
      else els[i].setAttribute("hidden", "");
    }
  }
  function updateBadges() {
    var L = window.lunde;
    if (!L) return;
    var openMsgs = 0, openOrders = 0;
    try {
      var fb = (typeof L.feedbackItems === "function" ? L.feedbackItems() : []) || [];
      for (var i = 0; i < fb.length; i++) {
        if (fb[i] && ["resolved", "archived", "replied"].indexOf(fb[i].status || "") === -1 && !(Array.isArray(fb[i].replies) && fb[i].replies.length)) openMsgs++;
      }
      var ords = (typeof L.orders === "function" ? L.orders() : []) || [];
      for (var j = 0; j < ords.length; j++) {
        var s = ords[j] && ords[j].status;
        if (s === "placed" || s === "processing") openOrders++;
      }
    } catch (e) {}
    setBadge("messages", openMsgs);
    setBadge("orders", openOrders);
  }
  updateBadges();
  document.addEventListener("lunde:synced", updateBadges);

  /* ---------- global search (Cmd/Ctrl+K or "/") ---------- */
  var gsOverlay = document.createElement("div");
  gsOverlay.className = "gs-overlay";
  gsOverlay.id = "gsOverlay";
  gsOverlay.setAttribute("hidden", "");
  gsOverlay.innerHTML =
    '<div class="gs-box" role="dialog" aria-modal="true" aria-label="Search the console">' +
      '<div class="gs-field">' + ic(SEARCH_IC) +
        '<input class="gs-input" id="gsInput" type="text" placeholder="Search orders, customers, products, quotes…" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Search the console">' +
        '<button type="button" class="gs-close" id="gsClose" aria-label="Close search">Esc</button>' +
      '</div>' +
      '<div class="gs-results" id="gsResults"></div>' +
    '</div>';
  document.body.appendChild(gsOverlay);
  var gsInput = document.getElementById("gsInput");
  var gsResults = document.getElementById("gsResults");
  var gsFlat = [];       // flat list of {href} in render order, for arrow keys
  var gsActive = -1;

  function gsMatches(q, fields) {
    for (var i = 0; i < fields.length; i++) {
      if (String(fields[i] || "").toLowerCase().indexOf(q) > -1) return true;
    }
    return false;
  }

  function gsCollect(q) {
    var L = window.lunde || {};
    var MAX = 5;
    var groups = [];
    var i, hits;

    // Orders — id, customer name/email
    hits = [];
    var ords = [];
    try { ords = (typeof L.orders === "function" ? L.orders() : []) || []; } catch (e) {}
    for (i = 0; i < ords.length && hits.length < MAX; i++) {
      var o = ords[i]; if (!o) continue;
      var oc = o.customer || {};
      if (gsMatches(q, [o.id, oc.name, oc.email])) {
        var label = (L.STATUS_LABELS && L.STATUS_LABELS[o.status]) || o.status || "";
        hits.push({
          title: o.id || "Order",
          sub: [oc.name, label].filter(Boolean).join(" · "),
          href: "./order.html?id=" + encodeURIComponent(o.id || "")
        });
      }
    }
    if (hits.length) groups.push({ label: "Orders", items: hits });

    // Customers — name, email, phone, company
    hits = [];
    var custs = [];
    try { custs = (typeof L.customers === "function" ? L.customers() : []) || []; } catch (e) {}
    for (i = 0; i < custs.length && hits.length < MAX; i++) {
      var c = custs[i]; if (!c) continue;
      if (gsMatches(q, [c.name, c.email, c.phone, c.company])) {
        hits.push({
          title: c.name || c.email || "Customer",
          sub: [c.company, c.email].filter(Boolean).join(" · "),
          href: "./customer-profile.html?id=" + encodeURIComponent(c.id || "")
        });
      }
    }
    if (hits.length) groups.push({ label: "Customers", items: hits });

    // Products — title, sku
    hits = [];
    var prods = window.LUNDE_PUBLIC_PRODUCTS || [];
    for (i = 0; i < prods.length && hits.length < MAX; i++) {
      var p = prods[i]; if (!p) continue;
      if (gsMatches(q, [p.title, p.sku])) {
        hits.push({
          title: p.title || p.sku || "Product",
          sub: p.sku ? "SKU " + p.sku : "",
          href: "./product-edit.html?id=" + encodeURIComponent(p.id || "")
        });
      }
    }
    if (hits.length) groups.push({ label: "Products", items: hits });

    // Quotes — id, job, customer
    hits = [];
    var qts = [];
    try { qts = (typeof L.quotes === "function" ? L.quotes() : []) || []; } catch (e) {}
    for (i = 0; i < qts.length && hits.length < MAX; i++) {
      var quote = qts[i]; if (!quote) continue;
      var qc = quote.customer || {};
      if (gsMatches(q, [quote.id, quote.job, qc.name, qc.email])) {
        hits.push({
          title: quote.job || quote.id || "Quote",
          sub: [quote.id, qc.name].filter(Boolean).join(" · "),
          href: "./quotes.html"
        });
      }
    }
    if (hits.length) groups.push({ label: "Quotes", items: hits });

    return groups;
  }

  function gsSetActive(idx) {
    var items = gsResults.querySelectorAll(".gs-item");
    if (!items.length) { gsActive = -1; return; }
    if (idx < 0) idx = items.length - 1;
    if (idx >= items.length) idx = 0;
    for (var i = 0; i < items.length; i++) {
      if (i === idx) {
        items[i].classList.add("on");
        items[i].setAttribute("aria-selected", "true");
        if (items[i].scrollIntoView) items[i].scrollIntoView({ block: "nearest" });
      } else {
        items[i].classList.remove("on");
        items[i].removeAttribute("aria-selected");
      }
    }
    gsActive = idx;
  }

  function gsRender() {
    var q = (gsInput.value || "").trim().toLowerCase();
    gsFlat = [];
    gsActive = -1;
    if (!q) { gsResults.innerHTML = ""; return; }
    var groups = gsCollect(q);
    if (!groups.length) {
      gsResults.innerHTML = '<div class="gs-empty">No matches for “' + esc(gsInput.value.trim()) + '”.</div>';
      return;
    }
    var html = "";
    var idx = 0;
    for (var g = 0; g < groups.length; g++) {
      html += '<div class="gs-group"><div class="gs-group-title">' + esc(groups[g].label) + '</div>';
      for (var i = 0; i < groups[g].items.length; i++) {
        var it = groups[g].items[i];
        gsFlat.push(it);
        html += '<a class="gs-item" href="' + esc(it.href) + '" data-gs-idx="' + idx + '">' +
          '<span class="gs-item-title">' + esc(it.title) + '</span>' +
          (it.sub ? '<span class="gs-item-sub">' + esc(it.sub) + '</span>' : "") +
          '</a>';
        idx++;
      }
      html += '</div>';
    }
    gsResults.innerHTML = html;
    gsSetActive(0);
  }

  function gsIsOpen() { return !gsOverlay.hasAttribute("hidden"); }
  function gsOpenFn() {
    gsOverlay.removeAttribute("hidden");
    document.body.classList.add("gs-lock");
    gsInput.value = "";
    gsResults.innerHTML = "";
    gsFlat = [];
    gsActive = -1;
    gsInput.focus();
  }
  function gsCloseFn() {
    gsOverlay.setAttribute("hidden", "");
    document.body.classList.remove("gs-lock");
  }

  document.getElementById("gsOpen").addEventListener("click", gsOpenFn);
  document.getElementById("gsClose").addEventListener("click", gsCloseFn);
  gsOverlay.addEventListener("mousedown", function (e) {
    if (e.target === gsOverlay) gsCloseFn();
  });
  gsInput.addEventListener("input", gsRender);
  gsInput.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); gsSetActive(gsActive + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); gsSetActive(gsActive - 1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      var pick = gsFlat[gsActive] || gsFlat[0];
      if (pick) location.href = pick.href;
    }
  });
  // Mouse hover follows the keyboard highlight so Enter always matches what's lit.
  gsResults.addEventListener("mousemove", function (e) {
    var a = e.target && e.target.closest ? e.target.closest(".gs-item") : null;
    if (a) {
      var idx = Number(a.getAttribute("data-gs-idx"));
      if (!isNaN(idx) && idx !== gsActive) gsSetActive(idx);
    }
  });
  // Keep results fresh after a background sync without wiping typed text.
  document.addEventListener("lunde:synced", function () {
    if (gsIsOpen() && (gsInput.value || "").trim()) gsRender();
  });

  function isTypingTarget(el) {
    if (!el) return false;
    var tag = (el.tagName || "").toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
  }
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      if (gsIsOpen()) gsCloseFn(); else gsOpenFn();
      return;
    }
    if (e.key === "Escape" && gsIsOpen()) { e.preventDefault(); gsCloseFn(); return; }
    if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !gsIsOpen() && !isTypingTarget(e.target)) {
      e.preventDefault();
      gsOpenFn();
    }
  });

  window.lundeSession = session;
})();
