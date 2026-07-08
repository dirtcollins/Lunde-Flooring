/* Lunde — shared address autocomplete widget.
   Usage: window.lundeAddressAutocomplete(input, { onSelect: function (parts) {} })
   - Suggestions come from Geoapify's geocoder (building-level house numbers),
     biased toward Bakersfield, CA. US results only.
   - parts = { line1, city, state, zip, full }. Without onSelect, the input is
     set to parts.full ("line1, city, state zip").
   - Fails silently on any network/API problem — the field always keeps working
     as a plain text input. This file must never break a form. */
(function () {
  "use strict";
  if (window.lundeAddressAutocomplete) return;

  var API = "https://api.geoapify.com/v1/geocode/autocomplete";
  /* Public client key — restrict it to lundeflooring.com in the Geoapify dashboard. */
  var API_KEY = "d1e253f7dace4866b96427a61edd4ab0";
  var BIAS = "&filter=countrycode:us&bias=proximity:-119.0187,35.3733"; /* US only, Bakersfield first */
  var MIN_CHARS = 4;
  var DEBOUNCE_MS = 250;

  var STATE_ABBR = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA",
    "colorado": "CO", "connecticut": "CT", "delaware": "DE", "district of columbia": "DC",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID", "illinois": "IL",
    "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiana": "LA",
    "maine": "ME", "maryland": "MD", "massachusetts": "MA", "michigan": "MI",
    "minnesota": "MN", "mississippi": "MS", "missouri": "MO", "montana": "MT",
    "nebraska": "NE", "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
    "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
    "ohio": "OH", "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA",
    "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", "tennessee": "TN",
    "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY"
  };
  function stateAbbr(name) {
    var s = String(name || "").trim();
    if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
    return STATE_ABBR[s.toLowerCase()] || s;
  }

  function injectStyles() {
    if (document.getElementById("laa-styles")) return;
    var css =
      ".laa-panel{position:absolute;z-index:9999;background:#fff;border:1px solid #ccc;border-radius:0;" +
      "box-shadow:0 6px 18px rgba(0,0,0,.08);font-size:14px;line-height:1.35;max-height:264px;" +
      "overflow-y:auto;text-align:left}" +
      ".laa-item{display:block;padding:8px 12px;cursor:pointer}" +
      ".laa-item:hover,.laa-item.laa-active{background:#f5f2ec}" +
      ".laa-line1{display:block;color:#1c1a17;font-weight:600}" +
      ".laa-line2{display:block;color:#6b665e;font-size:12.5px}";
    var tag = document.createElement("style");
    tag.id = "laa-styles";
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  /* Build {line1, city, state, zip, full, lat, lon} from a Geoapify feature's properties. */
  function partsFrom(p) {
    var line1 = String(p.address_line1 || "").trim();
    if (!line1) line1 = [p.housenumber, p.street].filter(Boolean).join(" ").trim();
    if (!line1) line1 = String(p.name || "").trim();
    var city = String(p.city || p.town || p.village || "").trim();
    var state = String(p.state_code || "").trim().toUpperCase() || stateAbbr(p.state);
    var zip = String(p.postcode || "").trim().split(";")[0];
    var full = line1;
    if (city) full += ", " + city;
    if (state) full += ", " + state;
    if (zip) full += " " + zip;
    var lat = Number(p.lat), lon = Number(p.lon);
    return { line1: line1, city: city, state: state, zip: zip, full: full,
      lat: isFinite(lat) ? lat : null, lon: isFinite(lon) ? lon : null };
  }

  window.lundeAddressAutocomplete = function (input, opts) {
    try {
      if (!input || typeof window.fetch !== "function") return;
      if (input.getAttribute("data-laa") === "1") return; /* already attached */
      input.setAttribute("data-laa", "1");
      opts = opts || {};
      injectStyles();

      var parent = input.parentNode || document.body;
      if (window.getComputedStyle && window.getComputedStyle(parent).position === "static") {
        parent.style.position = "relative";
      }
      var panel = document.createElement("div");
      panel.className = "laa-panel";
      panel.hidden = true;
      parent.appendChild(panel);

      var items = [];      /* parts objects for current suggestions */
      var active = -1;     /* keyboard-highlighted row */
      var timer = null;
      var controller = null;

      function position() {
        panel.style.left = input.offsetLeft + "px";
        panel.style.top = (input.offsetTop + input.offsetHeight + 2) + "px";
        panel.style.minWidth = input.offsetWidth + "px";
        panel.style.maxWidth = Math.max(input.offsetWidth, 280) + "px";
      }

      function close() {
        panel.hidden = true;
        panel.innerHTML = "";
        items = [];
        active = -1;
      }

      /* OSM frequently knows the street but not the individual house number.
         When the chosen suggestion has no leading number and the user typed
         one ("11933 Forsyth Court…"), keep the typed number in the result. */
      function withTypedNumber(parts) {
        if (!parts || /^\d/.test(parts.line1 || "")) return parts;
        var m = String(input.value || "").match(/^\s*(\d+[a-zA-Z]?(?:[\/-]\d+[a-zA-Z]?)?)\s+\S/);
        if (!m) return parts;
        var line1 = (m[1] + " " + (parts.line1 || "")).trim();
        var full = line1;
        if (parts.city) full += ", " + parts.city;
        if (parts.state) full += ", " + parts.state;
        if (parts.zip) full += " " + parts.zip;
        return { line1: line1, city: parts.city, state: parts.state, zip: parts.zip, full: full, lat: parts.lat, lon: parts.lon };
      }

      function select(i) {
        var parts = withTypedNumber(items[i]);
        if (!parts) return;
        close();
        if (typeof opts.onSelect === "function") {
          try { opts.onSelect(parts); } catch (e) {}
        } else {
          input.value = parts.full;
        }
        try { input.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
      }

      function setActive(i) {
        var rows = panel.children;
        if (active >= 0 && rows[active]) rows[active].className = "laa-item";
        active = i;
        if (active >= 0 && rows[active]) {
          rows[active].className = "laa-item laa-active";
          if (rows[active].scrollIntoView) rows[active].scrollIntoView({ block: "nearest" });
        }
      }

      function renderPanel() {
        if (!items.length) { close(); return; }
        panel.innerHTML = "";
        items.forEach(function (parts, i) {
          var row = document.createElement("div");
          row.className = "laa-item";
          var a = document.createElement("span");
          a.className = "laa-line1";
          var shown = withTypedNumber(parts);
          a.textContent = shown.line1 || shown.full;
          var b = document.createElement("span");
          b.className = "laa-line2";
          b.textContent = [parts.city, parts.state].filter(Boolean).join(", ") + (parts.zip ? " " + parts.zip : "");
          row.appendChild(a);
          row.appendChild(b);
          /* mousedown (not click) so selection lands before the input blurs */
          row.addEventListener("mousedown", function (e) { e.preventDefault(); select(i); });
          panel.appendChild(row);
        });
        active = -1;
        position();
        panel.hidden = false;
      }

      function search(q) {
        if (controller && controller.abort) controller.abort(); /* drop stale request */
        controller = (typeof AbortController === "function") ? new AbortController() : null;
        var url = API + "?text=" + encodeURIComponent(q) + "&limit=5&lang=en&apiKey=" + API_KEY + BIAS;
        fetch(url, controller ? { signal: controller.signal } : undefined)
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            if (input.value.trim() !== q) return; /* user kept typing — stale */
            var feats = (data && data.features) || [];
            items = [];
            var seen = {};
            for (var i = 0; i < feats.length; i++) {
              var p = (feats[i] && feats[i].properties) || {};
              if (String(p.country_code || p.countrycode || "").toUpperCase() !== "US") continue; /* US only */
              var parts = partsFrom(p);
              if (!parts.line1 || seen[parts.full]) continue;
              seen[parts.full] = 1;
              items.push(parts);
            }
            renderPanel();
          })
          .catch(function () { /* network/abort — fail silently */ });
      }

      input.addEventListener("input", function () {
        var q = input.value.trim();
        if (timer) clearTimeout(timer);
        if (q.length < MIN_CHARS) { close(); return; }
        timer = setTimeout(function () { search(q); }, DEBOUNCE_MS);
      });

      input.addEventListener("keydown", function (e) {
        if (panel.hidden) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActive(Math.min(active + 1, items.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setActive(Math.max(active - 1, 0));
        } else if (e.key === "Enter") {
          if (active >= 0) { e.preventDefault(); select(active); } else close();
        } else if (e.key === "Escape") {
          /* keep Escape local so it doesn't also close a parent <dialog> */
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      });

      /* small delay so a suggestion click lands before the panel closes */
      input.addEventListener("blur", function () { setTimeout(close, 160); });
      window.addEventListener("resize", function () { if (!panel.hidden) position(); });
    } catch (err) { /* never break the page over autocomplete */ }
  };
})();
