/* Lunde Flooring Co. — sitewide SEO.
   Injects local-business structured data, canonical URL, and Open Graph /
   Twitter Card tags on every public page. Safe to load in <head> with defer;
   runs once and is a no-op if it has already run. Business facts live here so
   Name / Area / contact stay consistent (NAP) across the whole site. */
(function () {
  if (window.__lundeSeo) return;
  window.__lundeSeo = true;

  var SITE = "https://lundeflooring.com";
  var NAME = "Lunde Flooring Co.";
  var EMAIL = "orders@lundeflooring.com";
  var PHONE = "+1-661-444-2857";
  var IMAGE = SITE + "/media/new-site/hostinger-v7/web/hero-living.webp";
  var INSTAGRAM = "https://www.instagram.com/lundeflooring/";

  /* Central California service area. Kept in one place so every page and the
     sitemap describe the same footprint. */
  var COUNTIES = {
    "Kern County": [
      "Bakersfield", "Oildale", "Rosedale", "Seven Oaks", "Lamont", "Shafter",
      "Wasco", "Delano", "McFarland", "Arvin", "Taft", "Tehachapi",
      "Frazier Park", "Lake Isabella", "Kernville", "Ridgecrest",
      "California City", "Mojave", "Rosamond", "Buttonwillow"
    ],
    "Tulare County": [
      "Visalia", "Tulare", "Porterville", "Dinuba", "Exeter", "Farmersville",
      "Lindsay", "Woodlake", "Pixley", "Earlimart", "Tipton", "Springville",
      "Three Rivers"
    ],
    "Kings County": [
      "Hanford", "Lemoore", "Corcoran", "Avenal", "Armona", "Kettleman City",
      "Stratford"
    ],
    "San Luis Obispo County": [
      "San Luis Obispo", "Paso Robles", "Atascadero", "Arroyo Grande",
      "Pismo Beach", "Grover Beach", "Morro Bay", "Los Osos", "Nipomo",
      "Templeton", "Cambria", "Cayucos", "Santa Margarita", "Oceano", "San Miguel"
    ]
  };
  var CITIES = Object.keys(COUNTIES).reduce(function (all, county) {
    return all.concat(COUNTIES[county]);
  }, []);
  window.LUNDE_SERVICE_AREA = { cities: CITIES, counties: Object.keys(COUNTIES), byCounty: COUNTIES, region: "CA" };

  var head = document.head || document.getElementsByTagName("head")[0];

  /* ---- canonical + social meta ------------------------------------------ */
  function absUrl() {
    // Self-referencing canonical. Keep only meaningful params (slug, category).
    var path = location.pathname;
    var keep = [];
    (location.search.replace(/^\?/, "").split("&")).forEach(function (kv) {
      var k = kv.split("=")[0];
      if (k === "slug" || k === "category") keep.push(kv);
    });
    if (path === "/index.html") path = "/";
    return SITE + path + (keep.length ? "?" + keep.join("&") : "");
  }

  function metaGet(name, attr) {
    return document.querySelector("meta[" + (attr || "name") + '="' + name + '"]');
  }

  function ensure(sel, make) {
    var el = document.querySelector(sel);
    if (!el) { el = make(); head.appendChild(el); }
    return el;
  }

  var canonicalUrl = absUrl();
  var descEl = metaGet("description");
  var desc = descEl ? descEl.getAttribute("content") : "";
  var title = document.title || NAME;

  // canonical
  ensure('link[rel="canonical"]', function () {
    var l = document.createElement("link"); l.setAttribute("rel", "canonical"); return l;
  }).setAttribute("href", canonicalUrl);

  // Open Graph + Twitter — only add tags the page hasn't already declared,
  // so hand-authored per-page OG (e.g. product images) always wins.
  var og = [
    ["og:site_name", NAME, "property"],
    ["og:type", location.pathname === "/" || location.pathname === "/index.html" ? "website" : "article", "property"],
    ["og:title", title, "property"],
    ["og:description", desc, "property"],
    ["og:url", canonicalUrl, "property"],
    ["og:image", IMAGE, "property"],
    ["og:locale", "en_US", "property"],
    ["twitter:card", "summary_large_image", "name"],
    ["twitter:title", title, "name"],
    ["twitter:description", desc, "name"],
    ["twitter:image", IMAGE, "name"]
  ];
  og.forEach(function (row) {
    var attr = row[2];
    if (row[1] == null || row[1] === "") return;    // don't inject empty tags (e.g. blank og:description)
    if (metaGet(row[0], attr)) return;              // respect page-level tags
    var m = document.createElement("meta");
    m.setAttribute(attr, row[0]);
    m.setAttribute("content", row[1]);
    head.appendChild(m);
  });

  // geo meta — reinforces the Bakersfield / Kern County service area
  [["geo.region", "US-CA"], ["geo.placename", "Bakersfield, California"],
   ["ICBM", "35.3733, -119.0187"]].forEach(function (row) {
    if (metaGet(row[0])) return;
    var m = document.createElement("meta");
    m.setAttribute("name", row[0]); m.setAttribute("content", row[1]);
    head.appendChild(m);
  });

  /* ---- structured data (JSON-LD) ---------------------------------------- */
  function jsonld(obj) {
    var s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = JSON.stringify(obj);
    head.appendChild(s);
  }

  var areaServed = CITIES.map(function (c) {
    return { "@type": "City", name: c + ", CA" };
  });
  Object.keys(COUNTIES).forEach(function (county) {
    areaServed.push({ "@type": "AdministrativeArea", name: county + ", California" });
  });

  var business = {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "HomeGoodsStore"],
    "@id": SITE + "/#business",
    name: NAME,
    url: SITE,
    email: EMAIL,
    telephone: PHONE,
    image: IMAGE,
    logo: IMAGE,
    description:
      "Local luxury vinyl plank flooring supplier serving Central California — " +
      "Bakersfield and Kern County, plus Tulare, Kings, and San Luis Obispo counties. " +
      "Waterproof LVP, SPC and rigid core floors sold by the carton with local " +
      "delivery for homeowners and contractors.",
    areaServed: areaServed,
    address: { "@type": "PostalAddress", addressLocality: "Bakersfield", addressRegion: "CA", addressCountry: "US" },
    priceRange: "$$",
    knowsAbout: [
      "Luxury vinyl plank flooring", "Waterproof flooring", "SPC flooring",
      "Rigid core flooring", "Vinyl plank flooring", "Flooring delivery"
    ],
    sameAs: [INSTAGRAM]
  };

  var organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": SITE + "/#org",
    name: NAME,
    url: SITE,
    email: EMAIL,
    telephone: PHONE,
    logo: IMAGE,
    sameAs: [INSTAGRAM]
  };

  var website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": SITE + "/#website",
    url: SITE,
    name: NAME,
    publisher: { "@id": SITE + "/#org" },
    inLanguage: "en-US"
  };

  jsonld(business);
  jsonld(organization);
  jsonld(website);

  /* Breadcrumbs — declare via <body data-breadcrumb='[["Label","/url"],...]'>.
     The last crumb should be the current page (url optional). */
  var bc = document.body && document.body.getAttribute("data-breadcrumb");
  if (bc) {
    try {
      var items = JSON.parse(bc);
      jsonld({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map(function (it, i) {
          var entry = { "@type": "ListItem", position: i + 1, name: it[0] };
          if (it[1]) entry.item = it[1].indexOf("http") === 0 ? it[1] : SITE + it[1];
          return entry;
        })
      });
    } catch (e) { /* ignore malformed breadcrumb data */ }
  }

  /* FAQ — declare via <body data-faq='[["Q","A"],...]'>. Also used by pages
     that build their own FAQ list. */
  var faq = document.body && document.body.getAttribute("data-faq");
  if (faq) {
    try {
      var qa = JSON.parse(faq);
      if (qa.length) jsonld({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: qa.map(function (row) {
          return {
            "@type": "Question", name: row[0],
            acceptedAnswer: { "@type": "Answer", text: row[1] }
          };
        })
      });
    } catch (e) { /* ignore malformed faq data */ }
  }
})();
