/* Lunde V6 — staff app shell (auth guard + sidebar + topbar). Load at END of body. */
(function () {
  var SESSION_KEY = "lunde_staff_session_v1";
  var session = null;
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) {}
  var here = (location.pathname.split("/").pop() || "dashboard.html");
  if (!session) { location.href = "./login.html?next=" + encodeURIComponent(here); return; }

  var active = document.body.getAttribute("data-staff") || "";
  function ic(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' + p + '</svg>'; }
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

  var side =
    '<aside class="app-side">' +
      '<a class="app-brand" href="./dashboard.html">Lunde<small>Staff Console</small></a>' +
      '<nav class="app-nav">' + NAV.map(function (n) {
        return '<a href="./' + n[2] + '"' + (n[0] === active ? ' aria-current="page"' : '') + '>' + ic(n[3]) + n[1] + '</a>';
      }).join("") + '</nav>' +
      '<div class="app-side-foot"><div class="app-user"><span class="av">' + initials + '</span><span class="app-user-info"><b>' + (session.name || "Staff") + '</b><span>' + (session.role || "Staff") + '</span></span></div>' +
      '<button class="app-signout" type="button" id="appSignout">Sign out</button></div>' +
    '</aside><div class="app-scrim" id="appScrim"></div>';

  var topbar =
    '<header class="app-top"><button class="app-burger" type="button" id="appBurger">' + ic('<path d="M3 7h18M3 12h18M3 17h18"/>') + '</button>' +
    '<div class="app-top-spacer"></div><span class="app-top-date">' + dateStr + '</span>' +
    '<a class="app-top-date" href="./index.html" style="text-decoration:underline;text-underline-offset:3px">View store ↗</a></header>';

  // App-style bottom tab bar for phones: the four everyday destinations plus
  // "More", which opens the full sidebar menu (same as the burger).
  var TAB_KEYS = ["dashboard", "orders", "customers", "quotes"];
  var tabbar = '<nav class="app-tabbar" aria-label="Console navigation">' +
    NAV.filter(function (n) { return TAB_KEYS.indexOf(n[0]) > -1; }).map(function (n) {
      return '<a href="./' + n[2] + '"' + (n[0] === active ? ' aria-current="page"' : '') + '>' + ic(n[3]) + '<span>' + n[1] + '</span></a>';
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

  window.lundeSession = session;
})();
