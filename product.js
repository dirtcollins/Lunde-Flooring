/* Lunde V6 — product detail page */
(function () {
  var L = window.lunde;
  var products = function () { return window.LUNDE_PUBLIC_PRODUCTS || L.products().filter(function (p) { return !p.archived; }); };
  var money = L.money, sqftPerCarton = L.sqftPerCarton, cartonPrice = L.cartonPrice;
  var updateEntry = L.updateEntry, cart = L.cart;

  var params = new URLSearchParams(location.search);
  var slug = params.get("slug");
  var product = products().find(function (p) { return p.slug === slug; });
  var mount = document.getElementById("pdpMount");
  if (!product) {
    if (mount) mount.innerHTML = '<div class="v6-empty"><h1>Floor not found</h1><p>We couldn’t find that floor. It may have been renamed or is no longer available.</p><a class="btn" href="./catalog.html">Browse all floors</a></div>';
    document.title = "Floor not found | Lunde Flooring Co.";
    return;
  }
  document.title = product.title + " | LVP Flooring in Bakersfield | Lunde Flooring Co.";
  if (L.trackRecentlyViewed) L.trackRecentlyViewed(product.id);

  var dims = L.parseDims(product);
  var stock = L.stockInfo(product.id);
  var cartonSqft = sqftPerCarton(product);
  var baseCartonPrice = cartonPrice(product);
  var startingArea = cartonSqft >= 24 ? 100 : Math.ceil(cartonSqft * 5);
  var waste = 10;

  var materialType = "Crafted Luxury Vinyl Plank";
  var waterResistance = /waterproof|spc|rigid/i.test((product.specs.core || "") + " " + (product.specs.construction || "")) ? "Waterproof" : "See guidance";
  var gradePhrase = product.specs.installationGrade ? product.specs.installationGrade.toLowerCase().replace("above, on, below", "above, on, or below grade") : "residential use";
  var installPhrase = (product.specs.installationMethod || "").toUpperCase().indexOf("GLUE") > -1 ? "as a floating floor or with direct glue" : "as a floating floor";
  var installShort = (product.specs.installationMethod || "").toUpperCase().indexOf("GLUE") > -1 ? "Float or glue" : "Floating click";

  function icn(name) {
    var i = {
      shield: '<path d="M12 3 20 6v6c0 5-3 8-8 10-5-2-8-5-8-10V6l8-3Z"></path><path d="m8 12 3 3 5-6"></path>',
      ruler: '<rect x="3" y="8" width="18" height="8" rx="1"></rect><path d="M7 8v3M11 8v4M15 8v3M19 8v4"></path>',
      layers: '<path d="M12 3 3 7l9 4 9-4-9-4Z"></path><path d="M3 12l9 4 9-4M3 17l9 4 9-4"></path>',
      box: '<path d="m12 3 8 4-8 4-8-4 8-4Z"></path><path d="M4 7v10l8 4 8-4V7"></path><path d="M12 11v10"></path>',
      wrench: '<path d="M21 5a6 6 0 0 1-7.5 7.8L6 20l-2-2 7.2-7.5A6 6 0 0 1 19 3l-3.2 3.2 2 2L21 5Z"></path>',
      truck: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"></path><circle cx="7" cy="18" r="1.6"></circle><circle cx="17" cy="18" r="1.6"></circle>',
      check: '<path d="M4 12l5 5L20 6"></path>',
      medal: '<circle cx="12" cy="9" r="6"></circle><path d="M9 14l-2 7 5-3 5 3-2-7"></path>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">' + (i[name] || i.box) + '</svg>';
  }
  function heart() { return '<svg viewBox="0 0 24 22"><path d="M12 20.5 3.4 12.2a5.4 5.4 0 0 1 0-7.7 5.2 5.2 0 0 1 7.4 0l1.2 1.2 1.2-1.2a5.2 5.2 0 0 1 7.4 0 5.4 5.4 0 0 1 0 7.7Z"></path></svg>'; }

  var gallery = product.gallery || [{ label: "Product sample", url: product.mainImage }];
  var fit = product.imageFit ? ';background-size:' + product.imageFit : '';
  var highlights = [
    { ic: "shield", k: "Water resistance", v: waterResistance },
    { ic: "ruler", k: "Thickness", v: product.specs.thickness },
    { ic: "layers", k: "Wear layer", v: (product.specs.wearLayer || "").replace(/wear layer/i, "").trim() || product.specs.wearLayer },
    { ic: "box", k: "Per carton", v: product.specs.squareFootagePerCarton },
    { ic: "wrench", k: "Installation", v: installShort },
    { tone: true, k: "Color tone", v: product.color }
  ];
  var specGroups = [
    { title: "Dimensions", rows: [
      ["Length", dims.l ? dims.l + "″" : product.specs.dimensions],
      ["Width", dims.w ? dims.w + "″" : product.specs.dimensions],
      ["Thickness", product.specs.thickness],
      ["Plank format", product.specs.dimensions],
      ["Sq. ft. / carton", product.specs.squareFootagePerCarton],
      ["Carton price", money(baseCartonPrice)]
    ]},
    { title: "Materials", rows: [
      ["Material", materialType], ["Collection", product.collection], ["Color tone", product.color],
      ["Finish", product.specs.finish], ["Wear layer", product.specs.wearLayer], ["Core", product.specs.core],
      ["Edge profile", product.specs.edgeProfile], ["Attached pad", product.specs.underlayment],
      ["SKU", product.sku], ["Origin", product.specs.countryOfOrigin]
    ]},
    { title: "Install & warranty", rows: [
      ["Installation", product.specs.installationMethod || "See guide"],
      ["Grade", product.specs.installationGrade || "See guide"],
      ["Water resistance", waterResistance],
      ["Use", (product.specs.wearLayer || "").toLowerCase().indexOf("commercial") > -1 ? "Residential / commercial" : "Residential"],
      ["Samples", money(product.samplePrice) + " each"],
      ["Availability", product.availability],
      ["Warranty", "Lifetime residential"]
    ]}
  ];
  var detailBullets = [
    product.specs.dimensions + " format with " + product.specs.thickness + " overall thickness.",
    product.specs.squareFootagePerCarton + " per carton, priced at " + money(baseCartonPrice) + " per carton.",
    (product.specs.installationMethod || "Manufacturer-guided installation") + " for " + gradePhrase + ".",
    product.specs.finish + " with " + (product.specs.edgeProfile || "bevel") + " edge detail."
  ];

  /* format diagram sizing */
  var formatHtml = "";
  if (dims.w && dims.l) {
    var scale = Math.min(280 / dims.l, 64 / dims.w);
    var barW = Math.round(dims.l * scale), barH = Math.max(14, Math.round(dims.w * scale));
    var feet = dims.l % 12 === 0 ? (dims.l / 12) + " ft" : (dims.l / 12).toFixed(1) + " ft";
    formatHtml =
      '<div class="pdp-format">' +
        '<div class="pdp-format-h"><p>Plank size</p><span>' + product.specs.thickness + ' thick</span></div>' +
        '<div class="pdp-bar" style="width:' + barW + 'px;height:' + barH + 'px"><span class="pdp-bar-tex" style="background-image:url(\'' + (product.barImage || product.mainImage) + '\')' + (product.barImage ? ';background-size:cover' : '') + '"></span></div>' +
        '<div class="pdp-dim-h" style="width:' + barW + 'px"><i></i><span>' + dims.l + '″ · ' + feet + '</span><i></i></div>' +
      '</div>';
  }

  var favPressed = L.isFavorite(product.id) ? "true" : "false";

  mount.innerHTML =
    '<nav class="pdp-crumb" aria-label="Breadcrumb"><a href="./index.html">Home</a><span class="sep">/</span><a href="./catalog.html">Floors</a><span class="sep">/</span><span class="cur">' + product.title + '</span></nav>' +

    '<div class="pdp-top" data-screen-label="Product: ' + product.title + '">' +
      '<div class="pdp-gallery">' +
        '<div class="pdp-thumbs" id="pdpThumbs">' +
          gallery.map(function (g, i) {
            return '<button class="pdp-thumb" type="button" data-thumb="' + i + '" aria-pressed="' + (i === 0 ? "true" : "false") + '" aria-label="View ' + g.label + '" title="' + g.label + '"><span class="swatch" style="background-image:url(\'' + g.url + '\')' + fit + '"></span></button>';
          }).join("") +
        '</div>' +
        '<div class="pdp-main' + (gallery.length > 1 ? '' : ' is-single') + '">' +
          '<div class="swatch" id="pdpMainImg" style="background-image:url(\'' + gallery[0].url + '\')' + fit + '"></div>' +
          '<button class="pdp-fav" id="pdpFav" type="button" aria-pressed="' + favPressed + '" aria-label="Save ' + product.title + '">' + heart() + '</button>' +
          '<span class="pdp-main-tag"><i style="background-image:url(\'' + product.mainImage + '\')"></i>' + product.color + ' tone</span>' +
          (gallery.length > 1 ?
            '<button class="pdp-nav prev" type="button" id="pdpPrev" aria-label="Previous image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 6l-6 6 6 6"></path></svg></button>' +
            '<button class="pdp-nav next" type="button" id="pdpNext" aria-label="Next image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 6l6 6-6 6"></path></svg></button>' +
            '<div class="pdp-dots" id="pdpDots">' + gallery.map(function (g, i) { return '<span class="pdp-dot' + (i === 0 ? " on" : "") + '" data-dot="' + i + '"></span>'; }).join("") + '</div>'
          : "") +
        '</div>' +
      '</div>' +

      '<aside class="pdp-buy" aria-label="Purchase ' + product.title + '">' +
        '<span class="pdp-status"><i></i>' + stock.text + '</span>' +
        '<p class="eyebrow pdp-coll">' + product.collection + '</p>' +
        '<h1 class="pdp-title">' + product.title + '</h1>' +
        '<div class="pdp-price-row"><span class="pdp-price">' + money(product.pricePerSqft) + '<small> / sq. ft.</small></span><span class="pdp-carton">' + money(baseCartonPrice) + ' / carton · ' + product.specs.squareFootagePerCarton + '</span></div>' +
        '<p class="pdp-desc">' + product.description + '</p>' +

        '<div class="pdp-calc">' +
          '<p class="pdp-calc-h">Calculate your order</p>' +
          '<label class="pdp-field"><input id="pdpArea" type="number" min="1" step="1" value="' + startingArea + '" aria-label="Square feet"><span>sq. ft.</span></label>' +
          '<div class="pdp-waste"><p class="pdp-waste-lab">Add a waste factor for cuts &amp; repairs</p>' +
            '<div class="pdp-seg" role="group" aria-label="Waste factor">' +
              [5, 10, 15].map(function (v) { return '<button type="button" data-waste="' + v + '" aria-pressed="' + (v === waste ? "true" : "false") + '">' + v + '%</button>'; }).join("") +
            '</div>' +
          '</div>' +
          '<div class="pdp-summary">' +
            '<div><span>Cartons (' + cartonSqft.toFixed(2) + ' sq. ft. each)</span><b id="pdpCartons">0</b></div>' +
            '<div><span>Coverage with <span id="pdpWasteLabel">' + waste + '</span>% waste</span><b id="pdpCoverage">0 sq. ft.</b></div>' +
          '</div>' +
          '<div class="pdp-total"><span>Total</span><b id="pdpTotal">$0.00</b></div>' +
          '<div class="pdp-actions">' +
            '<button class="btn lg" id="pdpAddCart" type="button">Add to cart</button>' +
            '<button class="btn ghost" id="pdpSample" type="button">Order a sample — ' + money(product.samplePrice) + ', ships free</button>' +
          '</div>' +
          '<div class="pdp-assure-mini">' +
            '<span>' + icn("truck") + 'Ships in 2 days</span>' +
            '<span>' + icn("shield") + 'Waterproof core</span>' +
            '<span>' + icn("medal") + 'Lifetime warranty</span>' +
          '</div>' +
        '</div>' +
        formatHtml +
      '</aside>' +
    '</div>' +

    '<section class="section" style="padding-block:0 clamp(56px,7vw,104px)">' +
      '<div class="pdp-highlights">' +
        highlights.map(function (h) {
          var ic = h.tone ? '<span class="ic tone" style="background-image:url(\'' + product.mainImage + '\')"></span>' : '<span class="ic">' + icn(h.ic) + '</span>';
          return '<div class="pdp-hl">' + ic + '<span class="pdp-hl-k">' + h.k + '</span><span class="pdp-hl-v">' + (h.v || "See guide") + '</span></div>';
        }).join("") +
      '</div>' +
    '</section>' +

    '<section class="section band-2"><div class="wrap pdp-details">' +
      '<div class="pdp-details-media"><div class="swatch" style="background-image:url(\'' + (gallery[1] ? gallery[1].url : product.mainImage) + '\')' + fit + '"></div></div>' +
      '<div class="pdp-details-copy"><p class="eyebrow">The details</p><h2 class="display">What to know before you order.</h2>' +
        '<p class="lede">' + product.description + '</p>' +
        '<ul class="pdp-details-list">' + detailBullets.map(function (b) { return '<li>' + b + '</li>'; }).join("") + '</ul>' +
      '</div>' +
    '</div></section>' +

    '<section class="section"><div class="wrap">' +
      '<div class="section-head" style="margin-bottom:clamp(32px,4vw,52px)"><p class="eyebrow">Full specification</p><h2 class="display">Every detail, on the record.</h2></div>' +
      '<div class="pdp-specs">' +
        specGroups.map(function (g) {
          return '<div class="pdp-spec-col"><h3>' + g.title + '</h3><dl>' +
            g.rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + (r[1] || "Not listed") + '</dd></div>'; }).join("") +
          '</dl></div>';
        }).join("") +
      '</div>' +
    '</div></section>' +

    '<section class="section band-2"><div class="wrap">' +
      '<div class="section-head" style="margin-bottom:clamp(32px,4vw,52px)"><p class="eyebrow">Installation &amp; care</p><h2 class="display">Install today, live on it tonight.</h2></div>' +
      '<div class="pdp-install">' +
        '<article><div class="media"><img src="./media/new-site/hostinger-v7/web/install-video-still.webp" srcset="./media/new-site/hostinger-v7/web/install-video-still-800.webp 800w, ./media/new-site/hostinger-v7/web/install-video-still.webp 1400w" sizes="(max-width: 860px) calc(100vw - 32px), 50vw" alt="Installing ' + product.title + '" loading="lazy"><span class="play"></span></div>' +
          '<h3>Install &amp; floor prep</h3><p>' + product.title + ' installs ' + installPhrase + ', rated for ' + gradePhrase + '. Check subfloor flatness, expansion spacing, and moisture before placing material.</p></article>' +
        '<article><div class="media"><img src="./media/new-site/hostinger-v7/web/care-maintenance.webp" srcset="./media/new-site/hostinger-v7/web/care-maintenance-800.webp 800w, ./media/new-site/hostinger-v7/web/care-maintenance.webp 960w" sizes="(max-width: 860px) calc(100vw - 32px), 50vw" alt="Caring for a luxury vinyl floor" loading="lazy"></div>' +
          '<h3>Care &amp; maintenance</h3><p>Sweep regularly and damp mop with a pH-neutral cleaner — no wax, no polish, no steam. Felt pads and entry mats keep the wear layer looking new.</p></article>' +
      '</div>' +
    '</div></section>' +

    '<section class="section"><div class="wrap pdp-details">' +
      '<div class="section-head"><p class="eyebrow">Bakersfield &amp; Kern County</p><h2 class="display">Local delivery &amp; availability</h2>' +
        '<p class="lede">' + product.title + ' is ' + (product.availability || 'available by the carton') + ', delivered locally across Bakersfield and Kern County. Free local delivery within 10 miles of Bakersfield — to your home or job site — with pickup available in town. Order free samples first to see it in your own light.</p>' +
        '<p style="margin-top:14px">Serving Bakersfield, Oildale, Rosedale, Shafter, Wasco, Delano, McFarland, Lamont, Arvin, Taft, Tehachapi, Frazier Park, Lake Isabella, Ridgecrest, and all of Kern County. ' +
        '<a class="link-underline" href="./areas-we-serve.html">See the areas we serve<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></a></p>' +
      '</div>' +
    '</div></section>' +

    '<section class="section"><div class="wrap">' +
      '<div class="v6-prod-head"><div class="section-head"><p class="eyebrow">You may also like</p><h2 class="display">Floors in the same spirit</h2></div>' +
        '<a class="link-underline" href="./catalog.html">View all floors<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></a></div>' +
      '<div class="v6-grid" id="pdpRelated"></div>' +
    '</div></section>' +

    '<div class="pdp-bar"><div class="pdp-bar-price"><b id="pdpBarTotal">$0.00</b><span id="pdpBarMeta">1 carton</span></div><button id="pdpBarCart" type="button">Add to cart</button></div>';

  document.body.classList.add("has-buybar");

  /* related products */
  (function () {
    var all = products();
    var rel = all.filter(function (p) { return p.collection === product.collection && p.id !== product.id; });
    if (rel.length < 4) rel = rel.concat(all.filter(function (p) { return p.id !== product.id && rel.indexOf(p) < 0; }));
    rel = rel.slice(0, 4);
    document.getElementById("pdpRelated").innerHTML = rel.map(function (p) {
      return '<a class="v6-card" href="./product.html?slug=' + p.slug + '">' +
        '<span class="v6-card-media"><span class="swatch" style="background-image:url(\'' + window.lunde.img(p.mainImage) + '\');position:absolute;inset:0"></span></span>' +
        '<span class="v6-card-body"><span class="v6-card-coll">' + p.collection + '</span><span class="v6-card-name">' + p.title + '</span>' +
        '<span class="v6-card-price"><b>' + money(p.pricePerSqft) + '</b><span> / sq. ft.</span></span></span></a>';
    }).join("");
  })();

  /* gallery — thumbs (desktop) + arrows / dots / swipe (mobile) */
  var mainImg = document.getElementById("pdpMainImg");
  var curIdx = 0;
  function go(i) {
    curIdx = (i + gallery.length) % gallery.length;
    mainImg.style.backgroundImage = "url('" + gallery[curIdx].url + "')";
    if (product.imageFit) mainImg.style.backgroundSize = product.imageFit;
    document.querySelectorAll("#pdpThumbs [data-thumb]").forEach(function (t) { t.setAttribute("aria-pressed", String(Number(t.dataset.thumb) === curIdx)); });
    var dots = document.getElementById("pdpDots");
    if (dots) dots.querySelectorAll("[data-dot]").forEach(function (d) { d.classList.toggle("on", Number(d.dataset.dot) === curIdx); });
  }
  document.getElementById("pdpThumbs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-thumb]"); if (!b) return;
    go(Number(b.dataset.thumb));
  });
  var pdpPrev = document.getElementById("pdpPrev"), pdpNext = document.getElementById("pdpNext"), pdpDots = document.getElementById("pdpDots");
  if (pdpPrev) pdpPrev.addEventListener("click", function () { go(curIdx - 1); });
  if (pdpNext) pdpNext.addEventListener("click", function () { go(curIdx + 1); });
  if (pdpDots) pdpDots.addEventListener("click", function (e) { var d = e.target.closest("[data-dot]"); if (d) go(Number(d.dataset.dot)); });
  if (gallery.length > 1) {
    var sx = 0, sy = 0, swiping = false, mainWrap = mainImg.parentNode;
    mainWrap.addEventListener("touchstart", function (e) { var t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; swiping = true; }, { passive: true });
    mainWrap.addEventListener("touchend", function (e) {
      if (!swiping) return; swiping = false;
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(curIdx + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }

  /* calculator */
  function currentCartons() {
    var area = Math.max(1, Number(document.getElementById("pdpArea").value) || startingArea);
    return Math.max(1, Math.ceil(area * (1 + waste / 100) / cartonSqft - 1e-6));
  }
  function update() {
    var cartons = currentCartons();
    document.getElementById("pdpWasteLabel").textContent = waste;
    document.getElementById("pdpCartons").textContent = cartons;
    document.getElementById("pdpCoverage").textContent = (cartons * cartonSqft).toFixed(1) + " sq. ft.";
    document.getElementById("pdpTotal").textContent = money(cartons * baseCartonPrice);
    document.getElementById("pdpBarTotal").textContent = money(cartons * baseCartonPrice);
    document.getElementById("pdpBarMeta").textContent = cartons + " carton" + (cartons === 1 ? "" : "s") + " · " + product.title;
  }
  document.getElementById("pdpArea").addEventListener("input", update);
  document.querySelectorAll("[data-waste]").forEach(function (b) {
    b.addEventListener("click", function () {
      waste = Number(b.dataset.waste) || 10;
      document.querySelectorAll("[data-waste]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      update();
    });
  });

  function toast(msg) {
    if (L.showToast) { try { L.showToast(msg, "View cart", L.openDrawer); return; } catch (e) {} }
  }
  function addCart() {
    var cartons = currentCartons();
    updateEntry(product.id, { sqft: Math.ceil(cartons * cartonSqft) });
    toast("Added " + cartons + " carton" + (cartons === 1 ? "" : "s") + " to cart");
  }
  document.getElementById("pdpAddCart").addEventListener("click", addCart);
  document.getElementById("pdpBarCart").addEventListener("click", addCart);
  document.getElementById("pdpSample").addEventListener("click", function () {
    var entry = cart()[product.id] || { sqft: 0, samples: 0 };
    updateEntry(product.id, { samples: (Number(entry.samples) || 0) + 1 });
    if (L.renderDrawer) L.renderDrawer();
    toast(product.title + " sample added");
  });
  document.getElementById("pdpFav").addEventListener("click", function (e) {
    var on = L.toggleFavorite(product.id);
    e.currentTarget.setAttribute("aria-pressed", String(on));
  });

  /* header shadow on scroll */
  var header = document.getElementById("v6Header");
  if (header) { window.addEventListener("scroll", function () {
    header.style.boxShadow = window.scrollY > 12 ? "0 1px 0 rgba(32,30,26,0.06), 0 10px 30px -22px rgba(32,30,26,0.5)" : "none";
  }, { passive: true }); }

  update();
})();
