/* Lunde V6/V7 — staff product editor */
(function () {
  var L = window.lunde, money = L.money;
  var mount = document.getElementById("peMount");
  var id = new URLSearchParams(location.search).get("id");
  var p = id ? L.productById(id) : null;

  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/"/g, "&quot;"); }
  if (!p) { mount.innerHTML = '<div class="app-head"><h1>Product not found</h1></div><a class="btn ghost" href="./products.html">Back</a>'; return; }

  function field(label, name, val, opts) {
    opts = opts || {};
    return '<label class="v6-field' + (opts.wide ? ' wide' : '') + '"><span>' + label + '</span><input name="' + name + '" value="' + esc(val) + '"' + (opts.type ? ' type="' + opts.type + '"' : '') + (opts.step ? ' step="' + opts.step + '"' : '') + (opts.readonly ? ' readonly style="color:var(--muted);background:var(--canvas)"' : '') + '></label>';
  }
  var s = p.specs;
  mount.innerHTML =
    '<a class="mo-back" href="./products.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M19 12H5M11 6l-6 6 6 6"></path></svg>All products</a>' +
    '<div class="app-head"><div><p class="eyebrow">Edit · ' + p.sku + '</p><h1>' + p.title + '</h1></div><a class="btn ghost" href="./product.html?slug=' + p.slug + '" style="min-height:44px">View on store ↗</a></div>' +
    '<form id="peForm" class="cols-2" style="align-items:start"><div style="display:grid;gap:18px">' +
      '<div class="panel"><div class="panel-head"><h2>Pricing</h2></div><div class="panel-pad v6-form"><div class="v6-field-row">' +
        field("Price / sq. ft. ($)", "pricePerSqft", p.pricePerSqft, { type: "number", step: "0.01" }) +
        field("Sample price ($)", "samplePrice", p.samplePrice, { type: "number", step: "0.01" }) +
      '</div></div></div>' +
      '<div class="panel"><div class="panel-head"><h2>Details</h2></div><div class="panel-pad v6-form"><div class="v6-field-row">' +
        field("Title", "title", p.title) + field("Color tone", "color", p.color) +
        field("Finish", "specs.finish", s.finish) + field("Wear layer", "specs.wearLayer", s.wearLayer) +
        field("Core", "specs.core", s.core) + field("Edge profile", "specs.edgeProfile", s.edgeProfile) +
        field("Dimensions", "specs.dimensions", s.dimensions) + field("Thickness", "specs.thickness", s.thickness) +
        field("Sq. ft. / carton", "specs.squareFootagePerCarton", s.squareFootagePerCarton) + field("SKU", "sku", p.sku, { readonly: true }) +
      '</div></div></div>' +
      '<div style="display:flex;gap:10px"><button class="btn" type="submit">Save changes</button><a class="btn ghost" href="./products.html">Cancel</a></div>' +
    '</div><div><div class="panel"><div class="panel-head"><h2>Preview</h2></div><div class="panel-pad">' +
      '<div class="swatch" style="aspect-ratio:1.1/1;background-image:url(\'' + p.mainImage + '\')"></div>' +
      '<p style="margin-top:14px;font-weight:600;font-size:16px">' + p.title + '</p><p class="row-sub">' + p.collection + '</p>' +
      '<p style="margin-top:6px;font-weight:700">' + money(p.pricePerSqft) + ' / sq. ft. · ' + money(L.cartonPrice(p)) + ' carton</p>' +
    '</div></div></div></form>';

  document.getElementById("peForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var fd = new FormData(e.target), patch = { specs: {} };
    fd.forEach(function (val, key) {
      if (key.indexOf("specs.") === 0) patch.specs[key.slice(6)] = val;
      else if (key === "pricePerSqft" || key === "samplePrice") patch[key] = parseFloat(val) || 0;
      else patch[key] = val;
    });
    L.updateProduct(p.id, patch);
    if (L.showToast) L.showToast("Product saved");
    setTimeout(function () { location.reload(); }, 300);
  });
})();
