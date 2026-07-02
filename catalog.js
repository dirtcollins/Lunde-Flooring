/* Lunde V6 — catalog / browse */
(function () {
  var L = window.lunde;
  var products = function () { return window.LUNDE_PUBLIC_PRODUCTS || L.products().filter(function (p) { return !p.archived; }); };
  var money = L.money, parseDims = L.parseDims, cartonPrice = L.cartonPrice, sqftPerCarton = L.sqftPerCarton;

  var TONE_ORDER = ["Blonde", "Greige", "Warm", "Natural"];
  var SORT = {
    featured: "Featured",
    priceLow: "Price, low to high",
    priceHigh: "Price, high to low",
    cartonHigh: "Coverage, high to low",
    name: "Name, A–Z"
  };
  var state = { query: "", collection: "All", type: "All", tone: "All", sort: "featured", fav: false, compare: new Set() };

  var grid = document.getElementById("catGrid");
  var countEl = document.getElementById("catCount");
  var selCollection = document.getElementById("selCollection");
  var selType = document.getElementById("selType");
  var selTone = document.getElementById("selTone");
  var selSort = document.getElementById("selSort");
  var favToggle = document.getElementById("favToggle");
  var searchEl = document.getElementById("catSearch");

  function shortColl(n) { return String(n || "").replace("AdoFloor ", ""); }
  function floorType() { return "Crafted Luxury Vinyl Plank"; }
  function norm(v) { return String(v || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim(); }
  function toneOrder(n) { var i = TONE_ORDER.indexOf(n); return i === -1 ? 99 : i; }

  function searchText(p) {
    return norm([p.title, p.sku, p.id, p.collection, p.style, p.color, p.availability, p.description, Object.values(p.specs || {}).join(" "), floorType(p)].join(" "));
  }
  function score(p, q) {
    var nq = norm(q); if (!nq) return 1;
    var t = norm(p.title), sku = norm(p.sku), text = searchText(p);
    var terms = nq.split(/\s+/).filter(function (x) { return x.length > 1; });
    if (!terms.length) return 0;
    var s = 0;
    if (t === nq || sku === nq) s += 80;
    if (t.indexOf(nq) > -1) s += 35;
    if (sku.indexOf(nq.replace(/\s/g, "")) > -1) s += 30;
    for (var i = 0; i < terms.length; i++) {
      var term = terms[i];
      if (t.indexOf(term) > -1) s += 18;
      else if (text.indexOf(term) > -1) s += 4;
      else return 0;
    }
    return s;
  }

  function heart() { return '<svg aria-hidden="true" viewBox="0 0 24 22"><path d="M12 20.5 3.4 12.2a5.4 5.4 0 0 1 0-7.7 5.2 5.2 0 0 1 7.4 0l1.2 1.2 1.2-1.2a5.2 5.2 0 0 1 7.4 0 5.4 5.4 0 0 1 0 7.7Z"></path></svg>'; }

  function buildSelect(sel, items, labels) {
    sel.innerHTML = items.map(function (v) { return '<option value="' + v + '">' + (labels ? labels(v) : v) + '</option>'; }).join("");
  }

  function fillFilters() {
    var collections = ["All"].concat(Array.from(new Set(products().map(function (p) { return p.collection; }))));
    var types = ["All"].concat(Array.from(new Set(products().map(floorType))).sort());
    var tones = ["All"].concat(Array.from(new Set(products().map(function (p) { return p.color; }))).sort(function (a, b) { return toneOrder(a) - toneOrder(b) || a.localeCompare(b); }));
    buildSelect(selCollection, collections, function (c) { return c === "All" ? "All series" : shortColl(c); });
    buildSelect(selType, types, function (t) { return t === "All" ? "All types" : t; });
    buildSelect(selTone, tones, function (t) { return t === "All" ? "All tones" : t; });
    buildSelect(selSort, Object.keys(SORT), function (k) { return SORT[k]; });
    selCollection.value = state.collection; selType.value = state.type; selTone.value = state.tone; selSort.value = state.sort;
  }

  function filtered() {
    var q = state.query.trim();
    return products()
      .filter(function (p) { return state.collection === "All" || p.collection === state.collection; })
      .filter(function (p) { return !state.fav || L.isFavorite(p.id); })
      .filter(function (p) { return state.type === "All" || floorType(p) === state.type; })
      .filter(function (p) { return state.tone === "All" || p.color === state.tone; })
      .map(function (p, i) { return { p: p, i: i, s: score(p, q) }; })
      .filter(function (x) { return x.s > 0; })
      .sort(function (a, b) {
        if (q && b.s !== a.s) return b.s - a.s;
        if (state.sort === "priceLow") return cartonPrice(a.p) - cartonPrice(b.p);
        if (state.sort === "priceHigh") return cartonPrice(b.p) - cartonPrice(a.p);
        if (state.sort === "cartonHigh") return sqftPerCarton(b.p) - sqftPerCarton(a.p);
        if (state.sort === "name") return a.p.title.localeCompare(b.p.title);
        return a.i - b.i;
      })
      .map(function (x) { return x.p; });
  }

  function card(p) {
    var d = parseDims(p);
    var barW = Math.max(20, Math.min(46, Math.round(d.l * 0.8)));
    var barH = Math.max(4, Math.min(13, Math.round(d.w * 0.9)));
    var pressed = L.isFavorite(p.id) ? "true" : "false";
    var checked = state.compare.has(p.id) ? "checked" : "";
    return '<article class="v6-card">' +
      '<a class="v6-card-media" href="./product.html?slug=' + p.slug + '" aria-label="' + p.title + '">' +
        '<span class="swatch" style="position:absolute;inset:0;background-image:url(\'' + L.img(p.mainImage) + '\')' + (p.imageFit ? ';background-size:' + p.imageFit : '') + '"></span>' +
        '<button class="v6-card-fav" type="button" data-fav="' + p.id + '" aria-pressed="' + pressed + '" aria-label="Save ' + p.title + '">' + heart() + '</button>' +
        '<label class="v6-card-compare" onclick="event.stopPropagation()"><input type="checkbox" data-compare="' + p.id + '" ' + checked + '> Compare</label>' +
      '</a>' +
      '<a class="v6-card-body" href="./product.html?slug=' + p.slug + '">' +
        '<span class="v6-card-coll">' + shortColl(p.collection) + '</span>' +
        '<span class="v6-card-name">' + p.title + '</span>' +
        '<span class="v6-card-size"><i style="width:' + barW + 'px;height:' + barH + 'px"></i>' + d.label + ' · ' + p.specs.thickness + '</span>' +
        '<span class="v6-card-price"><b>' + money(p.pricePerSqft) + '</b><span> / sq. ft.</span></span>' +
        '<span class="v6-card-carton">' + money(cartonPrice(p)) + ' / carton</span>' +
      '</a>' +
    '</article>';
  }

  function render() {
    var items = filtered();
    grid.innerHTML = items.length ? items.map(card).join("")
      : '<div class="cat-empty"><h3>' + (state.fav && !L.favorites().length ? "No favorites yet" : "No floors match") + '</h3><p>' + (state.fav && !L.favorites().length ? "Tap the heart on any floor to save it here." : "Try adjusting your filters or search.") + '</p></div>';
    countEl.textContent = items.length + " of " + products().length + " floors";
  }

  selCollection.addEventListener("change", function () { state.collection = this.value; render(); });
  selType.addEventListener("change", function () { state.type = this.value; render(); });
  selTone.addEventListener("change", function () { state.tone = this.value; render(); });
  selSort.addEventListener("change", function () { state.sort = this.value; render(); });
  favToggle.addEventListener("click", function () { state.fav = !state.fav; favToggle.setAttribute("aria-pressed", String(state.fav)); render(); });
  searchEl.addEventListener("input", function () { state.query = this.value; render(); });

  var urlQ = new URLSearchParams(location.search).get("q");
  if (urlQ) { state.query = urlQ; searchEl.value = urlQ; }

  grid.addEventListener("click", function (e) {
    var fav = e.target.closest("[data-fav]");
    if (fav) { e.preventDefault(); var on = L.toggleFavorite(fav.dataset.fav); fav.setAttribute("aria-pressed", String(on)); if (state.fav && !on) render(); return; }
  });

  /* compare */
  grid.addEventListener("change", function (e) {
    var box = e.target.closest("[data-compare]"); if (!box) return;
    var id = box.dataset.compare;
    if (box.checked) {
      if (state.compare.size >= 3) { box.checked = false; if (L.showToast) L.showToast("Compare up to 3 floors at a time"); return; }
      state.compare.add(id);
    } else state.compare.delete(id);
    renderTray();
  });

  var tray;
  function renderTray() {
    if (!state.compare.size) { if (tray) { tray.remove(); tray = null; } return; }
    if (!tray) { tray = document.createElement("div"); tray.className = "v6-compare-tray"; document.body.appendChild(tray); }
    var names = Array.from(state.compare).map(function (id) { return (L.productById(id) || {}).title; }).filter(Boolean);
    tray.innerHTML = '<span class="names"><b>Compare:</b> ' + names.join(" · ") + '</span>' +
      '<button class="btn" type="button" data-open-compare ' + (state.compare.size < 2 ? "disabled" : "") + '>Compare ' + state.compare.size + '</button>' +
      '<button class="btn ghost" type="button" data-clear-compare>Clear</button>';
  }

  var dlg;
  function openCompare() {
    var items = Array.from(state.compare).map(function (id) { return L.productById(id); }).filter(Boolean);
    if (items.length < 2) return;
    var rows = [
      ["Carton price", function (p) { return money(cartonPrice(p)) + " / carton"; }],
      ["Price / sq. ft.", function (p) { return money(p.pricePerSqft); }],
      ["Coverage", function (p) { return p.specs.squareFootagePerCarton; }],
      ["Size", function (p) { return parseDims(p).label; }],
      ["Thickness", function (p) { return p.specs.thickness; }],
      ["Wear layer", function (p) { return p.specs.wearLayer; }],
      ["Core", function (p) { return p.specs.core; }],
      ["Edge", function (p) { return (p.specs.edgeProfile || "").toLowerCase(); }],
      ["Tone", function (p) { return p.color; }]
    ];
    if (!dlg) { dlg = document.createElement("dialog"); dlg.className = "v6-compare-dialog"; document.body.appendChild(dlg); }
    var cols = "180px repeat(" + items.length + ", minmax(0,1fr))";
    dlg.innerHTML = '<div class="v6-compare-head"><h2>Compare floors</h2><button class="v6-compare-close" type="button" data-close-compare aria-label="Close">×</button></div>' +
      '<div class="v6-compare-table" style="grid-template-columns:' + cols + ';column-gap:20px">' +
        '<div class="v6-cmp-cell label"></div>' +
        items.map(function (p) { return '<div class="v6-cmp-cell v6-cmp-prod"><a href="./product.html?slug=' + p.slug + '"><span class="swatch" style="background-image:url(\'' + L.img(p.mainImage) + '\')"></span><strong>' + p.title + '</strong><span>' + shortColl(p.collection) + '</span></a></div>'; }).join("") +
        rows.map(function (r) {
          return '<div class="v6-cmp-cell label">' + r[0] + '</div>' + items.map(function (p) { return '<div class="v6-cmp-cell">' + (r[1](p) || "—") + '</div>'; }).join("");
        }).join("") +
      '</div>';
    dlg.showModal();
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-open-compare]")) openCompare();
    if (e.target.closest("[data-clear-compare]")) { state.compare.clear(); renderTray(); render(); }
    if (e.target.closest("[data-close-compare]")) dlg && dlg.close();
  });

  fillFilters();
  render();
})();
